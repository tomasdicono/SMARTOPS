import type { Flight, HitosData, PeaPosition } from "../types";
import { formatLoadBaysForMessage, inferLoadBaysFamily, normalizeLoadBays } from "./a321LoadBays";

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
    const baysNorm = normalizeLoadBays(raw.loadBays);
    let loadOut = z(raw.load);
    if (!loadOut.trim() && baysNorm) {
        loadOut = formatLoadBaysForMessage(baysNorm, inferLoadBaysFamily(baysNorm));
    }
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
        load: loadOut,
        loadBays: baysNorm,
        fob: z(raw.fob),
        ssee: Array.isArray(raw.ssee) ? raw.ssee : [],
        infoSup: z(raw.infoSup),
        supervisor: z(raw.supervisor),
    };
    /** No asignar la clave si no hay valor: Firebase rechaza `undefined` en propiedades anidadas. */
    if (raw.mvtSentAt != null && String(raw.mvtSentAt).trim() !== "") {
        out.mvtSentAt = String(raw.mvtSentAt);
    }
    if (raw.mvtEditedByHccAt != null && String(raw.mvtEditedByHccAt).trim() !== "") {
        out.mvtEditedByHccAt = String(raw.mvtEditedByHccAt);
    }
    return out;
}

function pickNonEmptyString(incoming: string | undefined, prev: string | undefined): string {
    const inc = (incoming ?? "").trim();
    if (inc) return incoming ?? "";
    return prev ?? "";
}

/**
 * Auto-guardado: no reemplazar en Firebase un campo ya cargado por un string vacío del formulario
 * (p. ej. al abrir el modal antes de que llegue el snapshot completo).
 */
export function mergeMvtDataForPersist(
    prev: NonNullable<Flight["mvtData"]>,
    incoming: NonNullable<Flight["mvtData"]>,
): NonNullable<Flight["mvtData"]> {
    const p = normalizeMvtData(prev);
    const inc = normalizeMvtData(incoming);
    const out: NonNullable<Flight["mvtData"]> = {
        atd: pickNonEmptyString(inc.atd, p.atd),
        off: pickNonEmptyString(inc.off, p.off),
        eta: pickNonEmptyString(inc.eta, p.eta),
        dlyCod1: pickNonEmptyString(inc.dlyCod1, p.dlyCod1),
        dlyTime1: pickNonEmptyString(inc.dlyTime1, p.dlyTime1),
        dlyCod2: pickNonEmptyString(inc.dlyCod2, p.dlyCod2),
        dlyTime2: pickNonEmptyString(inc.dlyTime2, p.dlyTime2),
        observaciones: pickNonEmptyString(inc.observaciones, p.observaciones),
        paxActual: pickNonEmptyString(inc.paxActual, p.paxActual),
        inf: pickNonEmptyString(inc.inf, p.inf),
        totalBags: pickNonEmptyString(inc.totalBags, p.totalBags),
        totalCarga: pickNonEmptyString(inc.totalCarga, p.totalCarga),
        load: pickNonEmptyString(inc.load, p.load),
        fob: pickNonEmptyString(inc.fob, p.fob),
        ssee: inc.ssee?.length ? inc.ssee : p.ssee ?? [],
        infoSup: pickNonEmptyString(inc.infoSup, p.infoSup),
        supervisor: pickNonEmptyString(inc.supervisor, p.supervisor),
    };
    const bays = inc.loadBays ?? p.loadBays;
    if (bays) out.loadBays = bays;
    if (inc.mvtSentAt?.trim()) out.mvtSentAt = inc.mvtSentAt;
    else if (p.mvtSentAt?.trim()) out.mvtSentAt = p.mvtSentAt;
    if (inc.mvtEditedByHccAt?.trim()) out.mvtEditedByHccAt = inc.mvtEditedByHccAt;
    else if (p.mvtEditedByHccAt?.trim()) out.mvtEditedByHccAt = p.mvtEditedByHccAt;
    return out;
}

/** Une dos lecturas de `mvtData` sin que strings vacíos de una pisen valores de la otra. */
export function mergeMvtDataUnion(
    a: NonNullable<Flight["mvtData"]>,
    b: NonNullable<Flight["mvtData"]>,
): NonNullable<Flight["mvtData"]> {
    return mergeMvtDataForPersist(mergeMvtDataForPersist(a, b), a);
}

/** Mismo criterio que merge MVT para borradores de Hitos. */
export function mergeHitosDataForPersist(prev: HitosData, incoming: HitosData): HitosData {
    const p = normalizeHitosData(prev);
    const inc = normalizeHitosData(incoming);
    const entries: Record<string, string> = { ...p.entries };
    for (const [k, v] of Object.entries(inc.entries)) {
        if (String(v).trim()) entries[k] = v;
    }
    const out: HitosData = {
        ganttChartName: inc.ganttChartName.trim() ? inc.ganttChartName : p.ganttChartName,
        ata: pickNonEmptyString(inc.ata, p.ata),
        entries,
        gpuStart: pickNonEmptyString(inc.gpuStart, p.gpuStart),
        gpuEnd: pickNonEmptyString(inc.gpuEnd, p.gpuEnd),
        gpuNotUsed: inc.gpuNotUsed || p.gpuNotUsed,
        peaPosition: inc.peaPosition || p.peaPosition,
    };
    if (inc.hitosSentAt?.trim()) out.hitosSentAt = inc.hitosSentAt;
    else if (p.hitosSentAt?.trim()) out.hitosSentAt = p.hitosSentAt;
    return out;
}

/** Une dos lecturas de hitos sin perder entradas ya cargadas. */
export function mergeHitosDataUnion(a: HitosData, b: HitosData): HitosData {
    return mergeHitosDataForPersist(mergeHitosDataForPersist(a, b), a);
}

/** Actualiza solo campos de demora sobre un MVT ya enviado (corrección HCC). */
export function applyMvtDelayPatch(
    existing: NonNullable<Flight["mvtData"]>,
    patch: NonNullable<Flight["mvtData"]>,
): NonNullable<Flight["mvtData"]> {
    return {
        ...existing,
        dlyCod1: patch.dlyCod1,
        dlyTime1: patch.dlyTime1,
        dlyCod2: patch.dlyCod2,
        dlyTime2: patch.dlyTime2,
        observaciones: patch.observaciones,
    };
}

export function emptyHitosData(): HitosData {
    return {
        ganttChartName: "",
        ata: "",
        entries: {},
        gpuStart: "",
        gpuEnd: "",
        gpuNotUsed: false,
        peaPosition: "",
    };
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
    const peaRaw = raw.peaPosition;
    const peaPosition: PeaPosition =
        peaRaw === "remota" || peaRaw === "manga" ? peaRaw : "";

    const out: HitosData = {
        ganttChartName: typeof raw.ganttChartName === "string" ? raw.ganttChartName : "",
        ata: typeof raw.ata === "string" ? raw.ata : "",
        entries: safeEntries,
        gpuStart: typeof raw.gpuStart === "string" ? raw.gpuStart : "",
        gpuEnd: typeof raw.gpuEnd === "string" ? raw.gpuEnd : "",
        gpuNotUsed: typeof raw.gpuNotUsed === "boolean" ? raw.gpuNotUsed : false,
        peaPosition,
    };
    if (raw.hitosSentAt != null && String(raw.hitosSentAt).trim() !== "") {
        out.hitosSentAt = String(raw.hitosSentAt);
    }
    return out;
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
