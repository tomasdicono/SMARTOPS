export interface MilestoneDef {
    name: string;
    offsetMinutes: number | null;
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

/** Nombres de hitos combustible/bodega (máximo por carta; 1ST WAVE omite descarga). */
export const FUEL_BODEGA_HITO_NAMES = [
    "Inicio Abastecimiento de Combustible",
    "Fin Abastecimiento de Combustible",
    "Inicio Descarga de Bodegas",
    "Fin Descarga de Bodegas",
    "Inicio Cargue de Bodegas",
    "Fin Cargue de Bodegas",
] as const;

export function is1stWaveGanttChart(chartName: string): boolean {
    return String(chartName ?? "").includes("1ST WAVE");
}

/** Hitos combustible/bodega activos en la carta (para validación post-envío). */
export function getFuelBodegaHitoNames(chartName: string): readonly string[] {
    const chart = GANTT_CHARTS.find((c) => c.name === chartName);
    if (!chart) return FUEL_BODEGA_HITO_NAMES;
    const set = new Set<string>(FUEL_BODEGA_HITO_NAMES);
    return chart.milestones.filter((m) => set.has(m.name)).map((m) => m.name);
}

/** Fuente: Hitos Gantt.xlsx — "-" / "—" = hito inactivo (no se muestra). */
const GANTT_CHART_SOURCE: GanttChart[] = [
    {
        name: "A320 - 1ST WAVE",
        tatMinutes: 50,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 45 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 20 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 32 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 17 },
            { name: "Llegada crew", offsetMinutes: 48 },
            { name: "Apertura puerta principal", offsetMinutes: 48 },
            { name: "Apertura puerta bodega", offsetMinutes: 48 },
            { name: "Inicio Embarque", offsetMinutes: 39 },
            { name: "Fin embarque", offsetMinutes: 20 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 20 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A320 - DOM CON CAMBIO DE CREW",
        tatMinutes: 45,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 31 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 6 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 42 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 31 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 31 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 17 },
            { name: "Llegada crew", offsetMinutes: 33 },
            { name: "Apertura puerta principal", offsetMinutes: 43 },
            { name: "Apertura puerta bodega", offsetMinutes: 43 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 10 },
            { name: "Inicio Embarque", offsetMinutes: 24 },
            { name: "Fin embarque", offsetMinutes: 10 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 10 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A320 - DOM SIN CAMBIO DE CREW",
        tatMinutes: 33,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 31 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 6 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 30 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 19 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 19 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 5 },
            { name: "Apertura puerta principal", offsetMinutes: 31 },
            { name: "Apertura puerta bodega", offsetMinutes: 31 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 10 },
            { name: "Inicio Embarque", offsetMinutes: 21 },
            { name: "Fin embarque", offsetMinutes: 10 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 10 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A320 - INT CON CAMBIO DE CREW",
        tatMinutes: 60,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 55 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 30 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 57 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 42 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 42 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 27 },
            { name: "Llegada crew", offsetMinutes: 48 },
            { name: "Apertura puerta principal", offsetMinutes: 59 },
            { name: "Apertura puerta bodega", offsetMinutes: 59 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 10 },
            { name: "Inicio Embarque", offsetMinutes: 39 },
            { name: "Fin embarque", offsetMinutes: 20 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 20 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A320 - INT SIN CAMBIO DE CREW",
        tatMinutes: 50,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 45 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 20 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 47 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 32 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 32 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 17 },
            { name: "Apertura puerta principal", offsetMinutes: 48 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 10 },
            { name: "Inicio Embarque", offsetMinutes: 38 },
            { name: "Fin embarque", offsetMinutes: 20 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 20 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A321 - 1ST WAVE",
        tatMinutes: 55,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 50 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 25 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 37 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 22 },
            { name: "Llegada crew", offsetMinutes: 48 },
            { name: "Apertura puerta principal", offsetMinutes: 48 },
            { name: "Apertura puerta bodega", offsetMinutes: 53 },
            { name: "Inicio Embarque", offsetMinutes: 39 },
            { name: "Fin embarque", offsetMinutes: 15 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 20 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A321 - DOM CON CAMBIO DE CREW",
        tatMinutes: 55,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 50 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 25 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 52 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 41 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 41 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 27 },
            { name: "Llegada crew", offsetMinutes: 40 },
            { name: "Apertura puerta principal", offsetMinutes: 53 },
            { name: "Apertura puerta bodega", offsetMinutes: 53 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 13 },
            { name: "Inicio Embarque", offsetMinutes: 31 },
            { name: "Fin embarque", offsetMinutes: 10 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 10 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A321 - DOM SIN CAMBIO DE CREW",
        tatMinutes: 45,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 40 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 15 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 42 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 31 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 31 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 17 },
            { name: "Apertura puerta principal", offsetMinutes: 43 },
            { name: "Apertura puerta bodega", offsetMinutes: 43 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 13 },
            { name: "Inicio Embarque", offsetMinutes: 30 },
            { name: "Fin embarque", offsetMinutes: 10 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 10 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A321 - INT CON CAMBIO DE CREW",
        tatMinutes: 60,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 55 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 30 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 57 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 42 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 42 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 27 },
            { name: "Llegada crew", offsetMinutes: 45 },
            { name: "Apertura puerta principal", offsetMinutes: 58 },
            { name: "Apertura puerta bodega", offsetMinutes: 58 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 13 },
            { name: "Inicio Embarque", offsetMinutes: 36 },
            { name: "Fin embarque", offsetMinutes: 20 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 20 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
    {
        name: "A321 - INT SIN CAMBIO DE CREW",
        tatMinutes: 50,
        milestones: [
            { name: "Inicio Abastecimiento de Combustible", offsetMinutes: 50 },
            { name: "Fin Abastecimiento de Combustible", offsetMinutes: 25 },
            { name: "Inicio Descarga de Bodegas", offsetMinutes: 47 },
            { name: "Fin Descarga de Bodegas", offsetMinutes: 32 },
            { name: "Inicio Cargue de Bodegas", offsetMinutes: 32 },
            { name: "Fin Cargue de Bodegas", offsetMinutes: 17 },
            { name: "Apertura puerta principal", offsetMinutes: 48 },
            { name: "Apertura puerta bodega", offsetMinutes: 48 },
            { name: "Inicio de desembarque", offsetMinutes: null, ataOffsetMinutes: 2 },
            { name: "Fin de desembarque", offsetMinutes: null, afterDisembarkStartMinutes: 13 },
            { name: "Inicio Embarque", offsetMinutes: 35 },
            { name: "Fin embarque", offsetMinutes: 20 },
            { name: "Inicio búsqueda de equipaje", offsetMinutes: 20 },
            { name: "Cierre puerta bodega", offsetMinutes: 5 },
            { name: "Cierre de puerta principal", offsetMinutes: 5 },
        ],
    },
];

export const GANTT_CHARTS: GanttChart[] = GANTT_CHART_SOURCE;
