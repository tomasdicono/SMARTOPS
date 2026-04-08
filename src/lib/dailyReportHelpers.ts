import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { formatMinutesToHHMM, parseTimeToMinutes } from "./mvtTime";

/** Vuelo con MVT y al menos tiempo de demora cargado (dly time 1 y/o 2). */
export function flightHasDelayTimesLoaded(f: Flight): boolean {
    const m = f.mvtData;
    if (!m) return false;
    const t1 = parseTimeToMinutes(m.dlyTime1);
    const t2 = parseTimeToMinutes(m.dlyTime2);
    return t1 + t2 > 0;
}

export function totalDelayMinutes(f: Flight): number {
    const m = f.mvtData;
    if (!m) return 0;
    return parseTimeToMinutes(m.dlyTime1) + parseTimeToMinutes(m.dlyTime2);
}

export function filterDelayedFlightsForDate(flights: Flight[], isoDate: string): Flight[] {
    return flights
        .filter((f) => flightDateToIso(f) === isoDate && flightHasDelayTimesLoaded(f))
        .sort((a, b) => a.std.localeCompare(b.std));
}

export function formatDelayCell(timeRaw: string | undefined): string {
    const m = parseTimeToMinutes(timeRaw);
    if (m <= 0 && !String(timeRaw ?? "").replace(/\D/g, "")) return "—";
    return formatMinutesToHHMM(m);
}
