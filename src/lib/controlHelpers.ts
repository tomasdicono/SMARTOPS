import type { Flight, RouteAfectacionEntry } from "../types";
import { formatDelayCodeDisplay } from "./delayCodes";
import { getAirlinePrefix } from "./flightHelpers";
import { getAircraftInfo } from "./fleetData";
import { parseTimeToMinutes } from "./mvtTime";

/** Convierte fecha de vuelo (DD-MM-YYYY o YYYY-MM-DD) a ISO YYYY-MM-DD */
export function flightDateToIso(f: Flight): string {
    const d = String(f.date ?? "");
    if (!d.includes("-")) return d || "";
    const [a, b, c] = d.split("-");
    if (c && c.length === 4) return `${c}-${b}-${a}`;
    if (a && a.length === 4) return `${a}-${b}-${c}`;
    return d;
}

/** HH:mm o HHmm → minutos desde medianoche */
export function parseHHmmToMinutes(s: string | undefined | null): number {
    const raw = String(s ?? "").replace(/\D/g, "");
    if (raw.length <= 2) return parseInt(raw, 10) || 0;
    if (raw.length === 3) {
        const h = parseInt(raw.slice(0, 1), 10);
        const m = parseInt(raw.slice(1, 3), 10);
        return h * 60 + m;
    }
    const h = parseInt(raw.slice(0, 2), 10);
    const m = parseInt(raw.slice(2, 4), 10);
    return h * 60 + m;
}

export function getPax(f: Flight): number {
    return parseInt(f.mvtData?.paxActual || f.pax || "0", 10) || 0;
}

/** Solo casilla PAX del MVT (estadísticas agregadas) */
export function getMvtPaxOnly(f: Flight): number {
    return parseInt(f.mvtData?.paxActual || "0", 10) || 0;
}

/** PAX planificados según la programación (campo `pax` del vuelo), independiente del MVT */
export function getScheduledPax(f: Flight): number {
    const raw = String(f.pax ?? "").replace(/\D/g, "");
    return parseInt(raw || "0", 10) || 0;
}

export function getBags(f: Flight): number {
    return parseInt(f.mvtData?.totalBags || "0", 10) || 0;
}

/** TOTAL CARGA (KG) del MVT, 0 si no hay dato. */
export function getTotalCargaKg(f: Flight): number {
    const raw = String(f.mvtData?.totalCarga ?? "").replace(/\D/g, "");
    return parseInt(raw || "0", 10) || 0;
}

export function isA321Model(model: string): boolean {
    return model.includes("321");
}

export function isA320Family(model: string): boolean {
    return model.includes("320") && !model.includes("321");
}

/** Vuelos del día ISO; opcional filtro aeropuerto (dep o arr) */
export function filterFlightsForStats(flights: Flight[], isoDate: string, airport: string | ""): Flight[] {
    let list = flights.filter((f) => flightDateToIso(f) === isoDate);
    if (airport) {
        list = list.filter((f) => f.dep === airport || f.arr === airport);
    }
    return list;
}

/** Misma fecha ISO; filtro aeropuerto solo por origen (dep). Usado p. ej. en vuelos cancelados. */
export function filterFlightsForStatsDepartureOnly(flights: Flight[], isoDate: string, airport: string | ""): Flight[] {
    let list = flights.filter((f) => flightDateToIso(f) === isoDate);
    if (airport) {
        list = list.filter((f) => f.dep === airport);
    }
    return list;
}

/** Participación de cada familia: % de vuelos del filtro que operan con ese equipo (flota conocida) */
export interface FleetMixShare {
    /** Vuelos con matrícula en flota y modelo A320 o A321 según familia */
    countOfType: number;
    /** Total de vuelos en el filtro (fecha / aeropuerto) */
    totalFlights: number;
    /** countOfType / totalFlights × 100 */
    sharePct: number | null;
}

export function computeFleetMixShare(flights: Flight[], family: "A320" | "A321"): FleetMixShare {
    const totalFlights = flights.length;
    let countOfType = 0;
    for (const f of flights) {
        const ac = getAircraftInfo(f.reg);
        if (!ac) continue;
        const is321 = isA321Model(ac.model);
        const is320 = isA320Family(ac.model);
        if (family === "A321" && is321) countOfType++;
        if (family === "A320" && is320) countOfType++;
    }
    const sharePct = totalFlights > 0 ? (countOfType / totalFlights) * 100 : null;
    return { countOfType, totalFlights, sharePct };
}

export function uniqueAirportsFromFlights(flights: Flight[]): string[] {
    const s = new Set<string>();
    for (const f of flights) {
        if (f.dep) s.add(f.dep);
        if (f.arr) s.add(f.arr);
    }
    return [...s].sort();
}

const DAY_MIN = 24 * 60;

/** Duración bloque STD → STA (minutos); cruces de medianoche alineados con ControlView */
export function blockDurationMinutes(std: string, sta: string): number {
    let a = parseHHmmToMinutes(std);
    let b = parseHHmmToMinutes(sta);
    if (b < a) b += DAY_MIN;
    return Math.max(b - a, 20);
}

/** Segmentos [inicio, fin) en minutos dentro del día 0–1440; parte 2 si cruza medianoche */
export function flightDaySegments(std: string, sta: string): [number, number][] {
    const start = parseHHmmToMinutes(std);
    const dur = blockDurationMinutes(std, sta);
    const end = start + dur;
    if (end <= DAY_MIN) return [[start, end]];
    return [
        [start, DAY_MIN],
        [0, end - DAY_MIN],
    ];
}

/** Recorta un segmento a la ventana [V0, V1] (minutos); porcentajes respecto al ancho de ventana */
export function clipSegmentToWindow(
    segStart: number,
    segEnd: number,
    windowStart: number,
    windowEnd: number
): { leftPct: number; widthPct: number } | null {
    const s = Math.max(segStart, windowStart);
    const e = Math.min(segEnd, windowEnd);
    if (e <= s) return null;
    const span = windowEnd - windowStart;
    return {
        leftPct: ((s - windowStart) / span) * 100,
        widthPct: ((e - s) / span) * 100,
    };
}

/**
 * Status día: vuelo demorado si tiene ETD (reprogramación) o si el ATD es posterior al STD.
 * Si hay ETD cargado, cuenta como demorado aunque no exista ATD en MVT.
 */
export function isFlightDemoradoStatusDia(f: Flight): boolean {
    if (f.cancelled) return false;
    if (f.etd?.trim()) return true;
    const atd = f.mvtData?.atd;
    if (!atd || String(atd).replace(/\D/g, "").length < 2) return false;
    return parseTimeToMinutes(atd) > parseTimeToMinutes(f.std);
}

/** Demora operativa registrada en MVT (código + tiempo). */
export function hasRecordedMvtDelay(f: Flight): boolean {
    const m = f.mvtData;
    if (!m) return false;
    const d1 = m.dlyCod1?.trim() && m.dlyTime1?.trim();
    const d2 = m.dlyCod2?.trim() && m.dlyTime2?.trim();
    return !!(d1 || d2);
}

/** Hay PAX declarado en el MVT (casilla PAX actual). */
export function hasMvtPaxEntered(f: Flight): boolean {
    return (f.mvtData?.paxActual ?? "").trim() !== "";
}

/** MVT con ATD cargado (suficiente para medir OTP). Denominador “MVT enviados”. */
export function hasMvtAtdForOtp(f: Flight): boolean {
    if (f.cancelled) return false;
    const atd = f.mvtData?.atd;
    return !!atd && String(atd).replace(/\D/g, "").length >= 3;
}

/**
 * Minutos de diferencia ATD − STD (programación publicada). Siempre contra STD, no ETD.
 * Negativo = salida antes del STD.
 */
export function otpDelayMinutes(f: Flight): number | null {
    if (!hasMvtAtdForOtp(f)) return null;
    const atd = f.mvtData!.atd!;
    return parseTimeToMinutes(atd) - parseTimeToMinutes(f.std);
}

/**
 * Vuelo operado con impacto por demora registrada en MVT o por reprogramación (ETD),
 * contando casos programados aunque aún no haya MVT de demoras.
 */
export function isAffectedByDelayOrReprogramming(f: Flight): boolean {
    if (f.cancelled) return false;
    if (hasRecordedMvtDelay(f)) return true;
    return !!f.etd?.trim();
}

/** Códigos de demora en MVT (dlyCod1 / dlyCod2); porcentajes sobre el total de códigos registrados en el día. */
export interface DelayCodeShare {
    code: string;
    count: number;
    pct: number;
}

export function rankDelayCodesByShare(flights: Flight[]): DelayCodeShare[] {
    const counts = new Map<string, number>();
    for (const f of flights) {
        const m = f.mvtData;
        if (!m) continue;
        const c1 = String(m.dlyCod1 ?? "").trim();
        const c2 = String(m.dlyCod2 ?? "").trim();
        if (c1) counts.set(c1, (counts.get(c1) ?? 0) + 1);
        if (c2) counts.set(c2, (counts.get(c2) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return [...counts.entries()]
        .map(([code, count]) => ({ code, count, pct: (count / total) * 100 }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Agrupa textos por clave normalizada (trim + espacios); orden por frecuencia descendente. */
export function rankStringsByFrequency(items: (string | undefined | null)[]): { text: string; count: number }[] {
    const map = new Map<string, { display: string; count: number }>();
    for (const raw of items) {
        const t = String(raw ?? "").trim().replace(/\s+/g, " ");
        const key = t.toLowerCase();
        const display = t || "(Sin motivo registrado)";
        const prev = map.get(key);
        if (prev) {
            prev.count += 1;
        } else {
            map.set(key, { display, count: 1 });
        }
    }
    return [...map.values()]
        .map(({ display, count }) => ({ text: display, count }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/** Mismos agregados que la pestaña Control → Status día (día calendario + afectaciones de ruta). */
export interface StatusDiaDaySummary {
    paxAfectadosReprogramacion: number;
    countVuelosReprogramados: number;
    motivosReprogramacion: { text: string; count: number }[];
    demoraCodigos: DelayCodeShare[];
    countCancelados: number;
    motivosCancelacionDetalle: { text: string; count: number; pax: number }[];
    paxCancelados: number;
    totalVuelosDia: number;
    nMvtOtp: number;
    /** Vuelos no cancelados con registro MVT cargado (`mvtData` presente). */
    countVuelosConMvtCargado: number;
    otp0Pct: number | null;
    otp15Pct: number | null;
    countAfectacionesRuta: number;
    /** Σ PAX programación / Σ asientos (vuelos operativos con matrícula en flota). */
    factorOcupacionProgramadoPct: number | null;
    /** Σ PAX MVT / Σ asientos solo en vuelos con MVT enviado (`mvtSentAt`). */
    factorOcupacionRealPct: number | null;
}

export function computeStatusDiaDaySummary(
    dayFlights: Flight[],
    routeAfectacionesCount: number
): StatusDiaDaySummary {
    const operational = dayFlights.filter((f) => !f.cancelled);
    const cancelled = dayFlights.filter((f) => f.cancelled);
    const conEtd = operational.filter((f) => f.etd?.trim());
    const paxAfectadosReprogramacion = conEtd.reduce((s, f) => s + getScheduledPax(f), 0);
    const countVuelosReprogramados = conEtd.length;
    const motivosReprogramacion = rankStringsByFrequency(conEtd.map((f) => f.rescheduleReason));
    const demoraCodigos = rankDelayCodesByShare(operational);

    const cancelByKey = new Map<string, { text: string; count: number; pax: number }>();
    for (const f of cancelled) {
        const t = String(f.cancellationReason ?? "").trim().replace(/\s+/g, " ");
        const key = t.toLowerCase();
        const text = t || "(Sin motivo registrado)";
        const px = getScheduledPax(f);
        const prev = cancelByKey.get(key);
        if (prev) {
            prev.count += 1;
            prev.pax += px;
        } else {
            cancelByKey.set(key, { text, count: 1, pax: px });
        }
    }
    const motivosCancelacionDetalle = [...cancelByKey.values()].sort(
        (a, b) => b.count - a.count || a.text.localeCompare(b.text)
    );
    const paxCancelados = cancelled.reduce((s, f) => s + getScheduledPax(f), 0);

    const countVuelosConMvtCargado = operational.filter((f) => f.mvtData != null).length;

    const conMvtOtp = operational.filter((f) => hasMvtAtdForOtp(f));
    const nMvtOtp = conMvtOtp.length;
    let otp0Count = 0;
    let otp15Count = 0;
    for (const f of conMvtOtp) {
        const d = otpDelayMinutes(f);
        if (d == null) continue;
        if (d <= 0) otp0Count += 1;
        if (d <= 14) otp15Count += 1;
    }
    const otp0Pct = nMvtOtp > 0 ? (otp0Count / nMvtOtp) * 100 : null;
    const otp15Pct = nMvtOtp > 0 ? (otp15Count / nMvtOtp) * 100 : null;

    let seatsOcc = 0;
    let paxProgramadosSum = 0;
    let seatsMvtEnviados = 0;
    let paxMvtEnviadosSum = 0;
    for (const f of operational) {
        const ac = getAircraftInfo(f.reg);
        if (!ac || ac.capacity <= 0) continue;
        seatsOcc += ac.capacity;
        paxProgramadosSum += getScheduledPax(f);
        const m = f.mvtData;
        const mvtEnviado = m != null && m.mvtSentAt != null && String(m.mvtSentAt).trim() !== "";
        if (mvtEnviado) {
            seatsMvtEnviados += ac.capacity;
            paxMvtEnviadosSum += getMvtPaxOnly(f);
        }
    }
    const factorOcupacionProgramadoPct = seatsOcc > 0 ? (paxProgramadosSum / seatsOcc) * 100 : null;
    const factorOcupacionRealPct = seatsMvtEnviados > 0 ? (paxMvtEnviadosSum / seatsMvtEnviados) * 100 : null;

    return {
        paxAfectadosReprogramacion,
        countVuelosReprogramados,
        motivosReprogramacion,
        demoraCodigos,
        countCancelados: cancelled.length,
        motivosCancelacionDetalle,
        paxCancelados,
        totalVuelosDia: dayFlights.length,
        nMvtOtp,
        countVuelosConMvtCargado,
        otp0Pct,
        otp15Pct,
        countAfectacionesRuta: routeAfectacionesCount,
        factorOcupacionProgramadoPct,
        factorOcupacionRealPct,
    };
}

/** Fecha YYYY-MM-DD → leyenda larga en español (Argentina). */
function formatFechaLargaEsAr(isoYmd: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoYmd)) return isoYmd;
    const d = new Date(`${isoYmd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoYmd;
    const s = d.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function pctEsAr(n: number): string {
    return n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatRouteAfectacionLinePrensa(row: RouteAfectacionEntry): string {
    const flt = `${getAirlinePrefix(row.flt)}${row.flt}`.trim();
    let hora = "—";
    try {
        const d = new Date(row.at);
        if (!Number.isNaN(d.getTime())) {
            hora = d.toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
    } catch {
        /* ignore */
    }
    const ruta = `${row.depAntes}-${row.arrAntes} → ${row.depDespues}-${row.arrDespues}`;
    const reg = row.reg?.trim() || "—";
    return `  • ${flt} · ${reg} · ${ruta} · ${hora}`;
}

/**
 * Borrador listo para copiar a prensa / comunicaciones, solo con datos del Status día.
 */
export function buildStatusDiaPrensaText(
    fechaIso: string,
    s: StatusDiaDaySummary,
    routeAfectaciones: RouteAfectacionEntry[]
): string {
    const fecha = formatFechaLargaEsAr(fechaIso);
    const out: string[] = [];

    out.push(`Status operativo — ${fecha}`);
    out.push("");
    out.push(
        `El día cuenta con ${s.totalVuelosDia} vuelo${s.totalVuelosDia !== 1 ? "s" : ""} cargados en itinerario.`
    );
    out.push("");

    out.push("⏱️ Puntualidad");
    out.push(
        `Sobre un total de ${s.countVuelosConMvtCargado} vuelo${s.countVuelosConMvtCargado !== 1 ? "s" : ""} operado${s.countVuelosConMvtCargado !== 1 ? "s" : ""}, el status OTP al momento es el siguiente:`
    );
    if (s.nMvtOtp > 0 && s.otp0Pct != null && s.otp15Pct != null) {
        out.push(`OTP 0 --> ${pctEsAr(s.otp0Pct)}%`);
        out.push(`OTP 15 --> ${pctEsAr(s.otp15Pct)}%`);
    } else {
        out.push("Sin datos de OTP: no hay vuelos con MVT y hora de salida real suficiente para calcular el indicador.");
    }
    out.push("");

    out.push("📊 Factor de ocupación");
    if (s.factorOcupacionProgramadoPct != null) {
        out.push(`Factor de ocupación esperado: ${pctEsAr(s.factorOcupacionProgramadoPct)}%.`);
    } else {
        out.push("Factor de ocupación esperado: sin dato consolidado.");
    }
    if (s.factorOcupacionRealPct != null) {
        out.push(`Factor de ocupación de vuelos ejecutados: ${pctEsAr(s.factorOcupacionRealPct)}%.`);
    } else {
        out.push("Factor de ocupación de vuelos ejecutados: sin dato.");
    }
    out.push("");

    out.push("Reprogramaciones");
    if (s.countVuelosReprogramados === 0) {
        out.push("Sin reprogramaciones.");
    } else {
        out.push(
            `Hay ${s.countVuelosReprogramados} vuelo${s.countVuelosReprogramados !== 1 ? "s" : ""} con nueva hora de salida ETD. ` +
                `La afectación por las reprogramaciones alcanza a ${s.paxAfectadosReprogramacion} pasajero${s.paxAfectadosReprogramacion !== 1 ? "s" : ""}.`
        );
    }
    out.push("");

    out.push("Cambios de ruta");
    if (routeAfectaciones.length === 0) {
        out.push("Sin cambios de ruta registrados.");
    } else {
        out.push(`Se registraron ${routeAfectaciones.length} cambio${routeAfectaciones.length !== 1 ? "s" : ""} de ruta en el sistema:`);
        out.push("");
        for (const row of routeAfectaciones) {
            out.push(formatRouteAfectacionLinePrensa(row));
        }
    }
    out.push("");

    out.push("⏳ Demoras");
    if (s.demoraCodigos.length === 0) {
        out.push("Sin demoras.");
    } else {
        out.push("Los más frecuentes del día son:");
        for (const row of s.demoraCodigos.slice(0, 8)) {
            out.push(
                `  • ${formatDelayCodeDisplay(row.code)}: ${pctEsAr(row.pct)}% del total de códigos, ${row.count} registro${row.count !== 1 ? "s" : ""}.`
            );
        }
    }
    out.push("");

    out.push("Cancelaciones");
    if (s.countCancelados === 0 && s.paxCancelados === 0) {
        out.push("Sin cancelaciones.");
    } else {
        out.push(
            `${s.countCancelados} vuelo${s.countCancelados !== 1 ? "s" : ""} cancelado${s.countCancelados !== 1 ? "s" : ""}; ` +
                `pasajeros según programación afectados: ${s.paxCancelados}.`
        );
        if (s.motivosCancelacionDetalle.length > 0) {
            out.push("Detalle por motivo:");
            for (const m of s.motivosCancelacionDetalle.slice(0, 10)) {
                out.push(
                    `  • ${m.text}: ${m.count} vuelo${m.count !== 1 ? "s" : ""}, ${m.pax} PAX.`
                );
            }
        }
    }

    return out.join("\n");
}
