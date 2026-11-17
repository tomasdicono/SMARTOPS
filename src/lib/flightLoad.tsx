import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { clampIsoRangeToToday, eachIsoInRange } from "./flightsByDate";
import type { Flight } from "../types";
import type { LightPrep } from "./flightLight";

export type EnsureFlightRangeOptions = { includeRoutes?: boolean };

export type FlightLoadApi = {
    loadedFlightIsos: ReadonlySet<string>;
    failedFlightIsos: ReadonlySet<string>;
    ensureFlightRange: (fromIso: string, toIso: string, opts?: EnsureFlightRangeOptions) => void;
    ensureFlightIsos: (isos: string[]) => void;
    summaryByIso: Readonly<Record<string, Flight[]>>;
    loadedSummaryIsos: ReadonlySet<string>;
    lightPrep: LightPrep | null;
    ensureSummaryRange: (fromIso: string, toIso: string) => void;
};

const FlightLoadContext = createContext<FlightLoadApi | null>(null);

export function FlightLoadProvider({ value, children }: { value: FlightLoadApi; children: ReactNode }) {
    return <FlightLoadContext.Provider value={value}>{children}</FlightLoadContext.Provider>;
}

export function useFlightLoad(): FlightLoadApi | null {
    return useContext(FlightLoadContext);
}

/** Pide el resumen liviano de un rango (dashboard, combustible, uso, GPU). */
export function useEnsureSummaryRange(from: string, to: string) {
    const api = useFlightLoad();
    const ensure = api?.ensureSummaryRange;
    const { lo, hi } = clampIsoRangeToToday(from, to);
    useEffect(() => {
        if (!lo || !hi || !ensure) return;
        ensure(lo, hi);
    }, [ensure, lo, hi]);
}

/** Vuelos-resumen ya descargados para el rango, recortado a hoy. */
export function useSummaryFlights(from: string, to: string): Flight[] {
    const api = useFlightLoad();
    const { lo, hi } = clampIsoRangeToToday(from, to);
    useEnsureSummaryRange(lo, hi);
    return useMemo(() => {
        if (!api || !lo || !hi) return [];
        const out: Flight[] = [];
        for (const [iso, list] of Object.entries(api.summaryByIso)) {
            if (iso >= lo && iso <= hi) out.push(...list);
        }
        return out;
    }, [api, lo, hi]);
}
export function useEnsureFlightRange(from: string, to: string, includeRoutes = false) {
    const api = useFlightLoad();
    const ensure = api?.ensureFlightRange;
    useEffect(() => {
        if (!from || !to || !ensure) return;
        ensure(from, to, { includeRoutes });
    }, [ensure, from, to, includeRoutes]);
}

export function FlightRangeStatus({
    from,
    to,
    source = "flights",
}: {
    from: string;
    to: string;
    source?: "flights" | "summary";
}) {
    const api = useFlightLoad();
    const { lo, hi } = clampIsoRangeToToday(from, to);
    const days = useMemo(() => (lo && hi ? eachIsoInRange(lo, hi) : []), [lo, hi]);
    if (!api || days.length === 0) return null;
        if (source === "summary") {
        const failed = days.some((d) => api.failedFlightIsos.has(d));
        if (failed) {
            return (
                <p className="text-sm font-semibold text-rose-700">
                    No se pudo preparar una parte de ese período. Volvé a elegir las fechas para reintentar.
                </p>
            );
        }
        const ready = days.every((d) => api.loadedSummaryIsos.has(d));
        if (ready) return null;
        if (api.lightPrep && api.lightPrep.total > 0) {
            return (
                <p className="text-sm font-semibold text-slate-500">
                    Preparando históricos ({api.lightPrep.done} de {api.lightPrep.total})…
                </p>
            );
        }
        return <p className="text-sm font-semibold text-slate-500">Cargando resumen del período…</p>;
    }
    const failed = days.some((d) => api.failedFlightIsos.has(d));
    const ready = days.every((d) => api.loadedFlightIsos.has(d));
    if (failed) {
        return (
            <p className="text-sm font-semibold text-rose-700">
                No se pudo descargar una parte de ese período. Volvé a elegir las fechas para reintentar.
            </p>
        );
    }
    if (!ready) {
        if (api.lightPrep && api.lightPrep.total > 0) {
            return (
                <p className="text-sm font-semibold text-slate-500">
                    Preparando históricos ({api.lightPrep.done} de {api.lightPrep.total})…
                </p>
            );
        }
        return <p className="text-sm font-semibold text-slate-500">Cargando vuelos del período…</p>;
    }
    return null;
}
