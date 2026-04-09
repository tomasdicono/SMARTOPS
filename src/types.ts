export type UserRole = "ADMIN" | "HCC" | "SC" | "CREW" | "AJS";

/** Alinea roles guardados en Firebase (p. ej. typo ASJ) para que el modal no quede sin pestañas */
export function normalizeUserRole(role: unknown): UserRole {
    if (role == null || role === "") return "CREW";
    let u = String(role).trim().toUpperCase();
    if (u === "ASJ") u = "AJS";
    const allowed: UserRole[] = ["ADMIN", "HCC", "SC", "CREW", "AJS"];
    return (allowed.includes(u as UserRole) ? u : "CREW") as UserRole;
}

export interface User {
    id: string; // auth uid
    email: string;
    name: string;
    role: UserRole;
    createdAt?: string;
}

export interface SSEE {
    id: string;
    type: "WCHS" | "WCHC" | "WCHR" | "BLND" | "";
    qty: string;
}

export interface HitosData {
    ganttChartName: string;
    ata: string;
    entries: Record<string, string>; // Milestone name -> real execution time
}

export interface Flight {
    id: string;
    date: string;
    route: string;
    flt: string;
    reg: string;
    dep: string;
    arr: string;
    std: string;
    /** Salida reprogramada (ETD). Si existe, los hitos usan ETD; el STD sigue siendo el de programación (MVT / demoras). */
    etd?: string;
    sta: string;
    pax: string;

    // MVT Data (Optional initially)
    mvtData?: {
        atd: string;
        off: string;
        eta: string;
        dlyCod1: string;
        dlyTime1: string;
        dlyCod2: string;
        dlyTime2: string;
        observaciones: string;
        paxActual: string;
        inf: string;
        totalBags: string;
        totalCarga: string;
        load: string;
        fob: string;
        ssee: SSEE[];
        infoSup: string;
        supervisor: string;
        /** ISO 8601 — última vez que se envió/actualizó el MVT */
        mvtSentAt?: string;
    };

    // Custom Gantt Chart / Turnaround Performance Data
    hitosData?: HitosData;

    // Crew specifically isolated milestones
    hitosCrewData?: Record<string, string>;

    /** Vuelo anulado operativamente (motivo obligatorio al cancelar desde el tablero). */
    cancelled?: boolean;
    cancellationReason?: string;

    /** Legado: antes el STD se sobrescribía al reprogramar; `coerceFlightFromDb` migra a std+etd. */
    previousStd?: string;
    rescheduleReason?: string;

    /** Notas libres en Reporte Diario (HCC / AJS). */
    dailyReportObs?: string;
}

/** Registro de cambio de ruta (Firebase: routeAfectaciones/{YYYY-MM-DD}/{pushId}) */
export interface RouteAfectacionEntry {
    id: string;
    flightId: string;
    flt: string;
    reg: string;
    depAntes: string;
    arrAntes: string;
    depDespues: string;
    arrDespues: string;
    at: string;
    by: string;
}

/** Diferido global por matrícula (Firebase: diferidos/{matrícula}) — visible en todas las fechas hasta quitarlo */
export interface DiferidoEntry {
    text: string;
    updatedAt?: string;
    updatedBy?: string;
}

/** Estado por matrícula en pestaña Pernocte (Firebase: pernocte/{fecha}/{matrícula}) */
export interface PernocteRowState {
    limpieza: boolean;
    precargaQ: string;
    precarga: boolean;
}
