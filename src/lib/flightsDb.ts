import { ref, set, update, remove, get } from "firebase/database";
import { db } from "./firebase";
import { forFirebaseDb } from "./forFirebaseDb";
import type { Flight } from "../types";
import { coerceFlightFromDb } from "./flightHelpers";

/** Convierte snapshot de `flights` (array legacy o mapa por id) a lista de vuelos. */
export function parseFlightsSnapshot(data: unknown): Flight[] {
    if (data == null) return [];
    if (Array.isArray(data)) {
        return (data.filter(Boolean) as Flight[]).map(coerceFlightFromDb);
    }
    if (typeof data === "object") {
        const out: Flight[] = [];
        for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
            if (raw == null || typeof raw !== "object") continue;
            const f = coerceFlightFromDb(raw as Flight);
            if (!String(f.id ?? "").trim()) {
                f.id = key;
            }
            out.push(f);
        }
        return out;
    }
    return [];
}

export function isLegacyFlightsArray(data: unknown): boolean {
    return Array.isArray(data);
}

export function flightDbRef(flightId: string) {
    return ref(db, `flights/${flightId}`);
}

/** Guarda o reemplaza un vuelo en `flights/{id}` sin tocar el resto. */
export async function saveFlight(flight: Flight): Promise<void> {
    const f = coerceFlightFromDb(flight);
    const id = String(f.id ?? "").trim();
    if (!id) throw new Error("Vuelo sin id");
    await set(flightDbRef(id), forFirebaseDb(f));
}

/** Actualiza campos de un vuelo (merge en Firebase). */
export async function updateFlight(flightId: string, patch: Partial<Flight>): Promise<void> {
    const id = String(flightId ?? "").trim();
    if (!id) throw new Error("Vuelo sin id");
    await update(flightDbRef(id), forFirebaseDb(patch));
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
