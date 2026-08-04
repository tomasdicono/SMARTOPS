/** Códigos de demora (COD DLY) para MVT — valor almacenado = código numérico como string */
export interface DelayCodeOption {
    code: string;
    label: string;
}

export const DELAY_CODE_OPTIONS: DelayCodeOption[] = [
    { code: "1", label: "DEFAULT CODE" },
    { code: "2", label: "DELAY due to MOTION/ITC (Base)" },
    { code: "3", label: "DELAY OR LACK OF BUSES" },
    { code: "4", label: "LATE OR INCORRECT AIRCRAFT ROTATION" },
    { code: "5", label: "NATURAL DISASTER" },
    { code: "6", label: "NO GATE/STAND AVAILABILITY DUE TO OWN AIRLINE ACTIVITY" },
    { code: "7", label: "LATE ARRIVAL OF CREW BY SUPPLIER" },
    { code: "8", label: "PAX DISRUPTIVE" },
    { code: "9", label: "SCHEDULED GROUND TIME LESS THAN DECLARED MINIMUM GROUND TIME" },
    { code: "10", label: "REACTIONARY AIRPORT" },
    { code: "11", label: "LATE CHECK-IN" },
    { code: "12", label: "LATE CHECK-IN" },
    { code: "14", label: "OVERSALES" },
    { code: "15", label: "BOARDING" },
    { code: "18", label: "BAGGAGE PROCESSING" },
    { code: "19", label: "REDUCED MOBILITY" },
    { code: "20", label: "REACTIONARY OTHERS" },
    { code: "23", label: "LATE ACCEPTANCE" },
    { code: "30", label: "REACTIONARY AIRPORT (EXTERNO)" },
    { code: "31", label: "AIRCRAFT DOCUMENTATION LATE/INACCURATE" },
    { code: "32", label: "LOADING, UNLOADING, BULKY/SPECIAL LOAD, CABIN LOAD, LACK OF LOADING STAFF" },
    { code: "33", label: "LOADING EQUIPMENT" },
    { code: "34", label: "SERVICING EQUIPMENT" },
    { code: "35", label: "AIRCRAFT CLEANING" },
    { code: "36", label: "FUELLING/DEFUELLING" },
    { code: "37", label: "CATERING" },
    { code: "38", label: "FUEL SERVICE LOSS OF PRIORITY" },
    { code: "39", label: "TECHNICAL EQUIPMENT" },
    { code: "40", label: "REACTIONARY MAINTENANCE" },
    { code: "41", label: "AIRCRAFT DEFECTS" },
    { code: "42", label: "SCHEDULED MAINTENANCE" },
    { code: "46", label: "AIRCRAFT CHANGE" },
    { code: "50", label: "REACTIONARY DAMAGE TO AIRCRAFT" },
    { code: "51", label: "DAMAGE DURING FLIGHT OPERATIONS" },
    { code: "52", label: "DAMAGE DURING GROUND OPERATIONS" },
    { code: "53", label: "AIRCRAFT CHANGE due in FLIGHT DAMAGE" },
    { code: "54", label: "AIRCRAFT CHANGE due on GROUND DAMAGE" },
    { code: "55", label: "AIRPORT LOCAL SYSTEM / HARDWARE FAILURE" },
    { code: "57", label: "FLIGHT PLAN" },
    { code: "58", label: "OTHER AUTOMATED SYSTEM" },
    { code: "59", label: "REACTIONARY IT OPS" },
    { code: "60", label: "REACTIONARY CREW" },
    { code: "61", label: "FLIGHT PLAN" },
    { code: "62", label: "TRAINING / INSPECTION FLIGHT" },
    { code: "63", label: "LATE CREW BOARDING OR DEPARTURE PROCEDURES" },
    { code: "64", label: "FLIGHT DECK CREW SHORTAGE" },
    { code: "65", label: "FLIGHT DECK CREW SPECIAL REQUEST" },
    { code: "66", label: "LATE CABIN CREW BOARDING OR DEPARTURE PROCEDURES" },
    { code: "67", label: "CABIN CREW SHORTAGE" },
    { code: "68", label: "CABIN CREW ERROR OR SPECIAL REQUEST" },
    { code: "69", label: "CAPTAIN REQUEST FOR SECURITY CHECK" },
    { code: "70", label: "REACTIONARY WEATHER" },
    { code: "71", label: "DEPARTURE STATION" },
    { code: "72", label: "DESTINATION STATION" },
    { code: "73", label: "EN ROUTE OR ALTERNATE" },
    { code: "75", label: "DE-ICING OF AIRCRAFT" },
    { code: "76", label: "REMOVAL OF SNOW, ICE, WATER AND SAND FROM AIRPORT" },
    { code: "77", label: "GROUND HANDLING IMPAIRED BY ADVERSE WEATHER CONDITIONS" },
    { code: "80", label: "REACTIONARY ATC" },
    { code: "81", label: "ATFM due to ATC EN-ROUTE DEMAND/CAPACITY." },
    { code: "82", label: "ATFM due to ATC STAFF/EQUIPMENT EN-ROUTE." },
    { code: "83", label: "ATFM due to RESTRICTION AT DESTINATION AIRPORT." },
    { code: "84", label: "ATFM due to GDP/FLOW CONTROL" },
    { code: "85", label: "MANDATORY SECURITY" },
    { code: "86", label: "IMMIGRATION, CUSTOMS, HEALTH" },
    { code: "87", label: "AIRPORT FACILITIES" },
    { code: "88", label: "RESTRICTIONS AT AIRPORT OF DESTINATION." },
    { code: "89", label: "RESTRICTIONS AT AIRPORT OF DEPARTURE WITH OR WITHOUT ATFM RESTRICTIONS." },
    { code: "90", label: "REACTIONARY PLANNING" },
    { code: "91", label: "PASSENGER/BAGGAGE CONNECTION" },
    { code: "92", label: "COMMERCIAL / PRE-OPERATIONAL PROCESS ERROR" },
    { code: "93", label: "REACTIONARY SOC" },
    { code: "94", label: "FLIGHT CREW ROTATION" },
    { code: "95", label: "CABIN CREW ROTATION" },
    { code: "96", label: "OPERATIONS CONTROL" },
    { code: "97", label: "INDUSTRIAL ACTION WITH OWN AIRLINE" },
    { code: "98", label: "INDUSTRIAL ACTION OUTSIDE OWN AIRLINE" },
    { code: "99", label: "OTHER REASON" },
].sort((a, b) => Number(a.code) - Number(b.code));

export function formatDelayOption(o: DelayCodeOption): string {
    return `${o.code}: ${o.label}`;
}

/** Busca la opción del menú MVT (código almacenado puede ser "9", "09", etc.). */
export function findDelayCodeOption(code: string | undefined | null): DelayCodeOption | undefined {
    const t = String(code ?? "").trim();
    if (!t) return undefined;
    const direct = DELAY_CODE_OPTIONS.find((o) => o.code === t);
    if (direct) return direct;
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) {
        return DELAY_CODE_OPTIONS.find((o) => Number(o.code) === n);
    }
    return undefined;
}

/** Misma leyenda que en el desplegable MVT (`code: descripción`); si no hay match, el código tal cual. */
export function formatDelayCodeDisplay(code: string | undefined | null): string {
    const t = String(code ?? "").trim();
    if (!t) return "—";
    const opt = findDelayCodeOption(t);
    return opt ? formatDelayOption(opt) : t;
}

export const DELAY_CODE_AREAS: Record<string, string> = {
    "1": "OTHERS",
    "2": "AIRPORT",
    "3": "AIRPORT",
    "4": "SOC",
    "5": "OTHERS",
    "6": "AIRPORT",
    "7": "CREW",
    "8": "OTHERS",
    "9": "PLANNING",
    "10": "AIRPORT",
    "11": "AIRPORT",
    "12": "AIRPORT",
    "14": "AIRPORT",
    "15": "AIRPORT",
    "18": "AIRPORT",
    "19": "AIRPORT",
    "20": "REACTIONARY",
    "23": "SOC",
    "30": "AIRPORT",
    "31": "AIRPORT",
    "32": "AIRPORT",
    "33": "AIRPORT",
    "34": "AIRPORT",
    "35": "AIRPORT",
    "36": "AIRPORT",
    "37": "CREW",
    "38": "AIRPORT",
    "39": "AIRPORT",
    "40": "REACTIONARY",
    "41": "MAINTENANCE",
    "42": "MAINTENANCE",
    "46": "MAINTENANCE",
    "50": "REACTIONARY",
    "51": "DAMAGE TO AIRCRAFT",
    "52": "DAMAGE TO AIRCRAFT",
    "53": "DAMAGE TO AIRCRAFT",
    "54": "DAMAGE TO AIRCRAFT",
    "55": "AIRPORT",
    "57": "IT OPS",
    "58": "IT OPS",
    "59": "REACTIONARY",
    "60": "REACTIONARY",
    "61": "SOC",
    "62": "CREW",
    "63": "CREW",
    "64": "CREW",
    "65": "CREW",
    "66": "CREW",
    "67": "CREW",
    "68": "CREW",
    "69": "CREW",
    "70": "REACTIONARY",
    "71": "WEATHER",
    "72": "WEATHER",
    "73": "WEATHER",
    "75": "WEATHER",
    "76": "WEATHER",
    "77": "WEATHER",
    "80": "REACTIONARY",
    "81": "AIR TRAFFIC CONTROL",
    "82": "AIR TRAFFIC CONTROL",
    "83": "AIR TRAFFIC CONTROL",
    "84": "AIR TRAFFIC CONTROL",
    "85": "AIRPORT",
    "86": "AIRPORT",
    "87": "AIRPORT",
    "88": "AIRPORT",
    "89": "AIR TRAFFIC CONTROL",
    "90": "REACTIONARY",
    "91": "SOC",
    "92": "PLANNING",
    "93": "REACTIONARY",
    "94": "SOC",
    "95": "SOC",
    "96": "SOC",
    "97": "OTHERS",
    "98": "OTHERS",
    "99": "OTHERS"
};

export function getDelayCodeArea(code: string | undefined | null): string {
    const opt = findDelayCodeOption(code);
    if (!opt) return "—";
    return DELAY_CODE_AREAS[opt.code] || "—";
}

