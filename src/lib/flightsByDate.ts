import { equalTo, get, orderByPriority, query, ref } from "firebase/database";
import { db } from "./firebase";
import { parseFlightsSnapshot } from "./flightsDb";
import { addDaysIso, countDaysInclusiveIso, flightDateToIso, normalizeIsoDateRange } from "./controlHelpers";
import type { Flight } from "../types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tope para no disparar miles de lecturas si el rango viene mal formado. */
const MAX_RANGE_DAYS = 800;

export function isIsoDate(value: string): boolean {
    return ISO_RE.test(value);
}

/** Fecha de vuelo en Firebase: DD-MM-YYYY. */
export function isoToStoredFlightDate(iso: string): string {
    if (!isIsoDate(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
}

export function eachIsoInRange(from: string, to: string): string[] {
    const { lo, hi } = normalizeIsoDateRange(from, to);
    if (!lo || !hi || !isIsoDate(lo) || !isIsoDate(hi)) return [];
    const n = countDaysInclusiveIso(lo, hi);
    if (n <= 0 || n > MAX_RANGE_DAYS) return [];
    const out: string[] = [];
    let cur = lo;
    for (let i = 0; i < n; i++) {
        out.push(cur);
        cur = addDaysIso(cur, 1);
    }
    return out;
}

/**
 * La prioridad del nodo es la fecha guardada (DD-MM-YYYY).
 * `orderByChild("date")` sin índice publicado baja TODO `flights` y filtra en el navegador.
 * Las prioridades ya vienen indexadas en Firebase.
 */
export function flightsOnDateQuery(storedDate: string) {
    return query(ref(db, "flights"), orderByPriority(), equalTo(storedDate));
}

export async function fetchFlightsForIso(iso: string): Promise<Flight[]> {
    const stored = isoToStoredFlightDate(iso);
    if (!stored) return [];
    const snap = await get(flightsOnDateQuery(stored));
    return parseFlightsSnapshot(snap.val());
}

/** Reemplaza los vuelos de un día y saca esos ids de otros días en caché. */
export function setDayFlights(
    prev: Record<string, Flight[]>,
    iso: string,
    list: Flight[],
): Record<string, Flight[]> {
    const ids = new Set(list.map((f) => String(f.id ?? "")).filter(Boolean));
    const next: Record<string, Flight[]> = {};
    for (const [day, dayFlights] of Object.entries(prev)) {
        if (day === iso) continue;
        next[day] = ids.size === 0 ? dayFlights : dayFlights.filter((f) => !ids.has(String(f.id)));
    }
    next[iso] = list;
    return next;
}

export function mapFlightInCache(
    prev: Record<string, Flight[]>,
    id: string,
    patch: Partial<Flight> | ((flight: Flight) => Flight),
): Record<string, Flight[]> {
    const target = String(id);
    let changed = false;
    const next: Record<string, Flight[]> = {};
    for (const [day, list] of Object.entries(prev)) {
        let dayChanged = false;
        const mapped = list.map((f) => {
            if (String(f.id) !== target) return f;
            dayChanged = true;
            changed = true;
            return typeof patch === "function" ? patch(f) : { ...f, ...patch };
        });
        next[day] = dayChanged ? mapped : list;
    }
    return changed ? next : prev;
}

export function replaceCachedFlights(prev: Record<string, Flight[]>, flights: Flight[]): Record<string, Flight[]> {
    const grouped = new Map<string, Flight[]>();
    for (const f of flights) {
        const iso = flightDateToIso(f);
        if (!iso) continue;
        const list = grouped.get(iso) ?? [];
        list.push(f);
        grouped.set(iso, list);
    }
    const next: Record<string, Flight[]> = {};
    for (const iso of Object.keys(prev)) {
        next[iso] = grouped.get(iso) ?? [];
    }
    for (const [iso, list] of grouped) {
        if (!(iso in next)) next[iso] = list;
    }
    return next;
}
