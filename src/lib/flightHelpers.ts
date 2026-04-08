import type { Flight } from "../types";

const MONTH_ABBRS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** Fecha de vuelo → "04APR" (dd + mes en inglés), acepta DD-MM-YYYY o YYYY-MM-DD */
export function formatFlightDateDDMMM(dateStr: string): string {
    if (!dateStr) return "";
    const parts = dateStr.split("-").map((p) => p.trim());
    if (parts.length !== 3) return dateStr;
    let day: number;
    let month: number;
    if (parts[0].length === 4) {
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
    } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
    }
    if (!Number.isFinite(day) || !Number.isFinite(month) || month < 1 || month > 12) {
        return dateStr;
    }
    return `${String(day).padStart(2, "0")}${MONTH_ABBRS[month - 1]}`;
}

export function getFlightNumberDigits(flt: string): string {
    const m = flt.match(/\d+/);
    return m ? m[0] : flt.replace(/\D/g, "") || flt;
}

/** Título listado MVT: MVT OUT JES3102 AEP-COR 04APR */
export function buildMvtOutListTitle(f: Flight): string {
    const prefix = getAirlinePrefix(f.flt);
    const num = getFlightNumberDigits(f.flt);
    const dayMonth = formatFlightDateDDMMM(f.date);
    return `MVT OUT ${prefix}${num} ${f.dep}-${f.arr} ${dayMonth}`;
}

export function getAirlinePrefix(flt: string): string {
    const match = flt.match(/\d+/);
    if (!match) return "JES"; // default fallback

    const num = parseInt(match[0], 10);

    if (num >= 0 && num <= 1000) return "JAT";
    if (num >= 3000 && num <= 3999) return "JES";
    if (num >= 7000 && num <= 8000) return "JAP";

    return "JES"; // Default fallback if outside these ranges
}

export const UTC_OFFSETS: Record<string, number> = {
    // Argentina (Add 3)
    AEP: 3, EZE: 3, COR: 3, MDZ: 3, BRC: 3, IGR: 3, SLA: 3, NQN: 3, FTE: 3, USH: 3, TUC: 3, CNQ: 3, PSS: 3, VDM: 3, LUQ: 3, RGL: 3, CRD: 3, JUJ: 3, RVD: 3,
    // Chile (Add 3 for summer time)
    SCL: 3, CJC: 3, ANF: 3, IQQ: 3, ARI: 3, LSC: 3, CPO: 3, PMC: 3, BBA: 3, ZCO: 3, PUQ: 3,
    // Peru (Add 5)
    LIM: 5, CUZ: 5, AQP: 5, PIU: 5, TRU: 5, IQT: 5,
    // Colombia (Add 5)
    BOG: 5, MDE: 5, CTG: 5, PEI: 5, CLO: 5, SMR: 5, CUC: 5, BGA: 5,
    // Brazil (Add 3)
    GIG: 3, GRU: 3, FLN: 3, NAT: 3, REC: 3, SSA: 3, FOR: 3, CWB: 3, POA: 3, IGU: 3,
    // Paraguay, Uruguay & Ecuador
    ASU: 4, MVD: 3, PDP: 3, UIO: 5, GYE: 5,
};

export const getUTCOffset = (airportCode: string): number => {
    return UTC_OFFSETS[airportCode.toUpperCase()] || 3; // Default fallback to 3
};

export const formatTimeInUTC = (timeStr: string, airportCode: string): string => {
    if (!timeStr) return "";
    const raw = timeStr.replace(/[^0-9]/g, "");
    if (raw.length < 3) return timeStr; // Return as is if too short to parse

    let hh, mm;
    if (raw.length === 3) {
        hh = parseInt(raw.substring(0, 1), 10);
        mm = raw.substring(1, 3);
    } else {
        hh = parseInt(raw.substring(0, 2), 10);
        mm = raw.substring(2, 4);
    }

    const offset = getUTCOffset(airportCode);
    let utcHH = hh + offset;

    if (utcHH >= 24) utcHH -= 24;
    else if (utcHH < 0) utcHH += 24;

    return `${utcHH.toString().padStart(2, '0')}${mm}`;
};
