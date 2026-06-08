import type { UserRole } from "../types";

/** Semanas fijas del mes para cost controlling. */
export type CostWeekId = "w1" | "w2" | "w3" | "w4";

export interface CostWeekPeriod {
    id: CostWeekId;
    /** Etiqueta corta, p. ej. "01 – 07" */
    label: string;
    startDay: number;
    endDay: number;
}

export type CostCategoryId = "cost1" | "cost2" | "cost3";

export interface CostCategory {
    id: CostCategoryId;
    /** Nombre visible; se actualizará cuando se carguen los conceptos reales. */
    label: string;
}

/** Tres conceptos de costo por aeropuerto (valores pendientes de definición). */
export const COST_CONTROLLING_CATEGORIES: readonly CostCategory[] = [
    { id: "cost1", label: "Costo 1" },
    { id: "cost2", label: "Costo 2" },
    { id: "cost3", label: "Costo 3" },
];

/**
 * Estaciones argentinas de la red (mismo criterio operativo que offsets UTC domésticos).
 * Se ampliará cuando se carguen tarifas por aeropuerto.
 */
export const ARGENTINA_AIRPORTS: readonly string[] = [
    "AEP",
    "BRC",
    "CNQ",
    "COR",
    "CRD",
    "EZE",
    "FTE",
    "IGR",
    "JUJ",
    "LUQ",
    "MDZ",
    "NQN",
    "PSS",
    "RGL",
    "RVD",
    "SLA",
    "TUC",
    "USH",
    "VDM",
];

export function canAccessCostControlling(role: UserRole): boolean {
    return role === "AJS";
}

export function parseYearMonth(ym: string): { year: number; month: number } | null {
    const m = String(ym ?? "").trim().match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (!Number.isFinite(year) || month < 1 || month > 12) return null;
    return { year, month };
}

export function currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

/** Cuatro bloques del mes: 01–07, 08–15, 16–22, 23–fin. */
export function getCostWeekPeriods(year: number, month: number): CostWeekPeriod[] {
    const lastDay = daysInMonth(year, month);
    return [
        { id: "w1", label: "01 – 07", startDay: 1, endDay: 7 },
        { id: "w2", label: "08 – 15", startDay: 8, endDay: 15 },
        { id: "w3", label: "16 – 22", startDay: 16, endDay: 22 },
        {
            id: "w4",
            label: `23 – ${String(lastDay).padStart(2, "0")}`,
            startDay: 23,
            endDay: lastDay,
        },
    ];
}

export function getCostWeekIdForDay(day: number): CostWeekId {
    if (day <= 7) return "w1";
    if (day <= 15) return "w2";
    if (day <= 22) return "w3";
    return "w4";
}

export function getCurrentCostWeekId(reference = new Date()): CostWeekId {
    return getCostWeekIdForDay(reference.getDate());
}

const MONTH_NAMES_ES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
] as const;

export function formatCostMonthLabel(year: number, month: number): string {
    const name = MONTH_NAMES_ES[month - 1] ?? String(month);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function formatCostWeekTitle(period: CostWeekPeriod, year: number, month: number): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad(startDayOf(period))}/${pad(month)}/${year}`;
    const end = `${pad(period.endDay)}/${pad(month)}/${year}`;
    return `${period.label} (${start} – ${end})`;
}

function startDayOf(period: CostWeekPeriod): number {
    return period.startDay;
}

export type CostRatesByAirport = Record<string, Partial<Record<CostCategoryId, number | null>>>;

/**
 * Tarifas de referencia por semana y aeropuerto.
 * Placeholder: valores `null` hasta cargar la tabla de costos.
 */
export function getCostRatesForWeek(_year: number, _month: number, _weekId: CostWeekId): CostRatesByAirport {
    const rates: CostRatesByAirport = {};
    for (const airport of ARGENTINA_AIRPORTS) {
        rates[airport] = {
            cost1: null,
            cost2: null,
            cost3: null,
        };
    }
    return rates;
}

export function formatCostAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return value.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
