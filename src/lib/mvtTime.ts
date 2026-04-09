import type { SSEE } from "../types";

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

/** Tarjetas: "COD 93 - 00:01" */
export function formatDelayLine(cod: string, timeRaw: string): string {
    const c = cod.trim();
    if (!c) return "";
    const t = formatMinutesToHHMM(parseTimeToMinutes(timeRaw));
    return `COD ${c} - ${t}`;
}
