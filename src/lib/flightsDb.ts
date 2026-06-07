import { ref, set, update, remove, get } from "firebase/database";
import { db } from "./firebase";
import { forFirebaseDb } from "./forFirebaseDb";
import type { Flight } from "../types";
import { coerceFlightFromDb, isQrfActive, mergeQrfHistory } from "./flightHelpers";
import {
    mergeHitosDataUnion,
    mergeMvtDataUnion,
    normalizeHitosData,
    normalizeMvtData,
} from "./flightDataNormalize";
import { buildFlightRtdbUpdate } from "./flightRtdbPatch";
/** Prefiere el registro con más campos de programación (evita que un patch parcial pise el vuelo). */
function flightRecordRichness(f: Flight): number {
    return [f.date, f.flt, f.std, f.dep, f.arr, f.reg].filter((s) => String(s ?? "").trim() !== "").length;
}

function pickNonEmptyStr(...vals: (string | undefined | null)[]): string {
    for (const v of vals) {
        const t = String(v ?? "").trim();
        if (t) return t;
    }
    return "";
}

/** Une dos lecturas del mismo `id` (p. ej. programación en `flights/0` y MVT en `flights/{id}`). */
function mergeFlightRecords(a: Flight, b: Flight): Flight {
    const richer = flightRecordRichness(a) >= flightRecordRichness(b) ? a : b;
    const thinner = richer === a ? b : a;
    const mvtA = a.mvtData ? normalizeMvtData(a.mvtData) : undefined;
    const mvtB = b.mvtData ? normalizeMvtData(b.mvtData) : undefined;
    const hitosA = a.hitosData ? normalizeHitosData(a.hitosData) : undefined;
    const hitosB = b.hitosData ? normalizeHitosData(b.hitosData) : undefined;
    const pickMvt = () => {
        if (!mvtB) return mvtA;
        if (!mvtA) return mvtB;
        return mergeMvtDataUnion(mvtA, mvtB);
    };
    const pickHitos = () => {
        if (!hitosB) return hitosA;
        if (!hitosA) return hitosB;
        return mergeHitosDataUnion(hitosA, hitosB);
    };
    return coerceFlightFromDb({
        ...richer,
        mvtData: pickMvt(),
        hitosData: pickHitos(),
        hitosCrewData: thinner.hitosCrewData ?? richer.hitosCrewData,
        cancelled: thinner.cancelled ?? richer.cancelled,
        cancellationReason: pickNonEmptyStr(thinner.cancellationReason, richer.cancellationReason),
        dailyReportObs: pickNonEmptyStr(thinner.dailyReportObs, richer.dailyReportObs),
        etd: pickNonEmptyStr(thinner.etd, richer.etd),
        rescheduleReason: pickNonEmptyStr(thinner.rescheduleReason, richer.rescheduleReason),
        qrfActive: isQrfActive(b) || isQrfActive(a) ? true : undefined,
        qrfReason: pickNonEmptyStr(b.qrfReason, a.qrfReason) || undefined,
        qrfHistory: mergeQrfHistory(a.qrfHistory, b.qrfHistory),
        alternoArr: pickNonEmptyStr(b.alternoArr, a.alternoArr) || undefined,
        alternoReason: pickNonEmptyStr(b.alternoReason, a.alternoReason) || undefined,
    });
}

/** Convierte snapshot de `flights` (array legacy o mapa por id) a lista de vuelos. */
export function parseFlightsSnapshot(data: unknown): Flight[] {
    if (data == null) return [];
    const rawEntries: { key: string; raw: Record<string, unknown> }[] = [];

    if (Array.isArray(data)) {
        data.forEach((raw, index) => {
            if (raw != null && typeof raw === "object") {
                rawEntries.push({ key: String(index), raw: raw as Record<string, unknown> });
            }
        });
    } else if (typeof data === "object") {
        for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
            if (raw != null && typeof raw === "object") {
                rawEntries.push({ key, raw: raw as Record<string, unknown> });
            }
        }
    } else {
        return [];
    }

    const byId = new Map<string, Flight>();
    for (const { key, raw } of rawEntries) {
        const f = coerceFlightFromDb(raw as unknown as Flight);
        if (!String(f.id ?? "").trim()) {
            f.id = key;
        }
        const id = String(f.id).trim();
        const prev = byId.get(id);
        byId.set(id, prev ? mergeFlightRecords(prev, f) : f);
    }
    return [...byId.values()];
}

export function isLegacyFlightsArray(data: unknown): boolean {
    return Array.isArray(data);
}

export function flightDbRef(flightId: string) {
    return ref(db, `flights/${flightId}`);
}

/** Guarda un vuelo en `flights/{id}` fusionando con lo ya en servidor (no borra MVT/Hitos). */
export async function saveFlight(flight: Flight): Promise<void> {
    const f = coerceFlightFromDb(flight);
    const id = String(f.id ?? "").trim();
    if (!id) throw new Error("Vuelo sin id");
    const snap = await get(flightDbRef(id));
    const existing = snap.val();
    if (existing != null && typeof existing === "object") {
        const merged = mergeFlightRecords(coerceFlightFromDb(existing as Flight), f);
        await set(flightDbRef(id), forFirebaseDb(merged));
    } else {
        await set(flightDbRef(id), forFirebaseDb(f));
    }
}

/**
 * Actualiza campos de un vuelo sin pisar MVT/Hitos no incluidos en el patch.
 * Lee el nodo actual, fusiona objetos anidados y escribe con rutas `mvtData/campo`, etc.
 */
export async function updateFlight(flightId: string, patch: Partial<Flight>): Promise<void> {
    const id = String(flightId ?? "").trim();
    if (!id) throw new Error("Vuelo sin id");

    const snap = await get(flightDbRef(id));
    const existing =
        snap.val() != null && typeof snap.val() === "object"
            ? coerceFlightFromDb(snap.val() as Flight)
            : null;

    const updates = buildFlightRtdbUpdate(patch, existing);
    if (Object.keys(updates).length === 0) return;

    await update(flightDbRef(id), updates);
}

export async function saveFlightsBatch(flights: Flight[]): Promise<void> {
    await Promise.all(flights.map((f) => saveFlight(f)));
}

export async function removeFlightsByIds(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    await Promise.all(unique.map((id) => remove(flightDbRef(id))));
}

/**
 * Migra `flights` de array a mapa `{ [id]: Flight }` (una escritura atómica del nodo).
 * Idempotente si ya está en formato mapa.
 */
export async function migrateFlightsArrayToMap(flights: Flight[]): Promise<void> {
    const snap = await get(ref(db, "flights"));
    const current = snap.val();
    if (current != null && !Array.isArray(current)) return;

    const map: Record<string, Flight> = {};
    for (const f of flights) {
        const norm = coerceFlightFromDb(f);
        if (norm.id) map[norm.id] = norm;
    }
    await set(ref(db, "flights"), forFirebaseDb(map));
}
