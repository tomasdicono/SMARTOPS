import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { compareFlightsByStd, getAirlinePrefix } from "./flightHelpers";
import { computeMvtDelayStatus, formatMinutesToHHMM, parseTimeToMinutes } from "./mvtTime";

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
    const { isDelayed, delayMinutes } = computeMvtDelayStatus(f.std, m.atd, m.dlyTime1, m.dlyTime2);
    if (!isDelayed) return 0;
    const dlySum = parseTimeToMinutes(m.dlyTime1) + parseTimeToMinutes(m.dlyTime2);
    return Math.max(delayMinutes, dlySum);
}

/** Reporte diario: solo vuelos con demora real (ATD > STD), aunque no tengan código ni tiempo DLY asignado. */
export function flightBelongsInDailyDelayReport(f: Flight): boolean {
    if (f.cancelled) return false;
    const m = f.mvtData;
    if (!m) return false;
    const { isDelayed } = computeMvtDelayStatus(f.std, m.atd, m.dlyTime1, m.dlyTime2);
    return isDelayed;
}

export function filterDelayedFlightsForDate(flights: Flight[], isoDate: string): Flight[] {
    return flights
        .filter((f) => flightDateToIso(f) === isoDate && flightBelongsInDailyDelayReport(f))
        .sort(compareFlightsByStd);
}

export function formatDelayCell(timeRaw: string | undefined): string {
    const m = parseTimeToMinutes(timeRaw);
    if (m <= 0 && !String(timeRaw ?? "").replace(/\D/g, "")) return "—";
    return formatMinutesToHHMM(m);
}

/** Demora de al menos 15 minutos (DLY TIME en MVT). */
export function isDelayTimeAtLeast15Minutes(timeRaw: string | undefined): boolean {
    return parseTimeToMinutes(timeRaw) >= 15;
}

export function delayTimeCellClassName(timeRaw: string | undefined): string {
    const base = "px-2 py-2 font-mono tabular-nums";
    if (isDelayTimeAtLeast15Minutes(timeRaw)) {
        return `${base} bg-red-100 text-red-900 font-bold`;
    }
    return base;
}

/** Texto para copiar al portapapeles desde Reporte diario (no va al PDF). */
export function buildDailyReportCopyText(f: Flight, observaciones = ""): string {
    const m = f.mvtData!;
    const flt = `${getAirlinePrefix(f.flt)}${f.flt}`;
    const atd = m.atd ? formatMinutesToHHMM(parseTimeToMinutes(m.atd)) : "";
    const ttl = formatMinutesToHHMM(totalDelayMinutes(f));
    const min1 = formatDelayCell(m.dlyTime1);
    const min2 = formatDelayCell(m.dlyTime2);
    const obs = observaciones.trim();

    const lines = [
        `✈️ FLT Number : ${flt}`,
        `From : ${f.dep || ""}`,
        `To : ${f.arr || ""}`,
        `Reg : ${f.reg || ""}`,
        `STD : ${f.std || ""}`,
        `ATD : ${atd}`,
        "",
        `Dly TTL : ${ttl}`,
        `1°Code : ${m.dlyCod1 || ""}`,
        `Min : ${min1 === "—" ? "" : min1}`,
        "",
        `2°Code : ${m.dlyCod2 || ""}`,
        `Min : ${min2 === "—" ? "" : min2}`,
        "",
        obs ? `Observaciones:\n${obs}` : "Observaciones:",
    ];
    return lines.join("\n");
}
