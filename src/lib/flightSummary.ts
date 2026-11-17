import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";

/** Campos que usan el dashboard, combustible, uso y GPU. Sin foto, bodegas ni hitos completos. */
export type FlightSummaryRecord = {
    id: string;
    date: string;
    flt: string;
    reg: string;
    dep: string;
    arr: string;
    std: string;
    sta?: string;
    route?: string;
    pax?: string;
    cancelled?: boolean;
    cancellationReason?: string;
    dailyReportObs?: string;
    planDeAccion?: string;
    hasMvt?: boolean;
    atd?: string;
    dlyCod1?: string;
    dlyTime1?: string;
    dlyCod2?: string;
    dlyTime2?: string;
    observaciones?: string;
    paxActual?: string;
    fob?: string;
    mvtSentAt?: string;
    ata?: string;
    gpuStart?: string;
    gpuEnd?: string;
    gpuNotUsed?: boolean;
    ganttChartName?: string;
    hitosSentAt?: string;
};

function keep(value: string | undefined | null): string | undefined {
    const t = String(value ?? "").trim();
    return t ? t : undefined;
}

export function flightToSummary(flight: Flight): FlightSummaryRecord {
    const m = flight.mvtData;
    const h = flight.hitosData;
    const rec: FlightSummaryRecord = {
        id: String(flight.id ?? "").trim(),
        date: String(flight.date ?? ""),
        flt: String(flight.flt ?? ""),
        reg: String(flight.reg ?? ""),
        dep: String(flight.dep ?? ""),
        arr: String(flight.arr ?? ""),
        std: String(flight.std ?? ""),
        sta: keep(flight.sta),
        route: keep(flight.route),
        pax: keep(flight.pax),
        cancelled: flight.cancelled ? true : undefined,
        cancellationReason: keep(flight.cancellationReason),
        dailyReportObs: keep(flight.dailyReportObs),
        planDeAccion: keep(flight.planDeAccion),
        hasMvt: m ? true : undefined,
        atd: keep(m?.atd),
        dlyCod1: keep(m?.dlyCod1),
        dlyTime1: keep(m?.dlyTime1),
        dlyCod2: keep(m?.dlyCod2),
        dlyTime2: keep(m?.dlyTime2),
        observaciones: keep(m?.observaciones),
        paxActual: keep(m?.paxActual),
        fob: keep(m?.fob),
        mvtSentAt: keep(m?.mvtSentAt),
        ata: keep(h?.ata),
        gpuStart: keep(h?.gpuStart),
        gpuEnd: keep(h?.gpuEnd),
        gpuNotUsed: h?.gpuNotUsed ? true : undefined,
        ganttChartName: keep(h?.ganttChartName),
        hitosSentAt: keep(h?.hitosSentAt),
    };
    return rec;
}

export function summaryToFlight(rec: FlightSummaryRecord): Flight {
    const flight: Flight = {
        id: String(rec.id ?? ""),
        date: String(rec.date ?? ""),
        dateIso: flightDateToIso({ date: String(rec.date ?? "") } as Flight),
        flt: String(rec.flt ?? ""),
        reg: String(rec.reg ?? ""),
        dep: String(rec.dep ?? ""),
        arr: String(rec.arr ?? ""),
        std: String(rec.std ?? ""),
        sta: String(rec.sta ?? ""),
        route: String(rec.route ?? ""),
        pax: String(rec.pax ?? ""),
    };
    if (rec.cancelled) {
        flight.cancelled = true;
        flight.cancellationReason = rec.cancellationReason ?? "";
    }
    if (rec.dailyReportObs) flight.dailyReportObs = rec.dailyReportObs;
    if (rec.planDeAccion) flight.planDeAccion = rec.planDeAccion;
    if (rec.hasMvt || rec.atd || rec.mvtSentAt || rec.dlyCod1 || rec.dlyCod2 || rec.fob || rec.paxActual) {
        flight.mvtData = {
            atd: rec.atd ?? "",
            off: "",
            eta: "",
            dlyCod1: rec.dlyCod1 ?? "",
            dlyTime1: rec.dlyTime1 ?? "",
            dlyCod2: rec.dlyCod2 ?? "",
            dlyTime2: rec.dlyTime2 ?? "",
            observaciones: rec.observaciones ?? "",
            paxActual: rec.paxActual ?? "",
            inf: "",
            totalBags: "",
            totalCarga: "",
            load: "",
            fob: rec.fob ?? "",
            ssee: [],
            infoSup: "",
            supervisor: "",
            ...(rec.mvtSentAt ? { mvtSentAt: rec.mvtSentAt } : {}),
        };
    }
    if (rec.ata || rec.gpuStart || rec.gpuEnd || rec.gpuNotUsed || rec.ganttChartName || rec.hitosSentAt) {
        flight.hitosData = {
            ganttChartName: rec.ganttChartName ?? "",
            ata: rec.ata ?? "",
            entries: {},
            gpuStart: rec.gpuStart ?? "",
            gpuEnd: rec.gpuEnd ?? "",
            gpuNotUsed: Boolean(rec.gpuNotUsed),
            peaPosition: "",
            limpiezaStatus: "",
            limpiezaTipo: "",
            ...(rec.hitosSentAt ? { hitosSentAt: rec.hitosSentAt } : {}),
        };
    }
    return flight;
}

export function isFlightSummaryRecord(value: unknown): value is FlightSummaryRecord {
    if (!value || typeof value !== "object") return false;
    const id = String((value as FlightSummaryRecord).id ?? "").trim();
    const date = String((value as FlightSummaryRecord).date ?? "").trim();
    return Boolean(id && date);
}
