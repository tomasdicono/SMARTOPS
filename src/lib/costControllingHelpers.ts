import type { Flight, UserRole } from "../types";
import { filterFlightsForStats, flightDateToIso } from "./controlHelpers";

/** Semanas fijas del mes para cost controlling. */
export type CostWeekId = "w1" | "w2" | "w3" | "w4";

export interface CostWeekPeriod {
    id: CostWeekId;
    label: string;
    startDay: number;
    endDay: number;
}

export type CostCategoryId =
    | "pasadasSobreAla"
    | "adicionalesSobreAla"
    | "pasadasBajoAla"
    | "adicionalesBajoAla";

export interface CostCategory {
    id: CostCategoryId;
    label: string;
}

export const COST_CONTROLLING_CATEGORIES: readonly CostCategory[] = [
    { id: "pasadasSobreAla", label: "Pasadas sobre ala" },
    { id: "adicionalesSobreAla", label: "Adicionales sobre ala" },
    { id: "pasadasBajoAla", label: "Pasadas bajo ala" },
    { id: "adicionalesBajoAla", label: "Adicionales bajo ala" },
];

export type OverWingProviderId = "swissport" | "flyseg" | "newFlightServices";

export const OVER_WING_PROVIDER_LABELS: Record<OverWingProviderId, string> = {
    swissport: "Swissport",
    flyseg: "FlySeg",
    newFlightServices: "New Flight Services",
};

/** Proveedor sobre ala por estación (según contrato). */
export const OVER_WING_PROVIDER_BY_AIRPORT: Readonly<Record<string, OverWingProviderId>> = {
    AEP: "swissport",
    EZE: "swissport",
    BRC: "flyseg",
    COR: "flyseg",
    CPC: "flyseg",
    IGR: "flyseg",
    FTE: "flyseg",
    MDZ: "flyseg",
    NQN: "flyseg",
    REL: "flyseg",
    RES: "flyseg",
    TUC: "flyseg",
    SLA: "flyseg",
    USH: "flyseg",
    JUJ: "flyseg",
    CRD: "newFlightServices",
};

export const ARGENTINA_AIRPORTS: readonly string[] = [
    "AEP",
    "BRC",
    "CNQ",
    "COR",
    "CPC",
    "CRD",
    "EZE",
    "FTE",
    "IGR",
    "JUJ",
    "LUQ",
    "MDZ",
    "NQN",
    "PSS",
    "REL",
    "RES",
    "RGL",
    "RVD",
    "SLA",
    "TUC",
    "USH",
    "VDM",
];

interface PasadaTier {
    min: number;
    max: number | null;
    rate: number;
}

const SWISSPORT_AEP_TIERS: PasadaTier[] = [
    { min: 133, max: 196, rate: 425_949 },
    { min: 197, max: 261, rate: 407_126 },
    { min: 262, max: 390, rate: 389_133 },
    { min: 391, max: 519, rate: 371_942 },
    { min: 520, max: 691, rate: 354_823 },
    { min: 692, max: 820, rate: 348_439 },
    { min: 821, max: 992, rate: 343_209 },
    { min: 993, max: 1164, rate: 339_777 },
    { min: 1165, max: 1336, rate: 336_381 },
    { min: 1337, max: null, rate: 333_019 },
];

const SWISSPORT_EZE_TIERS: PasadaTier[] = [
    { min: 30, max: 60, rate: 1_587_000 },
    { min: 61, max: 90, rate: 1_245_966 },
    { min: 91, max: 132, rate: 796_891 },
    { min: 133, max: 196, rate: 368_003 },
    { min: 197, max: 261, rate: 335_360 },
    { min: 262, max: 390, rate: 305_660 },
    { min: 391, max: 519, rate: 296_492 },
    { min: 520, max: 691, rate: 287_599 },
    { min: 692, max: 820, rate: 278_970 },
    { min: 821, max: 992, rate: 270_601 },
    { min: 993, max: 1164, rate: 262_481 },
    { min: 1165, max: 1336, rate: 254_608 },
    { min: 1337, max: null, rate: 246_971 },
];

/** Tarifa FlySeg por cantidad de pasadas en la semana (índice = nº de pasada). */
const FLYSEG_WEEKLY_RATES: number[] = (() => {
    const rates: number[] = [0];
    const setRange = (from: number, to: number, value: number) => {
        for (let i = from; i <= to; i++) rates[i] = value;
    };
    rates[1] = 2_563_589.03;
    rates[2] = 2_278_733.38;
    rates[3] = 1_709_047.89;
    setRange(4, 7, 854_523.93);
    setRange(8, 14, 711_799.41);
    setRange(15, 21, 569_694.09);
    setRange(22, 28, 507_334.89);
    rates[29] = 481_968.15;
    setRange(30, 39, 469_395.07);
    rates[40] = 481_968.15;
    rates[41] = 457_946.37;
    setRange(42, 60, 445_999.94);
    return rates;
})();

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

export function isoDateYmd(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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
    const start = `${pad(period.startDay)}/${pad(month)}/${year}`;
    const end = `${pad(period.endDay)}/${pad(month)}/${year}`;
    return `${period.label} (${start} – ${end})`;
}

function lookupPasadaTier(count: number, tiers: PasadaTier[]): number | null {
    if (count <= 0) return null;
    for (const tier of tiers) {
        if (count >= tier.min && (tier.max == null || count <= tier.max)) {
            return tier.rate;
        }
    }
    if (count > 0 && tiers.length > 0) return tiers[0].rate;
    return null;
}

function swissportUnitRate(airport: string, monthlyPasadas: number): number | null {
    if (airport === "AEP") return lookupPasadaTier(monthlyPasadas, SWISSPORT_AEP_TIERS);
    if (airport === "EZE") return lookupPasadaTier(monthlyPasadas, SWISSPORT_EZE_TIERS);
    return null;
}

function flysegUnitRate(weeklyPasadas: number): number | null {
    if (weeklyPasadas <= 0) return null;
    if (weeklyPasadas >= FLYSEG_WEEKLY_RATES.length) {
        return FLYSEG_WEEKLY_RATES[FLYSEG_WEEKLY_RATES.length - 1];
    }
    return FLYSEG_WEEKLY_RATES[weeklyPasadas] ?? null;
}

/** Pasadas = salidas operativas (dep) no canceladas en el rango. */
export function countPasadasAtAirport(
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
    airport: string,
): number {
    const ap = airport.trim().toUpperCase();
    return filterFlightsForStats(flights, isoFrom, isoTo, ap).filter((f) => !f.cancelled).length;
}

export interface CostControllingRow {
    airport: string;
    provider: OverWingProviderId | null;
    providerLabel: string;
    weekPasadas: number;
    /** Pasadas acumuladas del mes hasta fin de semana (Swissport). */
    monthPasadasForTier: number;
    unitRatePasadasSobreAla: number | null;
    costs: Record<CostCategoryId, number | null>;
}

function emptyCosts(): Record<CostCategoryId, number | null> {
    return {
        pasadasSobreAla: null,
        adicionalesSobreAla: null,
        pasadasBajoAla: null,
        adicionalesBajoAla: null,
    };
}

export function computeCostControllingRows(
    flights: Flight[],
    year: number,
    month: number,
    week: CostWeekPeriod,
): CostControllingRow[] {
    const monthStart = isoDateYmd(year, month, 1);
    const monthEndThroughWeek = isoDateYmd(year, month, week.endDay);
    const weekStart = isoDateYmd(year, month, week.startDay);
    const weekEnd = isoDateYmd(year, month, week.endDay);

    return ARGENTINA_AIRPORTS.map((airport) => {
        const provider = OVER_WING_PROVIDER_BY_AIRPORT[airport] ?? null;
        const weekPasadas = countPasadasAtAirport(flights, weekStart, weekEnd, airport);
        const monthPasadasForTier = countPasadasAtAirport(
            flights,
            monthStart,
            monthEndThroughWeek,
            airport,
        );
        const costs = emptyCosts();

        let unitRate: number | null = null;
        if (provider === "swissport" && weekPasadas > 0) {
            unitRate = swissportUnitRate(airport, monthPasadasForTier);
            if (unitRate != null) {
                costs.pasadasSobreAla = weekPasadas * unitRate;
            }
        } else if (provider === "flyseg" && weekPasadas > 0) {
            unitRate = flysegUnitRate(weekPasadas);
            if (unitRate != null) {
                costs.pasadasSobreAla = weekPasadas * unitRate;
            }
        }

        return {
            airport,
            provider,
            providerLabel: provider ? OVER_WING_PROVIDER_LABELS[provider] : "—",
            weekPasadas,
            monthPasadasForTier,
            unitRatePasadasSobreAla: unitRate,
            costs,
        };
    });
}

export function formatCostAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return value.toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatUnitRate(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return `$ ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / pasada`;
}

/** Vuelos del mes seleccionado (para acotar lecturas en UI). */
export function flightsInMonth(flights: Flight[], year: number, month: number): Flight[] {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    return flights.filter((f) => flightDateToIso(f).startsWith(prefix));
}
