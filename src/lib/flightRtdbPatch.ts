import type { Flight, HitosData } from "../types";
import { forFirebaseDb } from "./forFirebaseDb";
import { coerceFlightFromDb } from "./flightHelpers";
import {
    mergeHitosDataForPersist,
    mergeMvtDataForPersist,
    normalizeHitosCrewData,
    normalizeHitosData,
    normalizeMvtData,
} from "./flightDataNormalize";

const FLIGHT_SCALAR_KEYS = [
    "date",
    "route",
    "flt",
    "reg",
    "dep",
    "arr",
    "std",
    "sta",
    "pax",
    "etd",
    "cancelled",
    "cancellationReason",
    "rescheduleReason",
    "previousStd",
    "dailyReportObs",
    "qrfActive",
    "qrfReason",
] as const satisfies readonly (keyof Flight)[];

const MVT_DB_KEYS = [
    "atd",
    "off",
    "eta",
    "dlyCod1",
    "dlyTime1",
    "dlyCod2",
    "dlyTime2",
    "observaciones",
    "paxActual",
    "inf",
    "totalBags",
    "totalCarga",
    "load",
    "loadBays",
    "fob",
    "ssee",
    "infoSup",
    "supervisor",
    "mvtSentAt",
    "mvtEditedByHccAt",
] as const;

/**
 * Convierte un patch parcial de vuelo en actualización RTDB con rutas `mvtData/atd`, etc.,
 * para no reemplazar hermanos del mismo mapa al guardar solo un subcampo.
 */
export function buildFlightRtdbUpdate(
    patch: Partial<Flight>,
    existing?: Flight | null,
): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    const ex = existing ? coerceFlightFromDb(existing) : null;

    for (const key of FLIGHT_SCALAR_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            updates[key] = patch[key];
        }
    }

    if (patch.mvtData !== undefined) {
        const prev = normalizeMvtData(ex?.mvtData);
        const merged = mergeMvtDataForPersist(prev, normalizeMvtData(patch.mvtData));
        for (const field of MVT_DB_KEYS) {
            const val = (merged as Record<string, unknown>)[field];
            if (val !== undefined) {
                updates[`mvtData/${field}`] = val;
            }
        }
    }

    if (patch.hitosData !== undefined) {
        const prev = normalizeHitosData(ex?.hitosData);
        const raw = patch.hitosData;
        const merged = mergeHitosDataForPersist(prev, normalizeHitosData(raw));

        if (Object.prototype.hasOwnProperty.call(raw, "ganttChartName")) {
            updates["hitosData/ganttChartName"] = merged.ganttChartName;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "ata")) {
            updates["hitosData/ata"] = merged.ata;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "gpuStart")) {
            updates["hitosData/gpuStart"] = merged.gpuStart;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "gpuEnd")) {
            updates["hitosData/gpuEnd"] = merged.gpuEnd;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "gpuNotUsed")) {
            updates["hitosData/gpuNotUsed"] = merged.gpuNotUsed;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "peaPosition")) {
            updates["hitosData/peaPosition"] = merged.peaPosition;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "hitosSentAt") || merged.hitosSentAt) {
            if (merged.hitosSentAt) updates["hitosData/hitosSentAt"] = merged.hitosSentAt;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "entries") && raw.entries != null) {
            for (const [ek, ev] of Object.entries(merged.entries)) {
                updates[`hitosData/entries/${ek}`] = ev;
            }
        }
    }

    if (patch.hitosCrewData !== undefined) {
        const prev = normalizeHitosCrewData(ex?.hitosCrewData);
        const incoming = patch.hitosCrewData;
        const keys = new Set([...Object.keys(prev), ...Object.keys(incoming)]);
        for (const k of keys) {
            if (!Object.prototype.hasOwnProperty.call(incoming, k)) continue;
            const inc = incoming[k];
            const incTrim = String(inc ?? "").trim();
            updates[`hitosCrewData/${k}`] = incTrim ? inc : (prev[k] ?? inc);
        }
    }

    return forFirebaseDb(updates) as Record<string, unknown>;
}

/** Une patch con el vuelo en servidor (para saveFlight / lecturas locales). */
export function mergeFlightPatch(existing: Flight, patch: Partial<Flight>): Flight {
    const ex = coerceFlightFromDb(existing);
    const mergedScalars: Partial<Flight> = { ...ex };
    for (const key of FLIGHT_SCALAR_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            (mergedScalars as Record<string, unknown>)[key] = patch[key];
        }
    }
    let mvtData = ex.mvtData;
    if (patch.mvtData !== undefined) {
        mvtData = mergeMvtDataForPersist(normalizeMvtData(ex.mvtData), normalizeMvtData(patch.mvtData));
    }
    let hitosData: HitosData | undefined = ex.hitosData;
    if (patch.hitosData !== undefined) {
        hitosData = mergeHitosDataForPersist(normalizeHitosData(ex.hitosData), normalizeHitosData(patch.hitosData));
    }
    let hitosCrewData = ex.hitosCrewData;
    if (patch.hitosCrewData !== undefined) {
        const prev = normalizeHitosCrewData(ex.hitosCrewData);
        hitosCrewData = { ...prev };
        for (const [k, v] of Object.entries(patch.hitosCrewData)) {
            const t = String(v ?? "").trim();
            if (t) hitosCrewData[k] = v;
            else if (Object.prototype.hasOwnProperty.call(patch.hitosCrewData, k)) {
                hitosCrewData[k] = prev[k] ?? v;
            }
        }
    }
    return coerceFlightFromDb({
        ...ex,
        ...mergedScalars,
        mvtData,
        hitosData,
        hitosCrewData,
    });
}
