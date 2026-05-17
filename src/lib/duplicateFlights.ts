import type { Flight } from "../types";
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
