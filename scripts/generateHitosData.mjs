import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath =
    process.argv[2] || path.join(process.env.USERPROFILE || "", "Documents", "Hitos Gantt.xlsx");
const outPath = path.join(__dirname, "..", "src", "lib", "hitosData.ts");

const COL_MAP = [
    "Inicio Abastecimiento de Combustible",
    "Fin Abastecimiento de Combustible",
    "Inicio Descarga de Bodegas",
    "Fin Descarga de Bodegas",
    "Inicio Cargue de Bodegas",
    "Fin Cargue de Bodegas",
    "Llegada crew",
    "Apertura puerta principal",
    "Apertura puerta bodega",
    "Inicio de desembarque",
    "Fin de desembarque",
    "Inicio Embarque",
    "Fin embarque",
    "Inicio búsqueda de equipaje",
    "Cierre puerta bodega",
    "Cierre de puerta principal",
];

function isInactive(v) {
    const s = String(v ?? "").trim();
    return !s || s === "-" || s === "—" || s === "N/A";
}

function parseCell(v) {
    if (isInactive(v)) return null;
    const s = String(v).trim().replace(/\u2212/g, "-");
    let m = s.match(/^T-(\d+)$/i);
    if (m) return { offsetMinutes: Number(m[1]) };
    m = s.match(/^ATA\+(\d+)$/i);
    if (m) return { offsetMinutes: null, ataOffsetMinutes: Number(m[1]) };
    m = s.match(/^Desemb\+(\d+)$/i);
    if (m) return { offsetMinutes: null, afterDisembarkStartMinutes: Number(m[1]) };
    throw new Error(`Bad cell value: ${s}`);
}

function fmtMilestone(m) {
    const parts = [`name: ${JSON.stringify(m.name)}`, `offsetMinutes: ${m.offsetMinutes}`];
    if (m.ataOffsetMinutes != null) parts.push(`ataOffsetMinutes: ${m.ataOffsetMinutes}`);
    if (m.afterDisembarkStartMinutes != null) {
        parts.push(`afterDisembarkStartMinutes: ${m.afterDisembarkStartMinutes}`);
    }
    return `{ ${parts.join(", ")} }`;
}

const wb = XLSX.readFile(excelPath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const charts = [];
for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const name = String(row[0]).trim();
    const tatMinutes = Number(row[1]);
    const milestones = [];
    for (let c = 0; c < COL_MAP.length; c++) {
        const parsed = parseCell(row[c + 2]);
        if (!parsed) continue;
        milestones.push({ name: COL_MAP[c], ...parsed });
    }
    charts.push({ name, tatMinutes, milestones });
}

const chartBlocks = charts
    .map((c) => {
        const ms = c.milestones.map(fmtMilestone).join(",\n            ");
        return `    {\n        name: ${JSON.stringify(c.name)},\n        tatMinutes: ${c.tatMinutes},\n        milestones: [\n            ${ms},\n        ],\n    }`;
    })
    .join(",\n");

const content = `export interface MilestoneDef {
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
${chartBlocks},
];

export const GANTT_CHARTS: GanttChart[] = GANTT_CHART_SOURCE;
`;

fs.writeFileSync(outPath, content, "utf8");
console.log(`Wrote ${outPath} (${charts.length} charts) from ${excelPath}`);
