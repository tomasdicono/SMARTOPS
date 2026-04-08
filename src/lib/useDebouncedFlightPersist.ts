import { useEffect, useRef } from "react";

/**
 * Persistencia diferida (Firebase) + envío inmediato al ocultar pestaña o refrescar,
 * para no perder lo último escrito si el debounce no alcanzó a ejecutarse.
 */
export function useDebouncedFlightPersist<T>(
    data: T,
    persist: ((payload: T) => void) | undefined,
    opts: { readOnly: boolean; flightId: string }
): void {
    const skipNext = useRef(true);
    const dataRef = useRef(data);
    dataRef.current = data;
    const persistRef = useRef(persist);
    persistRef.current = persist;

    useEffect(() => {
        skipNext.current = true;
    }, [opts.flightId]);

    useEffect(() => {
        if (opts.readOnly || !persistRef.current) return;
        if (skipNext.current) {
            skipNext.current = false;
            return;
        }
        const t = window.setTimeout(() => {
            persistRef.current?.(dataRef.current);
        }, 500);
        return () => clearTimeout(t);
    }, [data, opts.readOnly, opts.flightId]);

    useEffect(() => {
        if (opts.readOnly) return;

        const flush = () => {
            persistRef.current?.(dataRef.current);
        };

        window.addEventListener("pagehide", flush);
        const onVis = () => {
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [opts.readOnly, opts.flightId]);
}
