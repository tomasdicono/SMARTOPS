import type { Flight, HitosData } from "../types";
import { GANTT_CHARTS } from "./hitosData";
import { getHitosDepartureTime } from "./flightHelpers";

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

/** Misma regla que HitosTab para Retraso vs A tiempo */
export function demoraOperacional(valMins: number, targetMins: number): string {
    if (valMins > targetMins && valMins - targetMins < 600) {
        return `+${valMins - targetMins} min`;
    }
    return "A tiempo";
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
