import type { Flight, RouteAfectacionEntry, SSEE } from "../types";
import { formatDelayCodeDisplay } from "./delayCodes";
import { normalizeAirportCode } from "./routeAfectaciones";
import { getAirlinePrefix, isJesFlightNumber, compareFlightsByStd, isAlternoActive, getFlightQrfEvents } from "./flightHelpers";
import { getAircraftInfo } from "./fleetData";
import { normalizeHitosData } from "./flightDataNormalize";
import {
    crewMilestoneRealMins,
    getCrewTargetInfo,
    hitosDataForCrewTargets,
    hitosRevisarWarning,
    isMilestoneOnTime,
    parseToMins as hitosParseToMins,
    refMinutesForHitos,
} from "./hitosReference";
import { GANTT_CHARTS } from "./hitosData";
import { formatMinutesToHHMM, parseTimeToMinutes } from "./mvtTime";
import { getFuelSupplier, type FuelSupplier } from "./fuelSupplier";

/** Convierte fecha de vuelo (DD-MM-YYYY o YYYY-MM-DD) a ISO YYYY-MM-DD */
export function flightDateToIso(f: Flight): string {
    const d = String(f.date ?? "");
    if (!d.includes("-")) return d || "";
    const [a, b, c] = d.split("-");
    if (c && c.length === 4) return `${c}-${b}-${a}`;
    if (a && a.length === 4) return `${a}-${b}-${c}`;
    return d;
}

/** HH:mm o HHmm → minutos desde medianoche */
export function parseHHmmToMinutes(s: string | undefined | null): number {
    const raw = String(s ?? "").replace(/\D/g, "");
    if (raw.length <= 2) return parseInt(raw, 10) || 0;
    if (raw.length === 3) {
        const h = parseInt(raw.slice(0, 1), 10);
        const m = parseInt(raw.slice(1, 3), 10);
        return h * 60 + m;
    }
    const h = parseInt(raw.slice(0, 2), 10);
    const m = parseInt(raw.slice(2, 4), 10);
    return h * 60 + m;
}

export function getPax(f: Flight): number {
    return parseInt(f.mvtData?.paxActual || f.pax || "0", 10) || 0;
}

/** Solo casilla PAX del MVT (estadísticas agregadas) */
export function getMvtPaxOnly(f: Flight): number {
    return parseInt(f.mvtData?.paxActual || "0", 10) || 0;
}

/** PAX planificados según la programación (campo `pax` del vuelo), independiente del MVT */
export function getScheduledPax(f: Flight): number {
    const raw = String(f.pax ?? "").replace(/\D/g, "");
    return parseInt(raw || "0", 10) || 0;
}

export function getBags(f: Flight): number {
    return parseInt(f.mvtData?.totalBags || "0", 10) || 0;
}

/** Σ cantidades SSEE con tipo y qty válidos en el MVT. */
export function countSseeAssistances(ssee: SSEE[] | undefined): number {
    let total = 0;
    for (const row of ssee ?? []) {
        const t = String(row.type ?? "").trim();
        const q = parseInt(String(row.qty ?? "").replace(/\D/g, ""), 10) || 0;
        if (!t || q <= 0) continue;
        total += q;
    }
    return total;
}

/** Σ asistencias SSEE en un conjunto de vuelos (MVT). */
export function computeTotalSseeAssistances(flights: Flight[]): number {
    let total = 0;
    for (const f of flights) {
        total += countSseeAssistances(f.mvtData?.ssee);
    }
    return total;
}

export interface AvgFlightMetricGroupRow {
    label: string;
    avgValue: number;
    totalValue: number;
    flightCount: number;
}

function routeGroupKey(f: Flight): string {
    const dep = String(f.dep ?? "").trim().toUpperCase();
    const arr = String(f.arr ?? "").trim().toUpperCase();
    return `${dep}-${arr}`;
}

/** Destino (arr) para agrupar métricas cuando el filtro es por escala(s) de salida (dep). */
function destinationGroupKey(f: Flight, selectedAirports: string[]): string | null {
    const set = new Set(resolveStatsAirportList(selectedAirports));
    const dep = String(f.dep ?? "").trim().toUpperCase();
    const arr = String(f.arr ?? "").trim().toUpperCase();
    if (!set.has(dep)) return null;
    return arr || null;
}

/**
 * Top grupos por promedio de una métrica por vuelo (MVT).
 * - Sin aeropuertos seleccionados → agrupa por ruta DEP-ARR.
 * - Con aeropuerto(s) seleccionado(s) → agrupa por destino (extremo opuesto al filtro).
 */
export function computeTopAvgFlightMetricGroups(
    flights: Flight[],
    selectedAirports: string[],
    getValue: (f: Flight) => number,
    limit = 5,
): { mode: "routes" | "destinations"; rows: AvgFlightMetricGroupRow[] } {
    const mode = resolveStatsAirportList(selectedAirports).length === 0 ? "routes" : "destinations";
    const map = new Map<string, { totalValue: number; count: number }>();

    for (const f of flights) {
        const key = mode === "routes" ? routeGroupKey(f) : destinationGroupKey(f, selectedAirports);
        if (!key) continue;
        const value = getValue(f);
        const prev = map.get(key) ?? { totalValue: 0, count: 0 };
        prev.totalValue += value;
        prev.count += 1;
        map.set(key, prev);
    }

    const rows = [...map.entries()]
        .map(([label, { totalValue, count }]) => ({
            label,
            avgValue: totalValue / count,
            totalValue,
            flightCount: count,
        }))
        .sort(
            (a, b) =>
                b.avgValue - a.avgValue ||
                b.flightCount - a.flightCount ||
                a.label.localeCompare(b.label),
        )
        .slice(0, limit);

    return { mode, rows };
}

/** Top grupos por promedio de bags (TOTAL BAGS MVT). */
export function computeTopAvgBagsGroups(
    flights: Flight[],
    selectedAirports: string[],
    limit = 5,
): { mode: "routes" | "destinations"; rows: AvgFlightMetricGroupRow[] } {
    return computeTopAvgFlightMetricGroups(flights, selectedAirports, getBags, limit);
}

/** TOTAL CARGA (KG) del MVT, 0 si no hay dato. */
export function getTotalCargaKg(f: Flight): number {
    const raw = String(f.mvtData?.totalCarga ?? "").replace(/\D/g, "");
    return parseInt(raw || "0", 10) || 0;
}

/** Top grupos por promedio de carga (TOTAL CARGA KG MVT). */
export function computeTopAvgCargaGroups(
    flights: Flight[],
    selectedAirports: string[],
    limit = 5,
): { mode: "routes" | "destinations"; rows: AvgFlightMetricGroupRow[] } {
    return computeTopAvgFlightMetricGroups(flights, selectedAirports, getTotalCargaKg, limit);
}

/** Top grupos por promedio de pasajeros (PAX actual MVT). */
export function computeTopAvgPaxGroups(
    flights: Flight[],
    selectedAirports: string[],
    limit = 5,
): { mode: "routes" | "destinations"; rows: AvgFlightMetricGroupRow[] } {
    return computeTopAvgFlightMetricGroups(flights, selectedAirports, getMvtPaxOnly, limit);
}

/** FOB (kg) del MVT; null si no hay valor numérico útil. */
export function getFobKg(f: Flight): number | null {
    const raw = String(f.mvtData?.fob ?? "").trim();
    if (!raw) return null;
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    return n > 0 ? n : null;
}

export interface AverageFobByDestinationRow {
    destination: string;
    avgKg: number;
    flightCount: number;
    totalKg: number;
    /** Proveedor según escala de salida; null si hay más de uno en el mismo destino. */
    supplier: FuelSupplier | null;
    supplierMixed: boolean;
}

/** Promedio de FOB (kg) por aeropuerto de destino (ARR) en el conjunto filtrado. */
export function computeAverageFobByDestination(flights: Flight[]): AverageFobByDestinationRow[] {
    const map = new Map<string, { sum: number; count: number; suppliers: Set<FuelSupplier> }>();
    for (const f of flights) {
        const kg = getFobKg(f);
        if (kg == null) continue;
        const dest = String(f.arr ?? "").trim().toUpperCase() || "—";
        const prev = map.get(dest) ?? { sum: 0, count: 0, suppliers: new Set<FuelSupplier>() };
        prev.sum += kg;
        prev.count += 1;
        prev.suppliers.add(getFuelSupplier(f.dep, f.arr, f.std));
        map.set(dest, prev);
    }
    return [...map.entries()]
        .map(([destination, { sum, count, suppliers }]) => {
            const supplierMixed = suppliers.size > 1;
            const supplier = suppliers.size === 1 ? [...suppliers][0]! : null;
            return {
                destination,
                avgKg: sum / count,
                flightCount: count,
                totalKg: sum,
                supplier,
                supplierMixed,
            };
        })
        .sort((a, b) => b.flightCount - a.flightCount || a.destination.localeCompare(b.destination));
}

/** Suma o resta días a una fecha ISO YYYY-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Primer día del mes de una fecha ISO. */
export function startOfMonthIso(iso: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return `${iso.slice(0, 7)}-01`;
}

/** Último día del mes de una fecha ISO. */
export function endOfMonthIso(iso: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const y = parseInt(iso.slice(0, 4), 10);
    const m = parseInt(iso.slice(5, 7), 10);
    const last = new Date(y, m, 0);
    const yy = last.getFullYear();
    const mm = String(last.getMonth() + 1).padStart(2, "0");
    const dd = String(last.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

/** Escalas operativas principales (salida) para control de uso. */
export const CONTROL_OPERATIONAL_HUBS = ["AEP", "EZE", "COR"] as const;

export type StatsAirportFilter = string | readonly string[];

function resolveStatsAirportList(airport: StatsAirportFilter): string[] {
    if (Array.isArray(airport)) {
        return airport.map((a) => String(a).trim().toUpperCase()).filter(Boolean);
    }
    const s = String(airport ?? "").trim().toUpperCase();
    return s ? [s] : [];
}

/** Filtro multi-aeropuerto: vacío = todos; si no, coincide dep (origen) o dep/arr según `mode`. */
export function flightMatchesStatsAirports(
    f: Flight,
    airports: StatsAirportFilter,
    mode: "depOrArr" | "depOnly" = "depOnly",
): boolean {
    const list = resolveStatsAirportList(airports);
    if (list.length === 0) return true;
    const set = new Set(list);
    const dep = String(f.dep ?? "").trim().toUpperCase();
    const arr = String(f.arr ?? "").trim().toUpperCase();
    if (mode === "depOnly") return set.has(dep);
    return set.has(dep) || set.has(arr);
}

function pct(count: number, total: number): number | null {
    if (total <= 0) return null;
    return (count / total) * 100;
}

export interface UsageControlBaseRow {
    base: string;
    totalFlights: number;
    mvtSentCount: number;
    mvtUtilizationPct: number | null;
    mvtOnlyCount: number;
    mvtOnlyPct: number | null;
    completeCount: number;
    completePct: number | null;
    incompleteCount: number;
    incompletePct: number | null;
}

function classifyUsageFlight(f: Flight): {
    mvtSent: boolean;
    hitosComplete: boolean;
    mvtOnly: boolean;
    complete: boolean;
    incomplete: boolean;
} {
    const mvtSent = hasMvtSent(f);
    const hitosSentAt = f.hitosData?.hitosSentAt;
    const hitosComplete = hitosSentAt != null && String(hitosSentAt).trim() !== "";
    return {
        mvtSent,
        hitosComplete,
        mvtOnly: mvtSent && !hitosComplete,
        complete: mvtSent && hitosComplete,
        incomplete: !mvtSent && !hitosComplete,
    };
}

function buildUsageRow(base: string, flights: Flight[]): UsageControlBaseRow {
    const total = flights.length;
    let mvtSentCount = 0;
    let mvtOnlyCount = 0;
    let completeCount = 0;
    let incompleteCount = 0;
    for (const f of flights) {
        const c = classifyUsageFlight(f);
        if (c.mvtSent) mvtSentCount += 1;
        if (c.mvtOnly) mvtOnlyCount += 1;
        if (c.complete) completeCount += 1;
        if (c.incomplete) incompleteCount += 1;
    }
    return {
        base,
        totalFlights: total,
        mvtSentCount,
        mvtUtilizationPct: pct(mvtSentCount, total),
        mvtOnlyCount,
        mvtOnlyPct: pct(mvtOnlyCount, total),
        completeCount,
        completePct: pct(completeCount, total),
        incompleteCount,
        incompletePct: pct(incompleteCount, total),
    };
}

function flightDepUpper(f: Flight): string {
    return String(f.dep ?? "").trim().toUpperCase();
}

/**
 * Aeropuertos que aparecen como filas en la tabla de adopción.
 * - Sin selección: todas las escalas de salida con vuelos en el período.
 * - Selección parcial: solo las elegidas en el filtro.
 * - Todas las opciones del selector marcadas: todas las opciones (aunque tengan 0 vuelos).
 */
export function resolveUsageTableRowAirports(
    flightsInPeriod: Flight[],
    selectedAirports: StatsAirportFilter,
    selectorOptions: readonly string[] = [],
): string[] {
    const selected = resolveStatsAirportList(selectedAirports);
    const opts = selectorOptions.map((a) => String(a).trim().toUpperCase()).filter(Boolean);

    const allSelected =
        opts.length > 0 && selected.length >= opts.length && opts.every((o) => selected.includes(o));

    if (allSelected) {
        return [...opts].sort((a, b) => a.localeCompare(b));
    }

    if (selected.length > 0) {
        return [...selected].sort((a, b) => a.localeCompare(b));
    }

    const deps = new Set<string>();
    for (const f of flightsInPeriod) {
        const d = flightDepUpper(f);
        if (d) deps.add(d);
    }
    return [...deps].sort((a, b) => a.localeCompare(b));
}

/** Métricas de adopción MVT / hitos por escala de salida (dep) en un rango de fechas. */
export function computeUsageControlByBase(
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
    airports: StatsAirportFilter = "",
    selectorOptions: readonly string[] = [],
): { rows: UsageControlBaseRow[]; totals: UsageControlBaseRow } {
    const inPeriod = filterFlightsForStats(flights, isoFrom, isoTo, "").filter((f) => !f.cancelled);
    const scoped = filterFlightsForStats(flights, isoFrom, isoTo, airports).filter((f) => !f.cancelled);
    const rowAirports = resolveUsageTableRowAirports(inPeriod, airports, selectorOptions);
    const rows = rowAirports.map((ap) => {
        const hubFlights = scoped.filter((f) => flightDepUpper(f) === ap);
        return buildUsageRow(ap, hubFlights);
    });
    const totals = buildUsageRow("TOTAL", scoped);
    return { rows, totals };
}

export function isA321Model(model: string): boolean {
    return model.includes("321");
}

export function isA320Family(model: string): boolean {
    return model.includes("320") && !model.includes("321");
}

/**
 * Ordena dos fechas ISO (YYYY-MM-DD) en rango inclusivo [lo, hi].
 * Si falta una, se usa la otra (un solo día). Si ambas vacías, lo/hi quedan vacíos.
 */
export function normalizeIsoDateRange(isoFrom: string, isoTo: string): { lo: string; hi: string } {
    const a = String(isoFrom ?? "").trim();
    const b = String(isoTo ?? "").trim();
    if (!a && !b) return { lo: "", hi: "" };
    if (!a) return { lo: b, hi: b };
    if (!b) return { lo: a, hi: a };
    return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** Días calendario inclusivos entre dos ISO YYYY-MM-DD (misma longitud que el rango). */
export function countDaysInclusiveIso(lo: string, hi: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) return 0;
    const t0 = new Date(`${lo}T12:00:00`).getTime();
    const t1 = new Date(`${hi}T12:00:00`).getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1)) return 0;
    return Math.round((t1 - t0) / 86400000) + 1;
}

/** Vuelos con fecha en [isoFrom, isoTo] inclusive; opcional filtro aeropuerto(s) por origen (dep). */
export function filterFlightsForStats(
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
    airport: StatsAirportFilter = "",
): Flight[] {
    const { lo, hi } = normalizeIsoDateRange(isoFrom, isoTo);
    if (!lo || !hi) return [];
    return flights.filter((f) => {
        const d = flightDateToIso(f);
        return d >= lo && d <= hi && flightMatchesStatsAirports(f, airport, "depOnly");
    });
}

/**
 * Vuelos operativos para conteo SSEE en estadísticas.
 * Con filtro de aeropuerto incluye salidas y arribos (dep o arr); sin filtro, mismo criterio que stats (dep).
 */
export function filterFlightsForSseeStats(
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
    airports: StatsAirportFilter = "",
    timeFrom = "",
    timeTo = "",
): Flight[] {
    const { lo, hi } = normalizeIsoDateRange(isoFrom, isoTo);
    if (!lo || !hi) return [];
    const hasAirportFilter = resolveStatsAirportList(airports).length > 0;
    const airportMode = hasAirportFilter ? "depOrArr" : "depOnly";
    return flights.filter((f) => {
        if (f.cancelled) return false;
        const d = flightDateToIso(f);
        if (d < lo || d > hi) return false;
        if (!flightMatchesStatsAirports(f, airports, airportMode)) return false;
        return flightMatchesStatsAtdTimeFilter(f, timeFrom, timeTo);
    });
}

/** Vuelos operativos del día para conteo SSEE (dep o arr si hay filtro de aeropuerto). */
export function filterDayFlightsForSseeStats(
    dayFlights: Flight[],
    airports: StatsAirportFilter = "",
): Flight[] {
    const hasAirportFilter = resolveStatsAirportList(airports).length > 0;
    const airportMode = hasAirportFilter ? "depOrArr" : "depOnly";
    return dayFlights.filter(
        (f) => !f.cancelled && flightMatchesStatsAirports(f, airports, airportMode),
    );
}

/** @deprecated Alias de `filterFlightsForStats` (mismo criterio: origen / dep). */
export function filterFlightsForStatsDepartureOnly(
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
    airport: StatsAirportFilter = "",
): Flight[] {
    return filterFlightsForStats(flights, isoFrom, isoTo, airport);
}

/** MVT con ATD cargado con al menos hora:minuto parseables (mismo umbral que OTP en status día). */
export function hasMvtAtdForStatsFilter(f: Flight): boolean {
    const atd = f.mvtData?.atd;
    return !!atd && String(atd).replace(/\D/g, "").length >= 3;
}

/** `true` si al menos uno de los campos horario (HH:MM) está definido. */
export function isStatsAtdTimeFilterActive(timeFromHHMM: string, timeToHHMM: string): boolean {
    return String(timeFromHHMM ?? "").trim() !== "" || String(timeToHHMM ?? "").trim() !== "";
}

/**
 * Filtro opcional por hora de **ATD del MVT** (minutos desde medianoche, mismo criterio que el formulario).
 * Si `timeFrom` y `timeTo` están vacíos → no filtra (devuelve siempre `true`).
 * Si alguno tiene valor → solo pasan vuelos con ATD válido dentro de la ventana.
 * Si desde > hasta → ventana nocturna (ej. 22:00–06:00).
 */
export function flightMatchesStatsAtdTimeFilter(f: Flight, timeFromHHMM: string, timeToHHMM: string): boolean {
    const a = String(timeFromHHMM ?? "").trim();
    const b = String(timeToHHMM ?? "").trim();
    if (!a && !b) return true;
    if (!hasMvtAtdForStatsFilter(f)) return false;
    const m = parseTimeToMinutes(f.mvtData!.atd!);
    const lo = a ? parseTimeToMinutes(a) : null;
    const hi = b ? parseTimeToMinutes(b) : null;
    if (lo != null && hi != null) {
        if (lo <= hi) return m >= lo && m <= hi;
        return m >= lo || m <= hi;
    }
    if (lo != null) return m >= lo;
    if (hi != null) return m <= hi;
    return true;
}

/** Participación de cada familia: % de vuelos del filtro que operan con ese equipo (flota conocida) */
export interface FleetMixShare {
    /** Vuelos con matrícula en flota y modelo A320 o A321 según familia */
    countOfType: number;
    /** Total de vuelos en el filtro (fecha / aeropuerto) */
    totalFlights: number;
    /** countOfType / totalFlights × 100 */
    sharePct: number | null;
}

export function computeFleetMixShare(flights: Flight[], family: "A320" | "A321"): FleetMixShare {
    const totalFlights = flights.length;
    let countOfType = 0;
    for (const f of flights) {
        const ac = getAircraftInfo(f.reg);
        if (!ac) continue;
        const is321 = isA321Model(ac.model);
        const is320 = isA320Family(ac.model);
        if (family === "A321" && is321) countOfType++;
        if (family === "A320" && is320) countOfType++;
    }
    const sharePct = totalFlights > 0 ? (countOfType / totalFlights) * 100 : null;
    return { countOfType, totalFlights, sharePct };
}

/** Máxima duración plausible de embarque (rechaza fin «anterior» mal interpretado como día siguiente). */
export const MAX_BOARDING_DURATION_MINUTES = 12 * 60;

/** Máxima duración plausible de uso GPU. */
export const MAX_GPU_DURATION_MINUTES = 18 * 60;

/**
 * Duración en minutos entre dos horarios HHMM.
 * Si el fin es menor que el inicio en reloj (ej. 00:30 tras 23:30), se asume cruce de medianoche (+24 h).
 * Devuelve null si faltan datos, duración 0 o supera `maxMinutes`.
 */
export function hhmmDurationMinutes(
    startRaw: string | undefined | null,
    endRaw: string | undefined | null,
    options?: { maxMinutes?: number },
): number | null {
    const max = options?.maxMinutes ?? MAX_GPU_DURATION_MINUTES;
    const gs = String(startRaw ?? "").replace(/\D/g, "");
    const ge = String(endRaw ?? "").replace(/\D/g, "");
    if (gs.length < 3 || ge.length < 3) return null;
    const startM = parseHHmmToMinutes(gs.padStart(4, "0").slice(-4));
    const endM = parseHHmmToMinutes(ge.padStart(4, "0").slice(-4));
    let diff = endM - startM;
    if (diff === 0) return null;
    if (diff < 0) diff += 24 * 60;
    if (diff <= 0 || diff > max) return null;
    return diff;
}

/** Aviso «Revisar (hito)» si fin no puede ser anterior a inicio (salvo cruce de medianoche válido). */
export function validateHhmmEndNotBeforeStart(
    startRaw: string | undefined | null,
    endRaw: string | undefined | null,
    opts: { hitoLabel: string; maxMinutes?: number },
): string | null {
    const gs = String(startRaw ?? "").replace(/\D/g, "");
    const ge = String(endRaw ?? "").replace(/\D/g, "");
    if (gs.length < 3 || ge.length < 3) return null;

    const max = opts.maxMinutes ?? MAX_GPU_DURATION_MINUTES;
    if (hhmmDurationMinutes(startRaw, endRaw, { maxMinutes: max }) != null) return null;

    return hitosRevisarWarning(opts.hitoLabel);
}

/**
 * Duración uso GPU (minutos) desde hitos operacionales: inicio y fin en HHMM, sin «no se utilizó GPU».
 */
export function gpuUsageDurationMinutesFromFlight(f: Flight): number | null {
    const h = normalizeHitosData(f.hitosData);
    if (h.gpuNotUsed) return null;
    return hhmmDurationMinutes(h.gpuStart, h.gpuEnd, { maxMinutes: MAX_GPU_DURATION_MINUTES });
}

/** Promedio de minutos de uso GPU en el conjunto de vuelos (solo los que tienen inicio/fin válidos en hitos). */
export function computeAverageGpuUsageMinutes(flights: Flight[]): {
    avgMinutes: number | null;
    countWithGpu: number;
} {
    const mins: number[] = [];
    for (const f of flights) {
        const d = gpuUsageDurationMinutesFromFlight(f);
        if (d != null) mins.push(d);
    }
    if (mins.length === 0) return { avgMinutes: null, countWithGpu: 0 };
    const sum = mins.reduce((a, b) => a + b, 0);
    return { avgMinutes: sum / mins.length, countWithGpu: mins.length };
}

/** Máxima espera plausible entre ATA e inicio de uso GPU. */
export const MAX_GPU_CONNECTION_WAIT_MINUTES = 12 * 60;

/**
 * Minutos de espera desde ATA hasta inicio de uso GPU (hitos operacionales).
 * Requiere ATA e inicio GPU válidos; excluye «no se utilizó GPU».
 */
export function gpuConnectionWaitMinutesFromFlight(f: Flight): number | null {
    const h = normalizeHitosData(f.hitosData);
    if (h.gpuNotUsed) return null;
    return hhmmDurationMinutes(h.ata, h.gpuStart, { maxMinutes: MAX_GPU_CONNECTION_WAIT_MINUTES });
}

/** Promedio de minutos de espera de conexión GPU (ATA → inicio) en el conjunto de vuelos. */
export function computeAverageGpuConnectionWaitMinutes(flights: Flight[]): {
    avgMinutes: number | null;
    countWithWait: number;
} {
    const mins: number[] = [];
    for (const f of flights) {
        const d = gpuConnectionWaitMinutesFromFlight(f);
        if (d != null) mins.push(d);
    }
    if (mins.length === 0) return { avgMinutes: null, countWithWait: 0 };
    const sum = mins.reduce((a, b) => a + b, 0);
    return { avgMinutes: sum / mins.length, countWithWait: mins.length };
}

/** Destinos de vuelos internacionales para estadísticas de GPU (salida o llegada). */
export const INTERNATIONAL_GPU_DESTINATIONS = [
    "GIG",
    "LIM",
    "ASU",
    "FLN",
    "SCL",
    "NAT",
    "REC",
] as const;

export function flightTouchesInternationalGpuDestination(f: Flight): boolean {
    const dep = String(f.dep ?? "").trim().toUpperCase();
    const arr = String(f.arr ?? "").trim().toUpperCase();
    return (INTERNATIONAL_GPU_DESTINATIONS as readonly string[]).some((d) => d === dep || d === arr);
}

export interface GpuFlightUsageRow {
    flight: Flight;
    durationMinutes: number;
}

/** Vuelos con duración GPU válida, ordenados de mayor a menor utilización. */
export function buildGpuUsageFlightRows(flights: Flight[]): GpuFlightUsageRow[] {
    const rows: GpuFlightUsageRow[] = [];
    for (const f of flights) {
        const d = gpuUsageDurationMinutesFromFlight(f);
        if (d != null) rows.push({ flight: f, durationMinutes: d });
    }
    return rows.sort(
        (a, b) =>
            b.durationMinutes - a.durationMinutes ||
            flightDateToIso(a.flight).localeCompare(flightDateToIso(b.flight)),
    );
}

function hitosEntryHhmm(entries: Record<string, string>, milestoneName: string): string | null {
    const want = milestoneName.trim().toLowerCase();
    for (const [k, v] of Object.entries(entries)) {
        if (k.trim().toLowerCase() !== want) continue;
        const digits = String(v ?? "").replace(/\D/g, "");
        if (digits.length < 3) return null;
        return digits.padStart(4, "0").slice(-4);
    }
    return null;
}

/**
 * Duración de embarque (min): Fin embarque − Inicio embarque (hitos operacionales o crew).
 * Mismas reglas de cruce de medianoche que GPU.
 */
export function boardingDurationMinutesFromFlight(f: Flight): number | null {
    const h = normalizeHitosData(f.hitosData);
    let start =
        hitosEntryHhmm(h.entries, "Inicio Embarque") ?? hitosEntryHhmm(h.entries, "Inicio embarque");
    let end = hitosEntryHhmm(h.entries, "Fin embarque");
    const crew = f.hitosCrewData ?? {};
    if (!start) {
        start =
            hitosEntryHhmm(crew, "Inicio embarque") ?? hitosEntryHhmm(crew, "Inicio Embarque");
    }
    if (!end) {
        end = hitosEntryHhmm(crew, "Fin embarque");
    }
    if (!start || !end) return null;
    return hhmmDurationMinutes(start, end, { maxMinutes: MAX_BOARDING_DURATION_MINUTES });
}

export type BoardingStatsFilter = "manga" | "remota" | "A320" | "A321";

export interface BoardingFlightDurationRow {
    flight: Flight;
    durationMinutes: number;
}

export interface BoardingCategoryStats {
    avgMinutes: number | null;
    countWithBoarding: number;
    /** Vuelos con duración de embarque estrictamente mayor al promedio de la categoría */
    aboveAverage: BoardingFlightDurationRow[];
}

function flightMatchesBoardingStatsFilter(f: Flight, filter?: BoardingStatsFilter): boolean {
    if (!filter) return true;
    if (filter === "manga" || filter === "remota") {
        return normalizeHitosData(f.hitosData).peaPosition === filter;
    }
    const ac = getAircraftInfo(f.reg);
    if (!ac) return false;
    if (filter === "A321") return isA321Model(ac.model);
    return isA320Family(ac.model);
}

/** Estadísticas de embarque por categoría (promedio + vuelos por encima del promedio). */
export function computeBoardingCategoryStats(
    flights: Flight[],
    filter?: BoardingStatsFilter,
): BoardingCategoryStats {
    const rows: BoardingFlightDurationRow[] = [];
    for (const f of flights) {
        if (!flightMatchesBoardingStatsFilter(f, filter)) continue;
        const d = boardingDurationMinutesFromFlight(f);
        if (d != null) rows.push({ flight: f, durationMinutes: d });
    }
    if (rows.length === 0) return { avgMinutes: null, countWithBoarding: 0, aboveAverage: [] };
    const avgMinutes = rows.reduce((s, r) => s + r.durationMinutes, 0) / rows.length;
    const aboveAverage = rows
        .filter((r) => r.durationMinutes > avgMinutes)
        .sort((a, b) => b.durationMinutes - a.durationMinutes);
    return { avgMinutes, countWithBoarding: rows.length, aboveAverage };
}

/** Promedio de duración de embarque en el conjunto filtrado (solo vuelos con inicio y fin válidos). */
export function computeAverageBoardingMinutes(
    flights: Flight[],
    filter?: BoardingStatsFilter,
): {
    avgMinutes: number | null;
    countWithBoarding: number;
} {
    const { avgMinutes, countWithBoarding } = computeBoardingCategoryStats(flights, filter);
    return { avgMinutes, countWithBoarding };
}

export interface MilestoneComplianceStats {
    /** % de vuelos «a tiempo» sobre los evaluables en el filtro */
    onTimePct: number | null;
    onTimeCount: number;
    evaluatedCount: number;
}

function operationalMilestoneRealMins(
    entries: Record<string, string>,
    names: string[],
): number | null {
    for (const name of names) {
        const raw = hitosEntryHhmm(entries, name);
        if (raw) return hitosParseToMins(raw);
    }
    return null;
}

/** % «a tiempo» del hito operacional Inicio Embarque (carta Gantt + hora real en hitos). */
export function computeInicioEmbarqueCompliance(flights: Flight[]): MilestoneComplianceStats {
    const names = ["Inicio Embarque", "Inicio embarque"];
    let onTimeCount = 0;
    let evaluatedCount = 0;
    for (const f of flights) {
        const h = normalizeHitosData(f.hitosData);
        if (!h.ganttChartName) continue;
        const chart = GANTT_CHARTS.find((c) => c.name === h.ganttChartName);
        if (!chart) continue;
        const def = chart.milestones.find((m) => names.some((n) => m.name.toLowerCase() === n.toLowerCase()));
        if (!def || def.offsetMinutes === null) continue;
        const valMins = operationalMilestoneRealMins(h.entries, names);
        if (valMins == null) continue;
        const targetMins = refMinutesForHitos(f, h, chart) - def.offsetMinutes;
        evaluatedCount += 1;
        if (isMilestoneOnTime(valMins, targetMins)) onTimeCount += 1;
    }
    return {
        onTimePct: evaluatedCount > 0 ? (onTimeCount / evaluatedCount) * 100 : null,
        onTimeCount,
        evaluatedCount,
    };
}

/** % «a tiempo» de Llegada crew (hora en Crew u operacionales + objetivo según carta). */
export function computeLlegadaCrewCompliance(flights: Flight[]): MilestoneComplianceStats {
    const crewLabel = "Llegada crew";
    let onTimeCount = 0;
    let evaluatedCount = 0;
    for (const f of flights) {
        const valMins = crewMilestoneRealMins(f, crewLabel);
        if (valMins == null) continue;
        const hitosForTarget = hitosDataForCrewTargets(f);
        const targetInfo = hitosForTarget ? getCrewTargetInfo(f, hitosForTarget, crewLabel) : null;
        if (!targetInfo) continue;
        evaluatedCount += 1;
        if (isMilestoneOnTime(valMins, targetInfo.targetMins)) onTimeCount += 1;
    }
    return {
        onTimePct: evaluatedCount > 0 ? (onTimeCount / evaluatedCount) * 100 : null,
        onTimeCount,
        evaluatedCount,
    };
}

export interface Cod18FlightInfo {
    flight: Flight;
    onTime: boolean | null;
    valMins: number | null;
}

export function computeBusquedasBagCompliance(flights: Flight[]): MilestoneComplianceStats & { cod18Flights: Cod18FlightInfo[] } {
    const names = ["Inicio búsqueda de equipaje"];
    let onTimeCount = 0;
    let evaluatedCount = 0;
    const cod18Flights: Cod18FlightInfo[] = [];

    for (const f of flights) {
        const hasCod18 = f.mvtData?.dlyCod1 === "18" || f.mvtData?.dlyCod2 === "18";
        const h = normalizeHitosData(f.hitosData);
        if (!h.ganttChartName) {
            if (hasCod18) cod18Flights.push({ flight: f, onTime: null, valMins: null });
            continue;
        }
        
        const chart = GANTT_CHARTS.find((c) => c.name === h.ganttChartName);
        if (!chart) {
            if (hasCod18) cod18Flights.push({ flight: f, onTime: null, valMins: null });
            continue;
        }
        
        const def = chart.milestones.find((m) => names.some((n) => m.name.toLowerCase() === n.toLowerCase()));
        if (!def) {
            if (hasCod18) cod18Flights.push({ flight: f, onTime: null, valMins: null });
            continue;
        }
        
        let offset = def.offsetMinutes;
        if (f.dep.toUpperCase() === "AEP") {
            offset = 20;
        }
        
        if (offset === null) {
            if (hasCod18) cod18Flights.push({ flight: f, onTime: null, valMins: null });
            continue;
        }
        
        const valMins = operationalMilestoneRealMins(h.entries, names);
        if (valMins == null) {
            if (hasCod18) cod18Flights.push({ flight: f, onTime: null, valMins: null });
            continue;
        }
        
        const targetMins = refMinutesForHitos(f, h, chart) - offset;
        evaluatedCount += 1;
        const onTime = isMilestoneOnTime(valMins, targetMins);
        if (onTime) onTimeCount += 1;
        
        if (hasCod18) {
            cod18Flights.push({ flight: f, onTime, valMins });
        }
    }
    
    return {
        onTimePct: evaluatedCount > 0 ? (onTimeCount / evaluatedCount) * 100 : null,
        onTimeCount,
        evaluatedCount,
        cod18Flights,
    };
}


/** Cantidad de vuelos con PEA manga / remota en hitos (lista ya filtrada por el llamador). */
export function computePeaCounts(flights: Flight[]): { manga: number; remota: number } {
    let manga = 0;
    let remota = 0;
    for (const f of flights) {
        const p = normalizeHitosData(f.hitosData).peaPosition;
        if (p === "manga") manga++;
        else if (p === "remota") remota++;
    }
    return { manga, remota };
}

export function uniqueAirportsFromFlights(flights: Flight[]): string[] {
    const s = new Set<string>();
    for (const f of flights) {
        if (f.dep) s.add(f.dep);
        if (f.arr) s.add(f.arr);
    }
    return [...s].sort();
}

const DAY_MIN = 24 * 60;

/** Duración bloque STD → STA (minutos); cruces de medianoche alineados con ControlView */
export function blockDurationMinutes(std: string, sta: string): number {
    let a = parseHHmmToMinutes(std);
    let b = parseHHmmToMinutes(sta);
    if (b < a) b += DAY_MIN;
    return Math.max(b - a, 20);
}

/** Segmentos [inicio, fin) en minutos dentro del día 0–1440; parte 2 si cruza medianoche */
export function flightDaySegments(std: string, sta: string): [number, number][] {
    const start = parseHHmmToMinutes(std);
    const dur = blockDurationMinutes(std, sta);
    const end = start + dur;
    if (end <= DAY_MIN) return [[start, end]];
    return [
        [start, DAY_MIN],
        [0, end - DAY_MIN],
    ];
}

/** Recorta un segmento a la ventana [V0, V1] (minutos); porcentajes respecto al ancho de ventana */
export function clipSegmentToWindow(
    segStart: number,
    segEnd: number,
    windowStart: number,
    windowEnd: number
): { leftPct: number; widthPct: number } | null {
    const s = Math.max(segStart, windowStart);
    const e = Math.min(segEnd, windowEnd);
    if (e <= s) return null;
    const span = windowEnd - windowStart;
    return {
        leftPct: ((s - windowStart) / span) * 100,
        widthPct: ((e - s) / span) * 100,
    };
}

/**
 * Status día: vuelo demorado si tiene ETD (reprogramación) o si el ATD es posterior al STD.
 * Si hay ETD cargado, cuenta como demorado aunque no exista ATD en MVT.
 */
export function isFlightDemoradoStatusDia(f: Flight): boolean {
    if (f.cancelled) return false;
    if (f.etd?.trim()) return true;
    const atd = f.mvtData?.atd;
    if (!atd || String(atd).replace(/\D/g, "").length < 2) return false;
    const stdMinutes = parseTimeToMinutes(f.std);
    let atdMinutes = parseTimeToMinutes(atd);
    if (stdMinutes >= 1200 && atdMinutes <= 240) {
        atdMinutes += 1440;
    }
    return atdMinutes > stdMinutes;
}

/** Demora operativa registrada en MVT (código + tiempo). */
export function hasRecordedMvtDelay(f: Flight): boolean {
    const m = f.mvtData;
    if (!m) return false;
    const d1 = m.dlyCod1?.trim() && m.dlyTime1?.trim();
    const d2 = m.dlyCod2?.trim() && m.dlyTime2?.trim();
    return !!(d1 || d2);
}

/** Hay PAX declarado en el MVT (casilla PAX actual). */
export function hasMvtPaxEntered(f: Flight): boolean {
    return (f.mvtData?.paxActual ?? "").trim() !== "";
}

/** MVT enviado al servidor (`mvtSentAt`), mismo criterio que factor ocupación en status día. */
export function hasMvtSent(f: Flight): boolean {
    if (f.cancelled) return false;
    const m = f.mvtData;
    return m != null && m.mvtSentAt != null && String(m.mvtSentAt).trim() !== "";
}

/** MVT con ATD cargado (suficiente para medir OTP). Denominador “MVT enviados”. */
export function hasMvtAtdForOtp(f: Flight): boolean {
    if (f.cancelled) return false;
    const atd = f.mvtData?.atd;
    return !!atd && String(atd).replace(/\D/g, "").length >= 3;
}

/**
 * Minutos de diferencia ATD − STD (programación publicada). Siempre contra STD, no ETD.
 * Negativo = salida antes del STD.
 */
export function otpDelayMinutes(f: Flight): number | null {
    if (!hasMvtAtdForOtp(f)) return null;
    const atd = f.mvtData!.atd!;
    const stdMinutes = parseTimeToMinutes(f.std);
    let atdMinutes = parseTimeToMinutes(atd);
    if (stdMinutes >= 1200 && atdMinutes <= 240) {
        atdMinutes += 1440;
    }
    return atdMinutes - stdMinutes;
}

/**
 * Vuelo operado con impacto por demora registrada en MVT o por reprogramación (ETD),
 * contando casos programados aunque aún no haya MVT de demoras.
 */
export function isAffectedByDelayOrReprogramming(f: Flight): boolean {
    if (f.cancelled) return false;
    if (hasRecordedMvtDelay(f)) return true;
    return !!f.etd?.trim();
}

/** Minutos de desplazamiento ETD − STD (programación). Solo vuelos con ETD cargada. */
export function rescheduleShiftMinutes(f: Flight): number | null {
    const etd = f.etd?.trim();
    if (!etd) return null;
    const stdM = parseTimeToMinutes(f.std);
    let etdM = parseTimeToMinutes(etd);
    if (etdM < stdM) etdM += DAY_MIN;
    return etdM - stdM;
}

/** Códigos de demora en MVT (dlyCod1 / dlyCod2); porcentajes sobre el total de códigos registrados en el día. */
export interface DelayCodeShare {
    code: string;
    count: number;
    pct: number;
}

export function rankDelayCodesByShare(flights: Flight[]): DelayCodeShare[] {
    const counts = new Map<string, number>();
    for (const f of flights) {
        const m = f.mvtData;
        if (!m) continue;
        const c1 = String(m.dlyCod1 ?? "").trim();
        const c2 = String(m.dlyCod2 ?? "").trim();
        if (c1) counts.set(c1, (counts.get(c1) ?? 0) + 1);
        if (c2) counts.set(c2, (counts.get(c2) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return [...counts.entries()]
        .map(([code, count]) => ({ code, count, pct: (count / total) * 100 }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Agrupa textos por clave normalizada (trim + espacios); orden por frecuencia descendente. */
export function rankStringsByFrequency(items: (string | undefined | null)[]): { text: string; count: number }[] {
    const map = new Map<string, { display: string; count: number }>();
    for (const raw of items) {
        const t = String(raw ?? "").trim().replace(/\s+/g, " ");
        const key = t.toLowerCase();
        const display = t || "(Sin motivo registrado)";
        const prev = map.get(key);
        if (prev) {
            prev.count += 1;
        } else {
            map.set(key, { display, count: 1 });
        }
    }
    return [...map.values()]
        .map(({ display, count }) => ({ text: display, count }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

export interface QrfStatusDiaRow {
    flightId: string;
    eventIndex: number;
    flt: string;
    reg: string;
    route: string;
    std: string;
    reason: string;
    /** Activo = SC aún debe reenviar MVT; Resuelto = MVT reenviado o QRF desactivado. */
    status: "Activo" | "Resuelto";
}

export interface AlternoStatusDiaRow {
    flt: string;
    reg: string;
    std: string;
    arrProgramado: string;
    ato: string;
    reason: string;
}

/** Mismos agregados que la pestaña Control → Status día (día calendario + afectaciones de ruta). */
export interface StatusDiaDaySummary {
    paxAfectadosReprogramacion: number;
    countVuelosReprogramados: number;
    /** Promedio ETD − STD (min) en vuelos reprogramados del día. */
    avgReprogramacionMinutes: number | null;
    motivosReprogramacion: { text: string; count: number }[];
    demoraCodigos: DelayCodeShare[];
    countCancelados: number;
    motivosCancelacionDetalle: { text: string; count: number; pax: number }[];
    paxCancelados: number;
    totalVuelosDia: number;
    /** Vuelos JES (3000–3999) con ATD en MVT, base de OTP 0 / OTP 15. */
    nMvtOtp: number;
    /** Vuelos no cancelados con registro MVT cargado (`mvtData` presente). */
    countVuelosConMvtCargado: number;
    /** Vuelos operados: no cancelados con MVT enviado (`mvtSentAt`). */
    countVuelosOperados: number;
    otp0Pct: number | null;
    otp15Pct: number | null;
    countAfectacionesRuta: number;
    /** Σ PAX programación / Σ asientos (vuelos operativos con matrícula en flota). */
    factorOcupacionProgramadoPct: number | null;
    /** Σ PAX MVT / Σ asientos solo en vuelos con MVT enviado (`mvtSentAt`). */
    factorOcupacionRealPct: number | null;
    /** Σ PAX actual del MVT en vuelos operados (MVT enviado). */
    pasajerosEmbarcados: number;
    /** Vuelos con QRF registrado en el día filtrado (activos o ya resueltos). */
    qrfFlights: QrfStatusDiaRow[];
    /** Vuelos con alterno activo en el día filtrado. */
    alternoFlights: AlternoStatusDiaRow[];
}

export function listQrfFlightsForDay(flights: Flight[]): QrfStatusDiaRow[] {
    const rows: QrfStatusDiaRow[] = [];
    for (const f of flights) {
        if (f.cancelled) continue;
        const events = getFlightQrfEvents(f);
        if (events.length === 0) continue;
        const base = {
            flightId: f.id,
            flt: `${getAirlinePrefix(f.flt)}${f.flt}`,
            reg: String(f.reg ?? "").trim() || "—",
            route: `${f.dep}-${f.arr}`,
            std: String(f.std ?? "").trim() || "—",
        };
        events.forEach((ev, eventIndex) => {
            rows.push({
                ...base,
                eventIndex,
                reason: String(ev.reason ?? "").trim() || "—",
                status: ev.resolvedAt ? "Resuelto" : "Activo",
            });
        });
    }
    return rows.sort((a, b) => a.std.localeCompare(b.std) || a.flt.localeCompare(b.flt));
}

export function listAlternoFlightsForDay(flights: Flight[]): AlternoStatusDiaRow[] {
    return flights
        .filter((f) => !f.cancelled && isAlternoActive(f))
        .sort(compareFlightsByStd)
        .map((f) => ({
            flt: `${getAirlinePrefix(f.flt)}${f.flt}`,
            reg: String(f.reg ?? "").trim() || "—",
            std: String(f.std ?? "").trim() || "—",
            arrProgramado: String(f.arr ?? "").trim() || "—",
            ato: String(f.alternoArr ?? "").trim() || "—",
            reason: String(f.alternoReason ?? "").trim() || "—",
        }));
}

export interface RouteAfectacionStatsRow extends RouteAfectacionEntry {
    /** Fecha calendario del registro (YYYY-MM-DD). */
    dateKey: string;
}

/** Cambios de ruta en rango de fechas, aeropuerto (origen) y ventana ATD opcional. */
export function filterRouteAfectacionesForStats(
    byDate: Record<string, RouteAfectacionEntry[]>,
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
    airports: StatsAirportFilter,
    atdFrom: string,
    atdTo: string,
): RouteAfectacionStatsRow[] {
    const { lo, hi } = normalizeIsoDateRange(isoFrom, isoTo);
    if (!lo || !hi) return [];
    const atdActive = isStatsAtdTimeFilterActive(atdFrom, atdTo);
    const flightById = new Map(flights.map((f) => [f.id, f]));
    const rows: RouteAfectacionStatsRow[] = [];

    for (const [dateKey, list] of Object.entries(byDate)) {
        if (dateKey < lo || dateKey > hi) continue;
        for (const row of list) {
            const dep = normalizeAirportCode(row.depAntes);
            const listAir = resolveStatsAirportList(airports);
            if (listAir.length > 0 && !listAir.includes(dep)) continue;

            if (atdActive && row.flightId) {
                const flight = flightById.get(row.flightId);
                if (flight && !flightMatchesStatsAtdTimeFilter(flight, atdFrom, atdTo)) continue;
            }

            rows.push({ ...row, dateKey });
        }
    }

    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function computeStatusDiaDaySummary(
    dayFlights: Flight[],
    routeAfectacionesCount: number
): StatusDiaDaySummary {
    const operational = dayFlights.filter((f) => !f.cancelled);
    const cancelled = dayFlights.filter((f) => f.cancelled);
    const conEtd = operational.filter((f) => f.etd?.trim());
    const paxAfectadosReprogramacion = conEtd.reduce((s, f) => s + getScheduledPax(f), 0);
    const countVuelosReprogramados = conEtd.length;
    const reprogramShifts = conEtd
        .map(rescheduleShiftMinutes)
        .filter((m): m is number => m != null);
    const avgReprogramacionMinutes =
        reprogramShifts.length > 0
            ? reprogramShifts.reduce((a, b) => a + b, 0) / reprogramShifts.length
            : null;
    const motivosReprogramacion = rankStringsByFrequency(conEtd.map((f) => f.rescheduleReason));
    const demoraCodigos = rankDelayCodesByShare(operational);

    const cancelByKey = new Map<string, { text: string; count: number; pax: number }>();
    for (const f of cancelled) {
        const t = String(f.cancellationReason ?? "").trim().replace(/\s+/g, " ");
        const key = t.toLowerCase();
        const text = t || "(Sin motivo registrado)";
        const px = getScheduledPax(f);
        const prev = cancelByKey.get(key);
        if (prev) {
            prev.count += 1;
            prev.pax += px;
        } else {
            cancelByKey.set(key, { text, count: 1, pax: px });
        }
    }
    const motivosCancelacionDetalle = [...cancelByKey.values()].sort(
        (a, b) => b.count - a.count || a.text.localeCompare(b.text)
    );
    const paxCancelados = cancelled.reduce((s, f) => s + getScheduledPax(f), 0);

    const countVuelosConMvtCargado = operational.filter((f) => f.mvtData != null).length;
    const countVuelosOperados = operational.filter(hasMvtSent).length;

    const conMvtOtp = operational.filter((f) => isJesFlightNumber(f.flt) && hasMvtAtdForOtp(f));
    const nMvtOtp = conMvtOtp.length;
    let otp0Count = 0;
    let otp15Count = 0;
    for (const f of conMvtOtp) {
        const d = otpDelayMinutes(f);
        if (d == null) continue;
        if (d <= 0) otp0Count += 1;
        if (d <= 14) otp15Count += 1;
    }
    const otp0Pct = nMvtOtp > 0 ? (otp0Count / nMvtOtp) * 100 : null;
    const otp15Pct = nMvtOtp > 0 ? (otp15Count / nMvtOtp) * 100 : null;

    let seatsOcc = 0;
    let paxProgramadosSum = 0;
    let seatsMvtEnviados = 0;
    let paxMvtEnviadosSum = 0;
    for (const f of operational) {
        const ac = getAircraftInfo(f.reg);
        if (!ac || ac.capacity <= 0) continue;
        seatsOcc += ac.capacity;
        paxProgramadosSum += getScheduledPax(f);
        const m = f.mvtData;
        const mvtEnviado = m != null && m.mvtSentAt != null && String(m.mvtSentAt).trim() !== "";
        if (mvtEnviado) {
            seatsMvtEnviados += ac.capacity;
            paxMvtEnviadosSum += getMvtPaxOnly(f);
        }
    }
    const factorOcupacionProgramadoPct = seatsOcc > 0 ? (paxProgramadosSum / seatsOcc) * 100 : null;
    const factorOcupacionRealPct = seatsMvtEnviados > 0 ? (paxMvtEnviadosSum / seatsMvtEnviados) * 100 : null;

    const qrfFlights = listQrfFlightsForDay(dayFlights);
    const alternoFlights = listAlternoFlightsForDay(dayFlights);

    return {
        paxAfectadosReprogramacion,
        countVuelosReprogramados,
        avgReprogramacionMinutes,
        motivosReprogramacion,
        demoraCodigos,
        countCancelados: cancelled.length,
        motivosCancelacionDetalle,
        paxCancelados,
        totalVuelosDia: dayFlights.length,
        nMvtOtp,
        countVuelosConMvtCargado,
        countVuelosOperados,
        otp0Pct,
        otp15Pct,
        countAfectacionesRuta: routeAfectacionesCount,
        factorOcupacionProgramadoPct,
        factorOcupacionRealPct,
        pasajerosEmbarcados: paxMvtEnviadosSum,
        qrfFlights,
        alternoFlights,
    };
}

/** Fecha YYYY-MM-DD → leyenda larga en español (Argentina). */
function formatFechaLargaEsAr(isoYmd: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoYmd)) return isoYmd;
    const d = new Date(`${isoYmd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoYmd;
    const s = d.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function pctEsAr(n: number): string {
    return n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatRouteAfectacionLinePrensa(row: RouteAfectacionEntry): string {
    const flt = `${getAirlinePrefix(row.flt)}${row.flt}`.trim();
    let hora = "—";
    try {
        const d = new Date(row.at);
        if (!Number.isNaN(d.getTime())) {
            hora = d.toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
    } catch {
        /* ignore */
    }
    const ruta = `${row.depAntes}-${row.arrAntes} → ${row.depDespues}-${row.arrDespues}`;
    const reg = row.reg?.trim() || "—";
    return `  • ${flt} · ${reg} · ${ruta} · ${hora}`;
}

/**
 * Borrador listo para copiar a prensa / comunicaciones, solo con datos del Status día.
 */
export function buildStatusDiaPrensaText(
    fechaIso: string,
    s: StatusDiaDaySummary,
    routeAfectaciones: RouteAfectacionEntry[]
): string {
    const fecha = formatFechaLargaEsAr(fechaIso);
    const out: string[] = [];

    out.push(`Status operativo — ${fecha}`);
    out.push("");
    out.push(
        `El día cuenta con ${s.totalVuelosDia} vuelo${s.totalVuelosDia !== 1 ? "s" : ""} programado${s.totalVuelosDia !== 1 ? "s" : ""} por itinerario.`
    );
    out.push("");

    out.push("⏱️ Puntualidad");
    out.push(
        `Sobre un total de ${s.nMvtOtp} vuelo${s.nMvtOtp !== 1 ? "s" : ""} operado${s.nMvtOtp !== 1 ? "s" : ""}, el status OTP al momento es el siguiente:`
    );
    if (s.nMvtOtp > 0 && s.otp0Pct != null && s.otp15Pct != null) {
        out.push(`OTP 0 --> ${pctEsAr(s.otp0Pct)}%`);
        out.push(`OTP 15 --> ${pctEsAr(s.otp15Pct)}%`);
    } else {
        out.push("Sin datos de OTP: no hay vuelos operados con hora de salida real suficiente para calcular el indicador.");
    }
    out.push("");

    out.push("📊 Factor de ocupación");
    if (s.factorOcupacionProgramadoPct != null) {
        out.push(`Factor de ocupación esperado: ${pctEsAr(s.factorOcupacionProgramadoPct)}%.`);
    } else {
        out.push("Factor de ocupación esperado: sin dato consolidado.");
    }
    if (s.factorOcupacionRealPct != null) {
        out.push(`Factor de ocupación de vuelos ejecutados: ${pctEsAr(s.factorOcupacionRealPct)}%.`);
    } else {
        out.push("Factor de ocupación de vuelos ejecutados: sin dato.");
    }
    out.push(
        `Pasajeros embarcados (PAX MVT): ${s.pasajerosEmbarcados.toLocaleString("es-AR")}.`
    );
    out.push("");

    out.push("QRF (regreso a posición)");
    if (s.qrfFlights.length === 0) {
        out.push("Sin QRF registrados.");
    } else {
        for (const row of s.qrfFlights) {
            out.push(`  • ${row.flt} · ${row.reg} · ${row.route} · STD ${row.std} · ${row.status} — ${row.reason}`);
        }
    }
    out.push("");

    out.push("Alternos");
    if (s.alternoFlights.length === 0) {
        out.push("Sin alternos activos.");
    } else {
        for (const row of s.alternoFlights) {
            out.push(
                `  • ${row.flt} · ${row.reg} · STD ${row.std} · ${row.arrProgramado} → ${row.ato} — ${row.reason}`,
            );
        }
    }
    out.push("");

    out.push("Reprogramaciones");
    if (s.countVuelosReprogramados === 0) {
        out.push("Sin reprogramaciones.");
    } else {
        out.push(
            `Hay ${s.countVuelosReprogramados} vuelo${s.countVuelosReprogramados !== 1 ? "s" : ""} con nueva hora de salida ETD. ` +
                `La afectación por las reprogramaciones alcanza a ${s.paxAfectadosReprogramacion} pasajero${s.paxAfectadosReprogramacion !== 1 ? "s" : ""}.`
        );
        if (s.avgReprogramacionMinutes != null) {
            out.push(
                `Promedio de reprogramaciones: ${formatMinutesToHHMM(Math.round(s.avgReprogramacionMinutes))}.`
            );
        }
    }
    out.push("");

    out.push("Cambios de ruta");
    if (routeAfectaciones.length === 0) {
        out.push("Sin cambios de ruta registrados.");
    } else {
        out.push(`Se registraron ${routeAfectaciones.length} cambio${routeAfectaciones.length !== 1 ? "s" : ""} de ruta en el sistema:`);
        out.push("");
        for (const row of routeAfectaciones) {
            out.push(formatRouteAfectacionLinePrensa(row));
        }
    }
    out.push("");

    out.push("⏳ Demoras");
    if (s.demoraCodigos.length === 0) {
        out.push("Sin demoras.");
    } else {
        out.push("Los más frecuentes del día son:");
        for (const row of s.demoraCodigos.slice(0, 8)) {
            out.push(`  • ${formatDelayCodeDisplay(row.code)}: ${pctEsAr(row.pct)}%`);
        }
    }
    out.push("");

    out.push("Cancelaciones");
    if (s.countCancelados === 0 && s.paxCancelados === 0) {
        out.push("Sin cancelaciones.");
    } else {
        out.push(
            `${s.countCancelados} vuelo${s.countCancelados !== 1 ? "s" : ""} cancelado${s.countCancelados !== 1 ? "s" : ""}; ` +
                `pasajeros según programación afectados: ${s.paxCancelados}.`
        );
        if (s.motivosCancelacionDetalle.length > 0) {
            out.push("Detalle por motivo:");
            for (const m of s.motivosCancelacionDetalle.slice(0, 10)) {
                out.push(
                    `  • ${m.text}: ${m.count} vuelo${m.count !== 1 ? "s" : ""}, ${m.pax} PAX.`
                );
            }
        }
    }

    return out.join("\n");
}
