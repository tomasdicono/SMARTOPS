import type { RouteAfectacionEntry } from "../types";

export function coerceRouteAfectacion(raw: unknown, id: string): RouteAfectacionEntry {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
        id,
        flightId: String(o.flightId ?? ""),
        flt: String(o.flt ?? ""),
        reg: String(o.reg ?? ""),
        depAntes: String(o.depAntes ?? ""),
        arrAntes: String(o.arrAntes ?? ""),
        depDespues: String(o.depDespues ?? ""),
        arrDespues: String(o.arrDespues ?? ""),
        at: String(o.at ?? ""),
        by: String(o.by ?? ""),
    };
}

export function normalizeAirportCode(s: string): string {
    return String(s ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 4);
}
