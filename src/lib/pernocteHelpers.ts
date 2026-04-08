import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { getHitosDepartureTime } from "./flightHelpers";
import { parseTimeToMinutes } from "./mvtTime";
import type { PernocteRowState } from "../types";

/**
 * Matrículas que operaron en la fecha y ya no tienen más sectores programados ese día
 * (última salida anterior al instante actual si la fecha es hoy; todo el día si la fecha es pasada).
 * Fechas futuras: ninguna.
 */
export function computePernocteRegistrations(flights: Flight[], selectedIso: string): string[] {
    const dayFlights = flights.filter((f) => !f.cancelled && flightDateToIso(f) === selectedIso);
    const byReg = new Map<string, Flight[]>();
    for (const f of dayFlights) {
        const r = String(f.reg ?? "").trim();
        if (!r) continue;
        if (!byReg.has(r)) byReg.set(r, []);
        byReg.get(r)!.push(f);
    }

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const out: string[] = [];
    for (const [reg, list] of byReg) {
        const sorted = [...list].sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b)));
        const last = sorted[sorted.length - 1];
        const lastMins = parseTimeToMinutes(getHitosDepartureTime(last));

        if (selectedIso < todayIso) {
            out.push(reg);
        } else if (selectedIso > todayIso) {
            // día futuro: aún no hay aviones “cerrados”
        } else {
            if (lastMins <= nowMins) out.push(reg);
        }
    }
    return out.sort((a, b) => a.localeCompare(b));
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
