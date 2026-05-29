import type { Flight, HitosData } from "../types";
import { GANTT_CHARTS, type GanttChart, type MilestoneDef } from "./hitosData";
import { getHitosDepartureTime } from "./flightHelpers";
import { normalizeHitosData } from "./flightDataNormalize";

/**
 * Etiqueta en pestaña Crew → nombre exacto del hito en la carta Gantt (mismo offset T−).
 * Así el esperado de tripulación coincide con operacionales.
 */
export const CREW_LABEL_TO_GANTT_MILESTONE: Record<string, string> = {
    "Llegada crew": "Llegada crew",
    "Inicio embarque": "Inicio Embarque",
    "Fin embarque": "Fin embarque",
    "Cierre puertas": "Cierre de puerta principal",
};

/** Texto aclaratorio bajo el nombre del hito en la pestaña Hitos. */
export const HITO_MILESTONE_HINTS: Record<string, string> = {
    "Inicio Embarque": "Primer pax sube al avión",
    "Fin embarque": "Último pax sube al avión",
};

/** Claves reservadas en `hitosCrewData` para carta y ATA elegidos por tripulación */
export const CREW_STORAGE_KEYS = {
    gantt: "__crewGanttChartName",
    ata: "__crewAta",
} as const;

/** Igual que HitosTab */
export function parseToMins(time: string): number {
    if (!time || time.length !== 4) return 0;
    const h = parseInt(time.slice(0, 2), 10);
    const m = parseInt(time.slice(2, 4), 10);
    return h * 60 + m;
}

/** Igual que HitosTab */
export function formatMins(mins: number): string {
    let x = mins;
    while (x < 0) x += 24 * 60;
    while (x >= 24 * 60) x -= 24 * 60;
    const h = Math.floor(x / 60);
    const m = x % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function isActiveMilestone(m: MilestoneDef): boolean {
    return (
        m.offsetMinutes !== null ||
        m.ataOffsetMinutes != null ||
        m.afterDisembarkStartMinutes != null
    );
}

function ataMinutesFromHitos(data: HitosData): number | null {
    const digits = String(data.ata ?? "").replace(/\D/g, "");
    if (digits.length < 3) return null;
    return parseToMins(digits.padStart(4, "0").slice(-4));
}

/** Hora objetivo de un hito (T− desde salida o ATA+offset según carta). */
export function getMilestoneTargetMinutes(
    flight: Flight,
    data: HitosData,
    chart: GanttChart,
    m: MilestoneDef,
): number | null {
    if (m.ataOffsetMinutes != null) {
        const ataMins = ataMinutesFromHitos(data);
        if (ataMins == null) return null;
        return ataMins + m.ataOffsetMinutes;
    }
    if (m.afterDisembarkStartMinutes != null) {
        const ataMins = ataMinutesFromHitos(data);
        if (ataMins == null) return null;
        return ataMins + 2 + m.afterDisembarkStartMinutes;
    }
    if (m.offsetMinutes != null) {
        return refMinutesForHitos(flight, data, chart) - m.offsetMinutes;
    }
    return null;
}

export function getMilestoneLimitLabel(m: MilestoneDef): string {
    if (m.ataOffsetMinutes != null) {
        return `Esperado: ATA+${m.ataOffsetMinutes} min`;
    }
    if (m.afterDisembarkStartMinutes != null) {
        return `Esperado: Inicio desembarque+${m.afterDisembarkStartMinutes} min`;
    }
    if (m.offsetMinutes != null) {
        return `Límite: T-${m.offsetMinutes}m`;
    }
    return "";
}

export function refMinutesForHitos(flight: Flight, data: HitosData, chart: (typeof GANTT_CHARTS)[number]): number {
    const is1stWave = chart.name.includes("1ST WAVE");
    const depRef = getHitosDepartureTime(flight);
    let refMinutes = parseToMins(depRef.replace(":", ""));
    if (!is1stWave && (data.ata ?? "").length >= 3) {
        const ataMins = parseToMins(data.ata.padStart(4, "0"));
        const etdMinutes = ataMins + chart.tatMinutes;
        if (etdMinutes > refMinutes) {
            refMinutes = etdMinutes;
        }
    }
    return refMinutes;
}

/** Misma regla que HitosTab / HitosCrewTab: retraso si real > objetivo y la diferencia &lt; 10 h. */
export function isMilestoneOnTime(valMins: number, targetMins: number): boolean {
    if (valMins > targetMins && valMins - targetMins < 600) return false;
    return true;
}

/** Misma regla que HitosTab para Retraso vs A tiempo */
export function demoraOperacional(valMins: number, targetMins: number): string {
    if (valMins > targetMins && valMins - targetMins < 600) {
        return `+${valMins - targetMins} min`;
    }
    return "A tiempo";
}

/**
 * Carta y referencia para objetivos crew (mismo criterio que resumen / pestaña Crew).
 * Si tripulación no eligió carta propia, usa hitos operacionales completos.
 */
export function hitosDataForCrewTargets(flight: Flight): HitosData | null {
    const op = normalizeHitosData(flight.hitosData);
    const raw = flight.hitosCrewData ?? {};
    const crewOwnChart = String(raw[CREW_STORAGE_KEYS.gantt] ?? "").trim();
    if (crewOwnChart) {
        return normalizeHitosData({
            ganttChartName: crewOwnChart,
            ata: String(raw[CREW_STORAGE_KEYS.ata] ?? "").trim() || op.ata,
            entries: {},
        });
    }
    if (String(op.ganttChartName ?? "").trim()) return op;
    return null;
}

/** Hora real de un hito crew: primero pestaña Crew, luego hitos operacionales (misma clave en carta). */
export function crewMilestoneRealMins(flight: Flight, crewLabel: string): number | null {
    const crew = flight.hitosCrewData ?? {};
    const want = crewLabel.trim().toLowerCase();
    for (const [k, v] of Object.entries(crew)) {
        if (k === CREW_STORAGE_KEYS.gantt || k === CREW_STORAGE_KEYS.ata) continue;
        if (k.trim().toLowerCase() !== want) continue;
        const digits = String(v ?? "").replace(/\D/g, "");
        if (digits.length < 3) continue;
        return parseToMins(digits.padStart(4, "0").slice(-4));
    }
    const op = normalizeHitosData(flight.hitosData);
    for (const [k, v] of Object.entries(op.entries)) {
        if (k.trim().toLowerCase() !== want) continue;
        const digits = String(v ?? "").replace(/\D/g, "");
        if (digits.length < 3) continue;
        return parseToMins(digits.padStart(4, "0").slice(-4));
    }
    return null;
}

/**
 * Horario esperado (y minutos objetivo) para un hito de tripulación, alineado al hito homólogo de la carta.
 */
export function getCrewTargetInfo(
    flight: Flight,
    hitosData: HitosData | undefined,
    crewLabel: string
): { esperado: string; targetMins: number } | null {
    if (!hitosData?.ganttChartName) return null;
    const chart = GANTT_CHARTS.find((c) => c.name === hitosData.ganttChartName);
    if (!chart) return null;
    const ganttName = CREW_LABEL_TO_GANTT_MILESTONE[crewLabel];
    if (!ganttName) return null;
    const m = chart.milestones.find((x) => x.name === ganttName);
    if (!m || m.offsetMinutes === null) return null;
    const refM = refMinutesForHitos(flight, hitosData, chart);
    const targetMins = refM - m.offsetMinutes;
    return { esperado: formatMins(targetMins), targetMins };
}
