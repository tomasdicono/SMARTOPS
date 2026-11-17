import { ref, set, update, remove, get } from "firebase/database";
import { db } from "./firebase";
import { forFirebaseDb } from "./forFirebaseDb";
import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { flightToSummary } from "./flightSummary";
import { briefingPhotoHash, briefingPhotoRef, saveBriefingPhoto } from "./briefingPhotoStore";
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

function summaryRef(iso: string, flightId: string) {
    return ref(db, `flightSummaries/${iso}/${flightId}`);
}

/** Saca la foto del objeto que se escribe en `flights/{id}`. */
export function flightWithoutInlinePhoto(flight: Flight): Flight {
    const photo = String(flight.mvtData?.briefingPhoto ?? "").trim();
    if (!photo) return flight;
    return {
        ...flight,
        hasBriefingPhoto: true,
        mvtData: flight.mvtData ? { ...flight.mvtData, briefingPhoto: "" } : flight.mvtData,
    };
}

/**
 * Deja la fecha ISO y el resumen al día.
 * `photo` en `"save"` copia la imagen a `briefingPhotos`. `"clear"` la borra.
 */
export async function syncFlightReadModel(
    flight: Flight,
    photo: "keep" | "save" | "clear" = "keep",
    photoValue = "",
    prevIso = "",
): Promise<void> {
    const id = String(flight.id ?? "").trim();
    const iso = flightDateToIso(flight);
    if (!id || !iso) return;

    let hasPhoto = Boolean(flight.hasBriefingPhoto);
    let rev = flight.briefingPhotoRev;
    const inline = photoValue.trim();
    if (photo === "save" && inline) {
        const nextRev = briefingPhotoHash(inline);
        if (nextRev !== rev) await saveBriefingPhoto(id, inline);
        hasPhoto = true;
        rev = nextRev;
    } else if (photo === "clear") {
        await saveBriefingPhoto(id, "");
        hasPhoto = false;
        rev = undefined;
    }

    const indexed: Flight = {
        ...flightWithoutInlinePhoto(flight),
        dateIso: iso,
        hasBriefingPhoto: hasPhoto || undefined,
        briefingPhotoRev: rev,
    };
    await update(flightDbRef(id), {
        dateIso: iso,
        hasBriefingPhoto: hasPhoto ? true : null,
        briefingPhotoRev: rev ?? null,
        ...(photo !== "keep" ? { "mvtData/briefingPhoto": null } : {}),
    });
    if (prevIso && prevIso !== iso) await remove(summaryRef(prevIso, id));
    await set(summaryRef(iso, id), forFirebaseDb(flightToSummary(indexed)));
}

/** Guarda un vuelo en `flights/{id}` fusionando con lo ya en servidor (no borra MVT/Hitos). */
export async function saveFlight(flight: Flight): Promise<void> {
    const f = coerceFlightFromDb(flight);
    const id = String(f.id ?? "").trim();
    if (!id) throw new Error("Vuelo sin id");
    const snap = await get(flightDbRef(id));
    const existing = snap.val();
    const existingFlight =
        existing != null && typeof existing === "object" ? coerceFlightFromDb(existing as Flight) : null;
    const merged = existingFlight ? mergeFlightPatch(mergeFlightRecords(existingFlight, f), f) : f;
    const inlinePhoto = String(merged.mvtData?.briefingPhoto ?? "").trim();
    const prevIso = existingFlight ? flightDateToIso(existingFlight) : "";
    const iso = flightDateToIso(merged);
    let rev = merged.briefingPhotoRev;
    let hasPhoto = Boolean(inlinePhoto || merged.hasBriefingPhoto);
    if (inlinePhoto) {
        rev = briefingPhotoHash(inlinePhoto);
        if (rev !== merged.briefingPhotoRev) await saveBriefingPhoto(id, inlinePhoto);
        hasPhoto = true;
    }
    const toStore = flightWithoutInlinePhoto({
        ...merged,
        dateIso: iso || undefined,
        hasBriefingPhoto: hasPhoto || undefined,
        briefingPhotoRev: rev,
    });
    await set(flightDbRef(id), forFirebaseDb(toStore));
    await syncFlightReadModel(toStore, "keep", "", prevIso);
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
    const prevIso = existing ? flightDateToIso(existing) : "";
    const merged = existing ? mergeFlightPatch(existing, patch) : coerceFlightFromDb(patch as Flight);
    const iso = flightDateToIso(merged);
    if (iso) updates.dateIso = iso;

    const incomingPhoto =
        patch.mvtData && Object.prototype.hasOwnProperty.call(patch.mvtData, "briefingPhoto")
            ? String(patch.mvtData.briefingPhoto ?? "").trim()
            : undefined;
    if (incomingPhoto) {
        const nextRev = briefingPhotoHash(incomingPhoto);
        if (nextRev !== existing?.briefingPhotoRev) {
            try {
                await saveBriefingPhoto(id, incomingPhoto);
                updates.briefingPhotoRev = nextRev;
                updates.hasBriefingPhoto = true;
                updates["mvtData/briefingPhoto"] = null;
                merged.hasBriefingPhoto = true;
                merged.briefingPhotoRev = nextRev;
            } catch (err) {
                console.error("No se pudo guardar la foto del briefing aparte", err);
            }
        } else {
            updates.hasBriefingPhoto = true;
            updates["mvtData/briefingPhoto"] = null;
            merged.hasBriefingPhoto = true;
            merged.briefingPhotoRev = nextRev;
        }
    } else if (incomingPhoto === "") {
        try {
            await saveBriefingPhoto(id, "");
            updates.hasBriefingPhoto = null;
            updates.briefingPhotoRev = null;
            updates["mvtData/briefingPhoto"] = null;
            merged.hasBriefingPhoto = undefined;
            merged.briefingPhotoRev = undefined;
        } catch (err) {
            console.error("No se pudo quitar la foto del briefing", err);
        }
    }

    console.log("flightsDb.ts updateFlight updates=", updates);
    if (Object.keys(updates).length === 0) return;

    await update(flightDbRef(id), updates);
    if (iso) {
        if (prevIso && prevIso !== iso) {
            try {
                await remove(summaryRef(prevIso, id));
            } catch (err) {
                console.error("No se pudo mover el resumen de fecha", err);
            }
        }
        try {
            await set(summaryRef(iso, id), forFirebaseDb(flightToSummary({ ...merged, dateIso: iso })));
        } catch (err) {
            console.error("No se pudo actualizar el resumen del vuelo", err);
        }
    }
}

export async function saveFlightsBatch(flights: Flight[]): Promise<void> {
    await Promise.all(flights.map((f) => saveFlight(f)));
}

export async function removeFlightsByIds(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    await Promise.all(
        unique.map(async (id) => {
            const snap = await get(flightDbRef(id));
            const raw = snap.val();
            const iso =
                raw && typeof raw === "object"
                    ? String((raw as Flight).dateIso ?? "") || flightDateToIso(coerceFlightFromDb(raw as Flight))
                    : "";
            await remove(flightDbRef(id));
            await remove(briefingPhotoRef(id));
            if (iso) await remove(summaryRef(iso, id));
        }),
    );
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

