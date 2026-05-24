import type { Flight } from "../types";
import { coerceFlightFromDb } from "./flightHelpers";
import { flightDateToIso } from "./controlHelpers";
import { flightNumberKey } from "./gestionesTableParse";

/** Clave operativa: misma fecha, número de vuelo y ruta. */
export function duplicateFlightGroupKey(f: Flight): string {
    const iso = flightDateToIso(f);
    const flt = flightNumberKey(f.flt);
    const dep = String(f.dep ?? "").trim().toUpperCase();
    const arr = String(f.arr ?? "").trim().toUpperCase();
    if (!iso || !flt) return `id:${f.id}`;
    return `${iso}|${flt}|${dep}|${arr}`;
}

function flightKeepScore(f: Flight): number {
    let score = 0;
    if (f.mvtData?.mvtSentAt) score += 100;
    if (String(f.mvtData?.atd ?? "").trim()) score += 50;
    if (f.hitosData?.hitosSentAt) score += 40;
    if (f.mvtData && Object.values(f.mvtData).some((v) => v != null && String(v).trim() !== "")) score += 15;
    if (f.hitosData?.entries && Object.keys(f.hitosData.entries).length > 0) score += 10;
    if (!f.cancelled) score += 5;
    return score;
}

export interface RemoveDuplicateFlightsResult {
    kept: Flight[];
    removedIds: string[];
    removedCount: number;
    duplicateGroups: number;
}

/**
 * Elimina vuelos repetidos (misma fecha + vuelo + DEP + ARR).
 * En cada grupo conserva el registro con más datos operativos (MVT / Hitos).
 */
/** Actualiza programación sobre un vuelo existente sin borrar MVT / Hitos. */
export function mergeScheduleIntoExistingFlight(existing: Flight, incoming: Flight): Flight {
    return coerceFlightFromDb({
        ...existing,
        date: incoming.date,
        route: incoming.route,
        flt: incoming.flt,
        reg: incoming.reg,
        dep: incoming.dep,
        arr: incoming.arr,
        std: incoming.std,
        sta: incoming.sta,
        pax: incoming.pax,
        etd: incoming.etd?.trim() ? incoming.etd : existing.etd,
    });
}

/**
 * Al importar programación: reutiliza el `id` y datos operativos si ya existe
 * el mismo vuelo (fecha + número + DEP + ARR), en lugar de crear otro UUID.
 */
export function flightsToSaveOnImport(existingFlights: Flight[], incomingFlights: Flight[]): Flight[] {
    const existingByKey = new Map<string, Flight>();
    for (const f of existingFlights) {
        existingByKey.set(duplicateFlightGroupKey(f), f);
    }
    return incomingFlights.map((raw) => {
        const inc = coerceFlightFromDb(raw);
        const ex = existingByKey.get(duplicateFlightGroupKey(inc));
        return ex ? mergeScheduleIntoExistingFlight(ex, inc) : inc;
    });
}

/** Claves operativas con más de un registro en la fecha ISO dada. */
export function duplicateKeysForIso(flights: Flight[], selectedIso: string): Set<string> {
    const counts = new Map<string, number>();
    for (const f of flights) {
        if (!selectedIso || flightDateToIso(f) !== selectedIso) continue;
        const k = duplicateFlightGroupKey(f);
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const dup = new Set<string>();
    for (const [k, c] of counts) {
        if (c > 1) dup.add(k);
    }
    return dup;
}

export function countDuplicateGroupsForIso(flights: Flight[], selectedIso: string): number {
    return duplicateKeysForIso(flights, selectedIso).size;
}

export function removeDuplicateFlights(flights: Flight[]): RemoveDuplicateFlightsResult {
    const byKey = new Map<string, Flight[]>();
    for (const f of flights) {
        const key = duplicateFlightGroupKey(f);
        const list = byKey.get(key) ?? [];
        list.push(f);
        byKey.set(key, list);
    }

    const removeIds = new Set<string>();
    let duplicateGroups = 0;

    for (const group of byKey.values()) {
        if (group.length <= 1) continue;
        duplicateGroups++;
        const sorted = [...group].sort((a, b) => flightKeepScore(b) - flightKeepScore(a));
        for (let i = 1; i < sorted.length; i++) {
            removeIds.add(sorted[i].id);
        }
    }

    return {
        kept: flights.filter((f) => !removeIds.has(f.id)),
        removedIds: [...removeIds],
        removedCount: removeIds.size,
        duplicateGroups,
    };
}
