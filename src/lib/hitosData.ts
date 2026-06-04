export interface MilestoneDef {
    name: string;
    offsetMinutes: number | null; // Minutes BEFORE reference time
    /** Minutos después del ATA (solo cartas no 1ST WAVE). */
    ataOffsetMinutes?: number;
    /** Minutos después del inicio de desembarque (solo Fin de desembarque). */
    afterDisembarkStartMinutes?: number;
}

export interface GanttChart {
    name: string;
    tatMinutes: number;
    milestones: MilestoneDef[];
}

const headers = [
    "Llegada crew",
    "Apertura puerta principal",
    "Apertura puerta bodega",
    "Inicio Embarque",
    "Fin embarque",
    "Inicio búsqueda de equipaje",
    "Cierre puerta bodega",
    "Cierre de puerta principal"
];

/** Hitos combustible / bodega (minutos antes de STD o ETD según carta). Fuente: Hitos nuevos.xlsx */
const NEW_MILESTONE_HEADERS = [
    "Inicio Abastecimiento de Combustible",
    "Fin Abastecimiento de Combustible",
    "Inicio Descarga de Bodegas",
    "Fin Descarga de Bodegas",
    "Inicio Cargue de Bodegas",
    "Fin Cargue de Bodegas",
] as const;

/** Hitos combustible/bodega agregados en despliegue; no obligatorios si el vuelo ya tenía hitos enviados. */
export const FUEL_BODEGA_HITO_NAMES: readonly string[] = NEW_MILESTONE_HEADERS;

/** Valores Excel negativos → offsetMinutes positivos (T− respecto a salida). */
const NEW_MILESTONES_OFFSETS_BY_CHART: Record<string, readonly number[]> = {
    "A320 - 1ST WAVE": [45, 20, 47, 32, 32, 17],
    "A320 - DOM CON CAMBIO DE CREW": [31, 6, 42, 31, 31, 17],
    "A320 - DOM SIN CAMBIO DE CREW": [31, 6, 30, 19, 19, 5],
    "A320 - INT CON CAMBIO DE CREW": [55, 30, 57, 42, 42, 27],
    "A320 - INT SIN CAMBIO DE CREW": [45, 20, 47, 32, 32, 17],
    "A321 - 1ST WAVE": [50, 25, 52, 37, 37, 22],
    "A321 - DOM CON CAMBIO DE CREW": [50, 25, 52, 41, 41, 27],
    "A321 - DOM SIN CAMBIO DE CREW": [40, 15, 42, 31, 31, 17],
    "A321 - INT CON CAMBIO DE CREW": [55, 30, 57, 42, 42, 27],
    "A321 - INT SIN CAMBIO DE CREW": [50, 25, 47, 32, 32, 17],
};

function buildFuelBodegaMilestones(chartName: string): MilestoneDef[] {
    const offsets = NEW_MILESTONES_OFFSETS_BY_CHART[chartName];
    if (!offsets || offsets.length !== NEW_MILESTONE_HEADERS.length) return [];
    return NEW_MILESTONE_HEADERS.map((name, i) => ({
        name,
        offsetMinutes: offsets[i],
    }));
}

/** Combina hitos T− y deja inactivos (N/A) al final; desembarque se inserta después en `withDisembarkMilestones`. */
function mergeAndSortTimedMilestones(milestones: MilestoneDef[]): MilestoneDef[] {
    const timed = milestones.filter((m) => m.offsetMinutes != null);
    const untimed = milestones.filter(
        (m) =>
            m.offsetMinutes === null &&
            m.ataOffsetMinutes == null &&
            m.afterDisembarkStartMinutes == null,
    );
    timed.sort((a, b) => (b.offsetMinutes ?? 0) - (a.offsetMinutes ?? 0));
    return [...timed, ...untimed];
}

function withFuelAndBodegaMilestones(chart: GanttChart): GanttChart {
    const extra = buildFuelBodegaMilestones(chart.name);
    if (extra.length === 0) return chart;
    return {
        ...chart,
        milestones: mergeAndSortTimedMilestones([...extra, ...chart.milestones]),
    };
}

const rawData: any[][] = [
    ["A320 - 1ST WAVE", 0.034722222222222224, 0.03333333333333333, 0.03333333333333333, 0.03333333333333333, 0.027083333333333334, 0.013888888888888888, 0.013888888888888888, 0.003472222222222222, 0.003472222222222222],
    ["A320 - DOM CON CAMBIO DE CREW", 0.03125, 0.022916666666666665, 0.029861111111111113, 0.029861111111111113, 0.016666666666666666, 0.006944444444444444, 0.006944444444444444, 0.003472222222222222, 0.003472222222222222],
    ["A320 - DOM SIN CAMBIO DE CREW", 0.022916666666666665, "N/A", 0.021527777777777778, 0.021527777777777778, 0.014583333333333334, 0.006944444444444444, 0.006944444444444444, 0.003472222222222222, 0.003472222222222222],
    ["A320 - INT CON CAMBIO DE CREW", 0.041666666666666664, 0.03333333333333333, 0.04097222222222222, 0.04027777777777778, 0.027083333333333334, 0.013888888888888888, 0.013888888888888888, 0.003472222222222222, 0.003472222222222222],
    ["A320 - INT SIN CAMBIO DE CREW", 0.034722222222222224, "N/A", 0.03333333333333333, 0.03333333333333333, 0.02638888888888889, 0.013888888888888888, 0.013888888888888888, 0.003472222222222222, 0.003472222222222222],
    ["A321 - 1ST WAVE", 0.03819444444444445, 0.03333333333333333, 0.03680555555555556, 0.03680555555555556, 0.027083333333333334, 0.013888888888888888, 0.013888888888888888, 0.003472222222222222, 0.003472222222222222],
    ["A321 - DOM CON CAMBIO DE CREW", 0.03819444444444445, 0.027777777777777776, 0.03680555555555556, 0.03680555555555556, 0.021527777777777778, 0.006944444444444444, 0.006944444444444444, 0.003472222222222222, 0.003472222222222222],
    ["A321 - DOM SIN CAMBIO DE CREW", 0.03125, "N/A", 0.029861111111111113, 0.029861111111111113, 0.020833333333333332, 0.006944444444444444, 0.006944444444444444, 0.003472222222222222, 0.003472222222222222],
    ["A321 - INT CON CAMBIO DE CREW", 0.041666666666666664, 0.03125, 0.04027777777777778, 0.04027777777777778, 0.025, 0.013888888888888888, 0.013888888888888888, 0.003472222222222222, 0.003472222222222222],
    ["A321 - INT SIN CAMBIO DE CREW", 0.034722222222222224, "N/A", 0.03333333333333333, 0.03680555555555556, 0.024305555555555556, 0.013888888888888888, 0.013888888888888888, 0.003472222222222222, 0.003472222222222222]
];

function withDisembarkMilestones(chart: GanttChart): GanttChart {
    if (chart.name.includes("1ST WAVE")) return chart;

    const bodegaIdx = chart.milestones.findIndex((m) => m.name === "Apertura puerta bodega");
    if (bodegaIdx < 0) return chart;

    const is321 = chart.name.includes("A321");
    const disembark: MilestoneDef[] = [
        { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
        {
            name: "Fin de desembarque",
            offsetMinutes: null,
            afterDisembarkStartMinutes: is321 ? 13 : 10,
        },
    ];

    return {
        ...chart,
        milestones: [
            ...chart.milestones.slice(0, bodegaIdx + 1),
            ...disembark,
            ...chart.milestones.slice(bodegaIdx + 1),
        ],
    };
}

export const GANTT_CHARTS: GanttChart[] = rawData.map(row => {
    const name = row[0];
    const tatMinutes = Math.round(row[1] * 24 * 60);

    const milestones: MilestoneDef[] = headers.map((heading, i) => {
        const val = row[i + 2];
        const offsetMinutes = (val === "N/A" || typeof val !== "number")
            ? null
            : Math.round(val * 24 * 60);

        return { name: heading, offsetMinutes };
    });

    return { name, tatMinutes, milestones };
})
    .map(withFuelAndBodegaMilestones)
    .map(withDisembarkMilestones);
