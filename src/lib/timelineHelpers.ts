import type { Flight } from "../types";
import { parseHHmmToMinutes, blockDurationMinutes } from "./controlHelpers";
import { computeMvtDelayStatus, formatMinutesToHHMM, parseTimeToMinutes } from "./mvtTime";
import { formatDelayCodeDisplay } from "./delayCodes";

const DAY_MIN = 24 * 60;

export const TIMELINE_WINDOW_HOURS = 8;
export const TIMELINE_SHIFT_HOURS = [2, 6, 8, 12, 24] as const;

export type TimelineBarLayerColor = "red" | "green";

export interface TimelineBarLayer {
    leftPct: number;
    widthPct: number;
    color: TimelineBarLayerColor;
}

interface TimelineBarLayerAbs {
    fromMin: number;
    toMin: number;
    color: TimelineBarLayerColor;
}

export interface TimelineFlightPaint {
    delayMinutes: number;
    layers: TimelineBarLayer[];
}

function localTodayIso(): string {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Minutos «ahora» para progreso en la línea de tiempo del día seleccionado. */
export function timelineReferenceNowMinutes(selectedDateIso: string): number {
    const iso = selectedDateIso.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 0;
    const todayIso = localTodayIso();
    if (iso < todayIso) return DAY_MIN;
    if (iso > todayIso) return 0;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

/** Inicio de ventana 8h centrada en la hora actual (o inicio/fin del día si no aplica). */
export function defaultTimelineWindowStartMin(selectedDateIso: string): number {
    const win = TIMELINE_WINDOW_HOURS * 60;
    const now = timelineReferenceNowMinutes(selectedDateIso);
    const start = Math.round(now - win / 2);
    return clampTimelineWindowStartMin(start);
}

export function clampTimelineWindowStartMin(startMin: number): number {
    const win = TIMELINE_WINDOW_HOURS * 60;
    return Math.max(0, Math.min(startMin, DAY_MIN - win));
}

function hasMvtAtd(f: Flight): boolean {
    const atdRaw = f.mvtData?.atd?.trim();
    return !!atdRaw && atdRaw.replace(/\D/g, "").length >= 3;
}

/** Demora en minutos (0 si salió a horario o antes del STD). Misma regla que MVT: ATD vs STD. */
function computeTimelineDelayMinutes(f: Flight, nowMin: number, std: number): number {
    if (hasMvtAtd(f)) {
        const m = f.mvtData!;
        const status = computeMvtDelayStatus(f.std, m.atd ?? "", m.dlyTime1 ?? "", m.dlyTime2 ?? "");
        return status.isDelayed ? status.delayMinutes : 0;
    }

    const etdRaw = f.etd?.trim();
    if (etdRaw) {
        let etd = parseTimeToMinutes(etdRaw);
        if (etd < std) etd += DAY_MIN;
        return Math.max(0, etd - std);
    }

    if (nowMin > std) return nowMin - std;
    return 0;
}

/** Inicio del tramo verde: ATD real si existe; si no, STD + demora. */
function effectiveOpsStartMin(f: Flight, std: number, delayMin: number): number {
    if (hasMvtAtd(f)) return parseTimeToMinutes(f.mvtData!.atd!);
    if (delayMin > 0) return std + delayMin;
    return std;
}

/** Fin del bloque STD→STA en minutos (puede superar 1440 si cruza medianoche). */
export function flightBlockEndMinutes(std: string, sta: string): number {
    const start = parseHHmmToMinutes(std);
    return start + blockDurationMinutes(std, sta);
}

function extendedNowMinutes(nowMin: number, std: number, blockEnd: number): number {
    if (blockEnd <= DAY_MIN) return nowMin;
    if (nowMin < std) return nowMin + DAY_MIN;
    return nowMin;
}

function clipAbsLayerToSegment(
    layer: TimelineBarLayerAbs,
    segStart: number,
    segEnd: number,
): TimelineBarLayer | null {
    const barSpan = segEnd - segStart;
    if (barSpan <= 0) return null;

    const from = Math.max(layer.fromMin, segStart);
    const to = Math.min(layer.toMin, segEnd);
    if (to <= from) return null;

    const leftPct = ((from - segStart) / barSpan) * 100;
    const widthPct = ((to - from) / barSpan) * 100;
    if (widthPct <= 0.05) return null;
    return { leftPct, widthPct, color: layer.color };
}

function buildAbsLayers(f: Flight, nowMin: number): TimelineBarLayerAbs[] {
    const std = parseHHmmToMinutes(f.std);
    const blockEnd = flightBlockEndMinutes(f.std, f.sta);
    const delayMin = computeTimelineDelayMinutes(f, nowMin, std);
    const opsStart = effectiveOpsStartMin(f, std, delayMin);
    const nowExt = extendedNowMinutes(nowMin, std, blockEnd);
    const layers: TimelineBarLayerAbs[] = [];

    if (delayMin > 0) {
        layers.push({ fromMin: std, toMin: std + delayMin, color: "red" });
    }

    const greenEnd = Math.min(nowExt, blockEnd);
    if (greenEnd > opsStart) {
        layers.push({ fromMin: opsStart, toMin: greenEnd, color: "green" });
    }

    return layers;
}

function splitLayerAtMidnight(layer: TimelineBarLayerAbs): TimelineBarLayerAbs[] {
    if (layer.toMin <= DAY_MIN) return [layer];
    if (layer.fromMin >= DAY_MIN) {
        return [{ fromMin: layer.fromMin - DAY_MIN, toMin: layer.toMin - DAY_MIN, color: layer.color }];
    }
    return [
        { fromMin: layer.fromMin, toMin: DAY_MIN, color: layer.color },
        { fromMin: 0, toMin: layer.toMin - DAY_MIN, color: layer.color },
    ];
}

/** Colores de progreso (gris = base del componente) recortados al segmento visible. */
export function computeTimelineFlightPaint(
    f: Flight,
    segStart: number,
    segEnd: number,
    nowMin: number,
): TimelineFlightPaint {
    const std = parseHHmmToMinutes(f.std);
    const delayMin = computeTimelineDelayMinutes(f, nowMin, std);
    const absLayers = buildAbsLayers(f, nowMin);
    const layers: TimelineBarLayer[] = [];

    for (const abs of absLayers) {
        for (const part of splitLayerAtMidnight(abs)) {
            const clipped = clipAbsLayerToSegment(part, segStart, segEnd);
            if (clipped) layers.push(clipped);
        }
    }

    return { delayMinutes: delayMin, layers };
}

/** Resumen DLY para panel de detalle. */
export function formatTimelineDlySummary(f: Flight): string {
    const m = f.mvtData;
    if (m) {
        const parts: string[] = [];
        if (m.dlyCod1?.trim()) {
            parts.push(`${formatDelayCodeDisplay(m.dlyCod1)} ${m.dlyTime1?.trim() || ""}`.trim());
        }
        if (m.dlyCod2?.trim()) {
            parts.push(`${formatDelayCodeDisplay(m.dlyCod2)} ${m.dlyTime2?.trim() || ""}`.trim());
        }
        if (parts.length > 0) return parts.join(" · ");
        const status = computeMvtDelayStatus(f.std, m.atd ?? "", m.dlyTime1 ?? "", m.dlyTime2 ?? "");
        if (status.isDelayed) return `${formatMinutesToHHMM(status.delayMinutes)} vs STD`;
    }
    if (f.etd?.trim()) return `Reprog. · ETD ${f.etd.trim()}`;
    return "—";
}
