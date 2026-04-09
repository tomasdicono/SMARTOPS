import type { Flight, HitosData } from "../types";

export function emptyMvtData(): NonNullable<Flight["mvtData"]> {
    return {
        atd: "",
        off: "",
        eta: "",
        dlyCod1: "",
        dlyTime1: "",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "",
        paxActual: "",
        inf: "",
        totalBags: "",
        totalCarga: "",
        load: "",
        fob: "",
        ssee: [],
        infoSup: "",
        supervisor: "",
    };
}

/** MVT parcial desde Firebase (persistencia incompleta) → forma segura. */
export function normalizeMvtData(raw?: Flight["mvtData"] | null): NonNullable<Flight["mvtData"]> {
    const z = (v: string | undefined) => v ?? "";
    if (!raw || typeof raw !== "object") return emptyMvtData();
    const out: NonNullable<Flight["mvtData"]> = {
        atd: z(raw.atd),
        off: z(raw.off),
        eta: z(raw.eta),
        dlyCod1: z(raw.dlyCod1),
        dlyTime1: z(raw.dlyTime1),
        dlyCod2: z(raw.dlyCod2),
        dlyTime2: z(raw.dlyTime2),
        observaciones: z(raw.observaciones),
        paxActual: z(raw.paxActual),
        inf: z(raw.inf),
        totalBags: z(raw.totalBags),
        totalCarga: z(raw.totalCarga),
        load: z(raw.load),
        fob: z(raw.fob),
        ssee: Array.isArray(raw.ssee) ? raw.ssee : [],
        infoSup: z(raw.infoSup),
        supervisor: z(raw.supervisor),
    };
    /** No asignar la clave si no hay valor: Firebase rechaza `undefined` en propiedades anidadas. */
    if (raw.mvtSentAt != null && String(raw.mvtSentAt).trim() !== "") {
        out.mvtSentAt = String(raw.mvtSentAt);
    }
    return out;
}

export function emptyHitosData(): HitosData {
    return { ganttChartName: "", ata: "", entries: {} };
}

/**
 * Hitos parciales (solo carta, o sin `entries`/`ata`) rompen `.ata.length` y el spread de entries.
 */
export function normalizeHitosData(raw?: Partial<HitosData> | null): HitosData {
    const e = emptyHitosData();
    if (!raw || typeof raw !== "object") return e;
    const entries = raw.entries;
    const safeEntries: Record<string, string> =
        entries && typeof entries === "object" && !Array.isArray(entries)
            ? Object.fromEntries(
                  Object.entries(entries as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)])
              )
            : {};
    return {
        ganttChartName: typeof raw.ganttChartName === "string" ? raw.ganttChartName : "",
        ata: typeof raw.ata === "string" ? raw.ata : "",
        entries: safeEntries,
    };
}

/** Crew hitos: objeto plano de strings; Firebase puede devolver null o claves raras. */
export function normalizeHitosCrewData(raw?: Record<string, string> | null): Record<string, string> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (v == null) continue;
        out[k] = String(v);
    }
    return out;
}
