import type { Flight, SSEE } from "../types";

type MvtData = NonNullable<Flight["mvtData"]>;

/** Resumen compacto de filas SSEE para tarjetas (p. ej. "WCHS 2 · BLND 1"). */
export function formatMvtSseeSummary(ssee: SSEE[] | undefined): string {
    if (!ssee?.length) return "—";
    const parts = ssee
        .filter((s) => {
            const t = String(s.type ?? "").trim();
            const q = String(s.qty ?? "").trim();
            if (!t || !q || q === "0") return false;
            return true;
        })
        .map((s) => `${String(s.type).trim()} ${String(s.qty).trim()}`);
    return parts.length ? parts.join(" · ") : "—";
}

/** MVT time fields: digits only, same parsing as MVTForm */
export function parseTimeToMinutes(timeStr: string | undefined | null): number {
    const raw = String(timeStr ?? "").replace(/[^0-9]/g, "");
    if (!raw) return 0;
    if (raw.length <= 2) {
        return parseInt(raw, 10);
    }
    let hh, mm;
    if (raw.length === 3) {
        hh = parseInt(raw.substring(0, 1), 10);
        mm = parseInt(raw.substring(1, 3), 10);
    } else {
        hh = parseInt(raw.substring(0, 2), 10);
        mm = parseInt(raw.substring(2, 4), 10);
    }
    return hh * 60 + mm;
}

export function formatMinutesToHHMM(mins: number): string {
    const isNegative = mins < 0;
    const absMins = Math.abs(mins);
    const h = Math.floor(absMins / 60).toString().padStart(2, "0");
    const m = (absMins % 60).toString().padStart(2, "0");
    return `${isNegative ? "-" : ""}${h}:${m}`;
}

/** Campo horario MVT/programación (HHMM, HMM, HH:MM) → `HH:MM` para lectura. */
export function formatMvtTimeDisplay(timeStr: string | undefined | null): string {
    const raw = String(timeStr ?? "").replace(/\D/g, "");
    if (raw.length < 2) return "—";
    return formatMinutesToHHMM(parseTimeToMinutes(timeStr));
}

/** Tarjetas: "COD 93 - 00:01" */
export function formatDelayLine(cod: string, timeRaw: string): string {
    const c = cod.trim();
    if (!c) return "";
    const t = formatMinutesToHHMM(parseTimeToMinutes(timeRaw));
    return `COD ${c} - ${t}`;
}

export function hasStoredMvtDelayFields(m: MvtData): boolean {
    return (
        parseTimeToMinutes(m.dlyTime1) > 0 ||
        parseTimeToMinutes(m.dlyTime2) > 0 ||
        String(m.dlyCod1 ?? "").trim() !== "" ||
        String(m.dlyCod2 ?? "").trim() !== "" ||
        String(m.observaciones ?? "").trim() !== ""
    );
}

export function clearMvtDelayFields(m: MvtData): MvtData {
    return {
        ...m,
        dlyCod1: "",
        dlyTime1: "",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "",
    };
}

/** Si ATD ≤ STD, borra códigos/tiempos DLY huérfanos (p. ej. ATD corregido tras cargar demora). */
export function sanitizeMvtDelaysIfOnTime(mvt: MvtData, std: string): MvtData {
    const status = computeMvtDelayStatus(std, mvt.atd, mvt.dlyTime1, mvt.dlyTime2);
    if (status.isDelayed || !hasStoredMvtDelayFields(mvt)) return mvt;
    return clearMvtDelayFields(mvt);
}

/** Líneas de demora para tarjeta / listados: solo si ATD > STD y hay código cargado. */
export function getMvtDelayDisplayLines(f: Flight): string[] {
    const m = f.mvtData;
    if (!m) return [];
    const { isDelayed } = computeMvtDelayStatus(f.std, m.atd, m.dlyTime1, m.dlyTime2);
    if (!isDelayed) return [];
    return [
        m.dlyCod1?.trim() ? formatDelayLine(m.dlyCod1, m.dlyTime1 || "") : "",
        m.dlyCod2?.trim() ? formatDelayLine(m.dlyCod2, m.dlyTime2 || "") : "",
    ].filter(Boolean);
}

export interface MvtDelayStatus {
    isDelayed: boolean;
    delayMinutes: number;
    justifiedMinutes: number;
    remDelay: number;
    /** Sin demora ATD>STD, o demora cubierta por DLY TIME 1+2. */
    delaysJustified: boolean;
}

/** Misma lógica que el formulario MVT (ATD vs STD de programación). */
export function computeMvtDelayStatus(
    std: string,
    atd: string,
    dlyTime1: string,
    dlyTime2: string,
): MvtDelayStatus {
    const stdMinutes = parseTimeToMinutes(std);
    const atdMinutes = parseTimeToMinutes(atd);
    const atdStr = String(atd ?? "");
    const isDelayed = atdStr.replace(/\D/g, "").length >= 3 && atdMinutes > stdMinutes;
    const delayMinutes = isDelayed ? atdMinutes - stdMinutes : 0;
    const justifiedMinutes = parseTimeToMinutes(dlyTime1) + parseTimeToMinutes(dlyTime2);
    const remDelay = delayMinutes - justifiedMinutes;
    return {
        isDelayed,
        delayMinutes,
        justifiedMinutes,
        remDelay,
        delaysJustified: !isDelayed || remDelay <= 0,
    };
}

export function getMvtDelaySendBlockMessage(status: MvtDelayStatus): string | null {
    if (status.delaysJustified) return null;
    return `No se puede enviar el MVT: quedan ${formatMinutesToHHMM(status.remDelay)} de demora sin justificar. Completá códigos y tiempos DLY hasta que «A justificar» sea 00:00.`;
}

function isMvtDelayLineComplete(dlyCod: string, dlyTime: string): boolean {
    const code = String(dlyCod ?? "").trim();
    const minutes = parseTimeToMinutes(dlyTime);
    return code !== "" && minutes > 0;
}

export type MvtSendDelayValidation =
    | { ok: true; status: MvtDelayStatus }
    | { ok: false; status: MvtDelayStatus; message: string };

/**
 * Validación para enviar MVT (no aplica a corrección HCC post-envío).
 * - ATD obligatorio.
 * - Si ATD > STD: tiempos DLY deben cubrir la demora (remDelay 0) y al menos un par código+tiempo completo.
 */
export function validateMvtSendDelays(
    std: string,
    atd: string,
    dlyCod1: string,
    dlyTime1: string,
    dlyCod2: string,
    dlyTime2: string,
): MvtSendDelayValidation {
    const status = computeMvtDelayStatus(std, atd, dlyTime1, dlyTime2);
    const atdDigits = String(atd ?? "").replace(/\D/g, "");

    if (atdDigits.length < 3) {
        return {
            ok: false,
            status,
            message: "Ingresá ATD (hora de salida) antes de enviar el MVT.",
        };
    }

    if (!status.isDelayed) {
        return { ok: true, status };
    }

    if (status.remDelay > 0) {
        return {
            ok: false,
            status,
            message: getMvtDelaySendBlockMessage(status)!,
        };
    }

    const line1 = isMvtDelayLineComplete(dlyCod1, dlyTime1);
    const line2 = isMvtDelayLineComplete(dlyCod2, dlyTime2);
    if (!line1 && !line2) {
        return {
            ok: false,
            status,
            message: `Hay ${formatMinutesToHHMM(status.delayMinutes)} de demora vs STD: cargá al menos un código DLY con su tiempo hasta que «A justificar» quede en 00:00.`,
        };
    }

    if (parseTimeToMinutes(dlyTime1) > 0 && !String(dlyCod1 ?? "").trim()) {
        return {
            ok: false,
            status,
            message: "Seleccioná el código de demora 1 o borrá el tiempo DLY 1.",
        };
    }
    if (parseTimeToMinutes(dlyTime2) > 0 && !String(dlyCod2 ?? "").trim()) {
        return {
            ok: false,
            status,
            message: "Seleccioná el código de demora 2 o borrá el tiempo DLY 2.",
        };
    }

    return { ok: true, status };
}
