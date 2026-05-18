import type { Flight } from "../types";
import { parseHHmmToMinutes } from "./controlHelpers";

export type FuelSupplier = "axion" | "shell" | "ypf";

const NOON_MIN = 12 * 60;

const AEP_AXION = new Set([
    "ASU",
    "COR",
    "IGR",
    "NQN",
    "SLA",
    "FTE",
    "CRD",
    "REC",
    "NAT",
]);
const AEP_SHELL = new Set(["CPC", "SCL", "FLN"]);
const AEP_YPF = new Set(["BRC", "GIG", "GRU", "LIM", "MDZ", "REL", "RES", "TUC", "USH"]);

const EZE_AXION = new Set(["COR", "CPC", "IGR", "FTE", "GIG", "LIM", "USH"]);
const EZE_SHELL = new Set(["SCL", "NQN", "REC", "REL", "RES"]);
const EZE_YPF = new Set(["BRC", "GRU", "MDZ", "TUC", "SLA"]);

function normAirport(code: string | undefined | null): string {
    return String(code ?? "").trim().toUpperCase();
}

function supplierFromDestSet(dest: string, axion: Set<string>, shell: Set<string>, ypf: Set<string>): FuelSupplier | null {
    if (axion.has(dest)) return "axion";
    if (shell.has(dest)) return "shell";
    if (ypf.has(dest)) return "ypf";
    return null;
}

/** Proveedor de combustible según escala de salida, destino y STD (hora local programada). */
export function getFuelSupplier(
    depRaw: string | undefined | null,
    arrRaw: string | undefined | null,
    stdRaw?: string | null,
): FuelSupplier {
    const dep = normAirport(depRaw);
    const arr = normAirport(arrRaw);

    if (dep === "COR") {
        if (arr === "EZE") return "axion";
        const stdMin = parseHHmmToMinutes(stdRaw);
        if (stdMin != null) {
            return stdMin > NOON_MIN ? "ypf" : "axion";
        }
        return "ypf";
    }

    if (dep === "AEP") {
        return supplierFromDestSet(arr, AEP_AXION, AEP_SHELL, AEP_YPF) ?? "ypf";
    }

    if (dep === "EZE") {
        return supplierFromDestSet(arr, EZE_AXION, EZE_SHELL, EZE_YPF) ?? "ypf";
    }

    return "ypf";
}

export function fuelSupplierLabel(supplier: FuelSupplier): string {
    if (supplier === "axion") return "Axion";
    if (supplier === "shell") return "Shell";
    return "YPF";
}

/** Códigos MVT de demora por combustible (36 Fuelling, 38 Fuel service loss of priority). */
export const FUEL_DELAY_CODES = new Set(["36", "38"]);

export function normalizeMvtDelayCode(code: string | undefined | null): string {
    const d = String(code ?? "").trim().replace(/\D/g, "");
    if (!d) return "";
    const n = parseInt(d, 10);
    return Number.isNaN(n) ? "" : String(n);
}

export function isFuelSupplierDelayCode(code: string | undefined | null): boolean {
    return FUEL_DELAY_CODES.has(normalizeMvtDelayCode(code));
}

export interface FuelDelayRateCell {
    operated: number;
    delayed: number;
    ratePct: number | null;
}

export interface FuelDelayByDestinationRow {
    destination: string;
    axion: FuelDelayRateCell;
    shell: FuelDelayRateCell;
    ypf: FuelDelayRateCell;
}

export type FuelDelayRateTotals = Record<FuelSupplier, FuelDelayRateCell>;

type SupplierCounts = { operated: number; delayed: number };

type DestinationBucket = Record<FuelSupplier, SupplierCounts>;

function emptySupplierCounts(): SupplierCounts {
    return { operated: 0, delayed: 0 };
}

function emptyDestinationBucket(): DestinationBucket {
    return { axion: emptySupplierCounts(), shell: emptySupplierCounts(), ypf: emptySupplierCounts() };
}

function toRateCell(counts: SupplierCounts): FuelDelayRateCell {
    const { operated, delayed } = counts;
    return {
        operated,
        delayed,
        ratePct: operated > 0 ? (delayed / operated) * 100 : null,
    };
}

/** Vuelo con demora combustible (cód. MVT 36 y/o 38). */
export function flightHasFuelSupplierDelay(f: Flight): boolean {
    const m = f.mvtData;
    if (!m) return false;
    return isFuelSupplierDelayCode(m.dlyCod1) || isFuelSupplierDelayCode(m.dlyCod2);
}

function addFlightToBucket(bucket: DestinationBucket, supplier: FuelSupplier, delayed: boolean) {
    bucket[supplier].operated += 1;
    if (delayed) bucket[supplier].delayed += 1;
}

/**
 * Tasa demoras 36/38: vuelos demorados ÷ vuelos operados por proveedor (asignación según escala/destino/STD).
 */
export function computeFuelDelaysByDestination(flights: Flight[]): FuelDelayByDestinationRow[] {
    const map = new Map<string, DestinationBucket>();

    for (const f of flights) {
        const dest = normAirport(f.arr) || "—";
        const supplier = getFuelSupplier(f.dep, f.arr, f.std);
        const delayed = flightHasFuelSupplierDelay(f);
        const bucket = map.get(dest) ?? emptyDestinationBucket();
        addFlightToBucket(bucket, supplier, delayed);
        map.set(dest, bucket);
    }

    return [...map.entries()]
        .map(([destination, b]) => ({
            destination,
            axion: toRateCell(b.axion),
            shell: toRateCell(b.shell),
            ypf: toRateCell(b.ypf),
        }))
        .filter((r) => r.axion.operated + r.shell.operated + r.ypf.operated > 0)
        .sort((a, b) => {
            const opA = a.axion.operated + a.shell.operated + a.ypf.operated;
            const opB = b.axion.operated + b.shell.operated + b.ypf.operated;
            return opB - opA || a.destination.localeCompare(b.destination);
        });
}

/** Totales por proveedor en todo el filtro (no suma de porcentajes por fila). */
export function computeFuelDelayRateTotals(flights: Flight[]): FuelDelayRateTotals {
    const counts: DestinationBucket = emptyDestinationBucket();
    for (const f of flights) {
        const supplier = getFuelSupplier(f.dep, f.arr, f.std);
        addFlightToBucket(counts, supplier, flightHasFuelSupplierDelay(f));
    }
    return {
        axion: toRateCell(counts.axion),
        shell: toRateCell(counts.shell),
        ypf: toRateCell(counts.ypf),
    };
}

export function formatFuelDelayRate(cell: FuelDelayRateCell): string {
    if (cell.operated <= 0) return "—";
    if (cell.ratePct == null) return "—";
    const pct = cell.ratePct;
    const formatted =
        pct >= 10 || pct === 0 ? pct.toFixed(1) : pct.toFixed(2);
    return `${formatted.replace(".", ",")}%`;
}

export function fuelDelayRateTitle(cell: FuelDelayRateCell): string | undefined {
    if (cell.operated <= 0) return undefined;
    const pct =
        cell.ratePct != null
            ? `${cell.ratePct.toFixed(1).replace(".", ",")}%`
            : "—";
    return `${cell.delayed} demorado${cell.delayed !== 1 ? "s" : ""} / ${cell.operated} operado${cell.operated !== 1 ? "s" : ""} (${pct})`;
}

export function fuelSupplierCellClass(supplier: FuelSupplier, hasValue: boolean): string {
    if (!hasValue) return "text-slate-300";
    if (supplier === "axion") return "bg-violet-50/90 font-bold text-violet-950 tabular-nums";
    if (supplier === "shell") return "bg-amber-50/90 font-bold text-amber-950 tabular-nums";
    return "bg-sky-50/90 font-bold text-sky-950 tabular-nums";
}

export function fuelSupplierRowClass(supplier: FuelSupplier | null, mixed?: boolean): string {
    if (mixed || supplier == null) {
        return "bg-slate-50/90 hover:bg-slate-100 border-l-4 border-slate-300";
    }
    if (supplier === "axion") {
        return "bg-violet-100/95 hover:bg-violet-200/80 border-l-4 border-violet-500 text-violet-950";
    }
    if (supplier === "shell") {
        return "bg-amber-100/95 hover:bg-amber-200/80 border-l-4 border-amber-400 text-amber-950";
    }
    return "bg-sky-100/95 hover:bg-sky-200/80 border-l-4 border-sky-600 text-sky-950";
}
