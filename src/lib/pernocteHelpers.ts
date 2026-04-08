import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { getHitosDepartureTime, isJesFlightNumber } from "./flightHelpers";
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
