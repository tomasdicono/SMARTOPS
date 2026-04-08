/** MVT time fields: digits only, same parsing as MVTForm */
export function parseTimeToMinutes(timeStr: string): number {
    const raw = timeStr.replace(/[^0-9]/g, "");
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
