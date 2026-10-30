import {
    get,
    onValue,
    ref,
    remove,
    runTransaction,
    set,
    setPriority,
    setWithPriority,
    update,
    type DatabaseReference,
} from "firebase/database";
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
import { buildFlightRtdbUpdate, mergeFlightPatch } from "./flightRtdbPatch";
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
        planDeAccion: pickNonEmptyStr(thinner.planDeAccion, richer.planDeAccion),
        etd: pickNonEmptyStr(thinner.etd, richer.etd),
        rescheduleReason: pickNonEmptyStr(thinner.rescheduleReason, richer.rescheduleReason),
        qrfActive: isQrfActive(b) || isQrfActive(a) ? true : undefined,
        qrfReason: pickNonEmptyStr(b.qrfReason, a.qrfReason) || undefined,
        qrfHistory: mergeQrfHistory(a.qrfHistory, b.qrfHistory),
        alternoArr: pickNonEmptyStr(b.alternoArr, a.alternoArr) || undefined,
        alternoReason: pickNonEmptyStr(b.alternoReason, a.alternoReason) || undefined,
        claimTickets: a.claimTickets || b.claimTickets ? { ...b.claimTickets, ...a.claimTickets } : undefined,
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
            if (key.startsWith("_")) continue;
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

/** Prioridad = fecha tal como está guardada, para poder leer un día sin bajar el resto. */
function flightDatePriority(date: string | undefined | null): string | null {
    const stored = String(date ?? "").trim();
    return stored || null;
}

function briefingFileRef(flightId: string) {
    return ref(db, `flights/_briefing/${flightId}`);
}

export async function loadBriefingPhoto(flightId: string): Promise<string> {
    const id = String(flightId ?? "").trim();
    if (!id) return "";
    const snap = await get(briefingFileRef(id));
    return typeof snap.val() === "string" ? snap.val() : "";
}

export async function flightWithBriefingPhoto(flight: Flight): Promise<Flight> {
    const inline = String(flight.mvtData?.briefingPhoto ?? "").trim();
    if (inline) return flight;
    if (!flight.mvtData?.briefingOnFile) return flight;
    const photo = await loadBriefingPhoto(flight.id);
    if (!photo || !flight.mvtData) return flight;
    return { ...flight, mvtData: { ...flight.mvtData, briefingPhoto: photo } };
}

function flightWithoutInlineBriefing(flight: Flight): { flight: Flight; photo: string } {
    const photo = String(flight.mvtData?.briefingPhoto ?? "").trim();
    if (!photo || !flight.mvtData) return { flight, photo: "" };
    return {
        photo,
        flight: {
            ...flight,
            mvtData: { ...flight.mvtData, briefingPhoto: "", briefingOnFile: true },
        },
    };
}

async function relocateBriefingAndSetPriority(
    id: string,
    date: string,
    all: unknown,
): Promise<void> {
    const raw =
        all && typeof all === "object"
            ? (all as Record<string, { mvtData?: { briefingPhoto?: unknown } }>)[id]
            : undefined;
    const photo = String(raw?.mvtData?.briefingPhoto ?? "").trim();
    if (photo.length > 64) {
        await set(briefingFileRef(id), photo);
        await update(flightDbRef(id), {
            "mvtData/briefingPhoto": null,
            "mvtData/briefingOnFile": true,
        });
    }
    await setPriority(flightDbRef(id), date);
}

const PRIORITY_BACKFILL_KEY = "_datePriorityBackfill";
const priorityMarkerRef = ref(db, `flights/${PRIORITY_BACKFILL_KEY}`);

let priorityBackfillTask: Promise<void> | null = null;

function waitUntilPriorityBackfillDone(markerRef: DatabaseReference): Promise<void> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            unsub();
            resolve();
        }, 4 * 60 * 1000);
        const unsub = onValue(markerRef, (snap) => {
            const done = snap.val() && typeof snap.val() === "object" && (snap.val() as { done?: boolean }).done === true;
            if (!done) return;
            clearTimeout(timeout);
            unsub();
            resolve();
        });
    });
}

/**
 * Una sola vez: lee el historial y marca cada vuelo con prioridad = su fecha.
 * Las visitas siguientes consultan por esa prioridad y Firebase manda solo ese día.
 */
export function ensureFlightDatePriorities(): Promise<void> {
    if (!priorityBackfillTask) {
        priorityBackfillTask = runFlightDatePriorityBackfill().catch((error) => {
            priorityBackfillTask = null;
            throw error;
        });
    }
    return priorityBackfillTask;
}

async function runFlightDatePriorityBackfill(): Promise<void> {
    const existing = await get(priorityMarkerRef);
    const marker = existing.val() as { done?: boolean } | null;
    if (marker?.done === true) return;

    const tx = await runTransaction(priorityMarkerRef, (current) => {
        const cur = current as { done?: boolean; running?: boolean; runningAt?: number } | null;
        if (cur?.done) return;
        const age = Date.now() - Number(cur?.runningAt || 0);
        if (cur?.running && age < 3 * 60 * 1000) return;
        return { running: true, runningAt: Date.now(), done: false };
    });
    if (!tx.committed) {
        await waitUntilPriorityBackfillDone(priorityMarkerRef);
        return;
    }

    try {
        const snap = await get(ref(db, "flights"));
        const data = snap.val();
        const jobs: { id: string; date: string }[] = [];
        if (data && typeof data === "object" && !Array.isArray(data)) {
            for (const [id, raw] of Object.entries(data as Record<string, unknown>)) {
                if (!id || id.startsWith("_") || !raw || typeof raw !== "object") continue;
                const date = String((raw as { date?: unknown }).date ?? "").trim();
                if (!date) continue;
                jobs.push({ id, date });
            }
        }
        const chunkSize = 8;
        for (let i = 0; i < jobs.length; i += chunkSize) {
            const slice = jobs.slice(i, i + chunkSize);
            await Promise.all(slice.map((job) => relocateBriefingAndSetPriority(job.id, job.date, data)));
        }
        await set(priorityMarkerRef, { done: true, at: Date.now(), count: jobs.length });
    } catch (error) {
        await set(priorityMarkerRef, { running: false, done: false, at: Date.now() }).catch(() => undefined);
        throw error;
    }
}

/** Guarda un vuelo en `flights/{id}` fusionando con lo ya en servidor (no borra MVT/Hitos). */
export async function saveFlight(flight: Flight): Promise<void> {
    const f = coerceFlightFromDb(flight);
    const id = String(f.id ?? "").trim();
    if (!id) throw new Error("Vuelo sin id");
    const snap = await get(flightDbRef(id));
    const existing = snap.val();
    if (existing != null && typeof existing === "object") {
        const existingFlight = coerceFlightFromDb(existing as Flight);
        /** Unir MVT/Hitos sin perder datos; el guardado entrante gana en campos de programación (reg, ETD, ruta, etc.). */
        const merged = mergeFlightPatch(mergeFlightRecords(existingFlight, f), f);
        const stored = flightWithoutInlineBriefing(merged);
        await setWithPriority(flightDbRef(id), forFirebaseDb(stored.flight), flightDatePriority(stored.flight.date));
        if (stored.photo) await set(briefingFileRef(id), stored.photo);
    } else {
        const stored = flightWithoutInlineBriefing(f);
        await setWithPriority(flightDbRef(id), forFirebaseDb(stored.flight), flightDatePriority(stored.flight.date));
        if (stored.photo) await set(briefingFileRef(id), stored.photo);
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

    const incomingPhoto =
        patch.mvtData && Object.prototype.hasOwnProperty.call(patch.mvtData, "briefingPhoto")
            ? String(patch.mvtData.briefingPhoto ?? "").trim()
            : undefined;
    const patchForDb: Partial<Flight> =
        incomingPhoto === undefined || !patch.mvtData
            ? patch
            : {
                  ...patch,
                  mvtData: {
                      ...patch.mvtData,
                      briefingPhoto: "",
                      briefingOnFile: incomingPhoto.length > 0,
                  },
              };

    const updates = buildFlightRtdbUpdate(patchForDb, existing);
    if (incomingPhoto !== undefined) {
        updates["mvtData/briefingPhoto"] = null;
        updates["mvtData/briefingOnFile"] = incomingPhoto.length > 0;
    }
    console.log("flightsDb.ts updateFlight updates=", updates);
    if (Object.keys(updates).length === 0) return;

    await update(flightDbRef(id), updates);
    if (incomingPhoto !== undefined) {
        if (incomingPhoto) await set(briefingFileRef(id), incomingPhoto);
        else await remove(briefingFileRef(id));
    }
    const date = String(patch.date ?? existing?.date ?? "").trim();
    if (date) await setPriority(flightDbRef(id), date);
}

export async function saveFlightsBatch(flights: Flight[]): Promise<void> {
    await Promise.all(flights.map((f) => saveFlight(f)));
}

export async function removeFlightsByIds(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    await Promise.all(unique.map((id) => remove(flightDbRef(id))));
}

/**
 * Guarda una copia de seguridad en Firebase bajo `backup_deleted_flights`
 * antes de eliminar los vuelos.
 */
export async function backupAndDeleteFlights(flightsToDelete: Flight[]): Promise<void> {
    if (!flightsToDelete || flightsToDelete.length === 0) return;
    const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
    const dateTag = flightsToDelete[0]?.date || "desconocido";
    const backupRef = ref(db, `backup_deleted_flights/${dateTag}_${nowIso}`);

    const backupMap: Record<string, Flight> = {};
    for (const f of flightsToDelete) {
        if (f.id) {
            backupMap[f.id] = f;
        }
    }

    // 1. Guardar copia en Firebase
    await set(backupRef, forFirebaseDb(backupMap));

    // 2. Eliminar vuelos
    const ids = flightsToDelete.map((f) => f.id);
    await removeFlightsByIds(ids);
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

