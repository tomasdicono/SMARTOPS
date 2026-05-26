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
    const dataRef = useRef(data);
    const persistRef = useRef(persist);

    useEffect(() => {
        dataRef.current = data;
        persistRef.current = persist;
    });

    const lastPersistedJson = useRef("");

    // Inicializar o cambiar de vuelo
    useEffect(() => {
        lastPersistedJson.current = JSON.stringify(dataRef.current);
    }, [opts.flightId]);

    useEffect(() => {
        if (opts.readOnly || !persistRef.current) return;

        const currentJson = JSON.stringify(data);
        if (currentJson === lastPersistedJson.current) {
            return;
        }

        const t = window.setTimeout(() => {
            persistRef.current?.(dataRef.current);
            lastPersistedJson.current = currentJson;
        }, 500);

        return () => clearTimeout(t);
    }, [data, opts.readOnly, opts.flightId]);

    useEffect(() => {
        if (opts.readOnly) return;

        const flush = () => {
            const currentJson = JSON.stringify(dataRef.current);
            if (currentJson !== lastPersistedJson.current) {
                persistRef.current?.(dataRef.current);
                lastPersistedJson.current = currentJson;
            }
        };

        window.addEventListener("pagehide", flush);
        const onVis = () => {
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            flush();
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [opts.readOnly, opts.flightId]);
}
