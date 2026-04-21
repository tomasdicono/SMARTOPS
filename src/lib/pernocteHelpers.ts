import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { flightNeedsCleaningWarning, getHitosDepartureTime, isJesFlightNumber } from "./flightHelpers";
import type { PernocteRowState } from "../types";

/** Fila de tabla Pernocte derivada de la programación del día */
export interface PernocteTableRow {
    reg: string;
    /** Último aeropuerto de llegada: `arr` del último JES (por hora de salida) de esa matrícula en la fecha */
    ato: string;
}

/**
 * Todas las matrículas asignadas a vuelos JES (3000–3999) del día, sin repetir.
 * ATO = aeropuerto de llegada del último sector JES de cada cola (orden por STD/ETD).
 */
export function computePernocteRows(flights: Flight[], selectedIso: string): PernocteTableRow[] {
    const dayFlights = flights.filter(
        (f) => !f.cancelled && flightDateToIso(f) === selectedIso && isJesFlightNumber(f.flt)
    );
    const byReg = new Map<string, Flight[]>();
    for (const f of dayFlights) {
        const r = String(f.reg ?? "").trim();
        if (!r) continue;
        if (!byReg.has(r)) byReg.set(r, []);
        byReg.get(r)!.push(f);
    }
    const rows: PernocteTableRow[] = [];
    for (const [reg, list] of byReg) {
        const sorted = [...list].sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b)));
        const last = sorted[sorted.length - 1];
        const ato = String(last.arr ?? "").trim() || "—";
        rows.push({ reg, ato });
    }
    return rows.sort((a, b) => a.reg.localeCompare(b.reg));
}

/**
 * Último sector JES (3000–3999) del día para esa matrícula — mismo criterio que la tabla Pernocte (pernocte en `arr`).
 */
export function isPernocteLastJesSector(f: Flight, dayFlights: Flight[], selectedIso: string): boolean {
    if (f.cancelled) return false;
    if (flightDateToIso(f) !== selectedIso) return false;
    if (!isJesFlightNumber(f.flt)) return false;
    const reg = String(f.reg ?? "").trim();
    if (!reg) return false;
    const list = dayFlights.filter(
        (x) =>
            !x.cancelled &&
            flightDateToIso(x) === selectedIso &&
            isJesFlightNumber(x.flt) &&
            String(x.reg ?? "").trim() === reg
    );
    if (list.length === 0) return false;
    const sorted = [...list].sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b)));
    return sorted[sorted.length - 1].id === f.id;
}

/** Tarjetas visibles para rol Limpieza: bloque &gt; 3:30 h (misma regla que aviso de cabina) o último JES del día (pernocte). */
export function flightVisibleToLimpiezaBoard(f: Flight, dayFlights: Flight[], selectedIso: string): boolean {
    if (f.cancelled) return false;
    return flightNeedsCleaningWarning(f) || isPernocteLastJesSector(f, dayFlights, selectedIso);
}

export function defaultPernocteRow(): PernocteRowState {
    return { limpieza: false, precargaQ: "", precarga: false };
}

export function coercePernocteRow(raw: unknown): PernocteRowState {
    if (!raw || typeof raw !== "object") return defaultPernocteRow();
    const o = raw as Record<string, unknown>;
    return {
        limpieza: !!o.limpieza,
        precargaQ: String(o.precargaQ ?? "").replace(/\D/g, ""),
        precarga: !!o.precarga,
    };
}
