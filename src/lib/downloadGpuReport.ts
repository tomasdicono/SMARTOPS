import * as XLSX from "xlsx";
import type { Flight } from "../types";
import {
    flightDateToIso,
    gpuConnectionWaitMinutesFromFlight,
    gpuUsageDurationMinutesFromFlight,
} from "./controlHelpers";
import { normalizeHitosData } from "./flightDataNormalize";
import { getAirlinePrefix } from "./flightHelpers";
import { is1stWaveGanttChart } from "./hitosData";
import { formatMinutesToHHMM } from "./mvtTime";

const HEADERS = [
    "Fecha del vuelo",
    "Nro de vuelo",
    "Origen",
    "Destino",
    "ATA",
    "Inicio GPU",
    "Fin GPU",
    "Tiempo espera de conexión",
    "Uso total de GPU",
] as const;

function formatHhmmDisplay(raw: string | undefined): string {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.length < 3) return "";
    const p = digits.padStart(4, "0").slice(-4);
    return `${p.slice(0, 2)}:${p.slice(2, 4)}`;
}

function durationDisplay(minutes: number | null): string {
    if (minutes == null) return "";
    return formatMinutesToHHMM(minutes);
}

function safeFilePart(s: string): string {
    return s.replace(/[^\w.-]+/g, "_").slice(0, 48) || "gpu";
}

/** Vuelos con carta distinta de 1ST WAVE, ordenados por fecha y vuelo. */
export function filterFlightsForGpuExcelExport(flights: Flight[]): Flight[] {
    return flights
        .filter((f) => {
            const h = normalizeHitosData(f.hitosData);
            return !is1stWaveGanttChart(h.ganttChartName);
        })
        .sort(
            (a, b) =>
                flightDateToIso(a).localeCompare(flightDateToIso(b)) ||
                String(a.flt ?? "").localeCompare(String(b.flt ?? "")),
        );
}

/** Filas para la planilla Excel de GPU (solo cartas no 1ST WAVE). */
export function buildGpuExcelRows(flights: Flight[]): Record<(typeof HEADERS)[number], string>[] {
    return filterFlightsForGpuExcelExport(flights).map((f) => {
        const h = normalizeHitosData(f.hitosData);
        const gpuBlocked = h.gpuNotUsed;
        const waitMinutes = gpuBlocked ? null : gpuConnectionWaitMinutesFromFlight(f);
        const usageMinutes = gpuBlocked ? null : gpuUsageDurationMinutesFromFlight(f);

        return {
            "Fecha del vuelo": f.date || "",
            "Nro de vuelo": `${getAirlinePrefix(f.flt)}${f.flt}`,
            Origen: f.dep || "",
            Destino: f.arr || "",
            ATA: formatHhmmDisplay(h.ata),
            "Inicio GPU": gpuBlocked ? "" : formatHhmmDisplay(h.gpuStart),
            "Fin GPU": gpuBlocked ? "" : formatHhmmDisplay(h.gpuEnd),
            "Tiempo espera de conexión": durationDisplay(waitMinutes),
            "Uso total de GPU": durationDisplay(usageMinutes),
        };
    });
}

export function downloadGpuReportExcel(
    flights: Flight[],
    options?: { dateFrom?: string; dateTo?: string },
): void {
    const rows = buildGpuExcelRows(flights);
    const sheetRows = rows.map((row) => HEADERS.map((h) => row[h]));
    const ws = XLSX.utils.aoa_to_sheet([HEADERS.slice(), ...sheetRows]);
    ws["!cols"] = [
        { wch: 14 },
        { wch: 12 },
        { wch: 8 },
        { wch: 8 },
        { wch: 8 },
        { wch: 12 },
        { wch: 10 },
        { wch: 24 },
        { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GPU");

    const from = options?.dateFrom ?? "";
    const to = options?.dateTo ?? "";
    const rangePart =
        from && to ? (from === to ? from : `${from}_${to}`) : new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `gpu_informe_${safeFilePart(rangePart)}.xlsx`);
}
