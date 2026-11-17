import { get, query, ref, orderByChild, equalTo, startAt, endAt } from "firebase/database";
import { db } from "./firebase";
import { parseFlightsSnapshot, flightWithoutInlinePhoto } from "./flightsDb";
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

export function flightsOnDateQuery(storedDate: string) {
    return query(ref(db, "flights"), orderByChild("date"), equalTo(storedDate));
}

export function localTodayIso(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/** Recorta el extremo futuro: no hay vuelos después de hoy. */
export function clampIsoRangeToToday(from: string, to: string): { lo: string; hi: string } {
    const { lo, hi } = normalizeIsoDateRange(from, to);
    if (!lo || !hi || !isIsoDate(lo) || !isIsoDate(hi)) return { lo: "", hi: "" };
    const today = localTodayIso();
    if (lo > today) return { lo: "", hi: "" };
    return { lo, hi: hi > today ? today : hi };
}

export async function fetchFlightsForIso(iso: string): Promise<Flight[]> {
    const stored = isoToStoredFlightDate(iso);
    if (!stored) return [];
    const snap = await get(flightsOnDateQuery(stored));
    return parseFlightsSnapshot(snap.val());
}

/** Un período completo, para vuelos que ya tienen `dateIso`. */
export async function fetchFlightsByDateIso(from: string, to: string): Promise<Flight[]> {
    const q = query(ref(db, "flights"), orderByChild("dateIso"), startAt(from), endAt(to));
    const snap = await get(q);
    return parseFlightsSnapshot(snap.val()).map(flightWithoutInlinePhoto);
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
