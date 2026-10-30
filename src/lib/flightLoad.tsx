import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { eachIsoInRange } from "./flightsByDate";

export type EnsureFlightRangeOptions = { includeRoutes?: boolean };

export type FlightLoadApi = {
    loadedFlightIsos: ReadonlySet<string>;
    failedFlightIsos: ReadonlySet<string>;
    ensureFlightRange: (fromIso: string, toIso: string, opts?: EnsureFlightRangeOptions) => void;
    ensureFlightIsos: (isos: string[]) => void;
};

const FlightLoadContext = createContext<FlightLoadApi | null>(null);

export function FlightLoadProvider({ value, children }: { value: FlightLoadApi; children: ReactNode }) {
    return <FlightLoadContext.Provider value={value}>{children}</FlightLoadContext.Provider>;
}

export function useFlightLoad(): FlightLoadApi | null {
    return useContext(FlightLoadContext);
}

/** Pide los vuelos de un rango. Los días ya descargados no se vuelven a leer. */
export function useEnsureFlightRange(from: string, to: string, includeRoutes = false) {
    const api = useFlightLoad();
    const ensure = api?.ensureFlightRange;
    useEffect(() => {
        if (!from || !to || !ensure) return;
        ensure(from, to, { includeRoutes });
    }, [ensure, from, to, includeRoutes]);
}

export function FlightRangeStatus({ from, to }: { from: string; to: string }) {
    const api = useFlightLoad();
    const days = useMemo(() => (from && to ? eachIsoInRange(from, to) : []), [from, to]);
    if (!api || days.length === 0) return null;
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
        return <p className="text-sm font-semibold text-slate-500">Cargando vuelos del período…</p>;
    }
    return null;
}
