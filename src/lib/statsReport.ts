import type { Flight } from "../types";
import { formatDelayCodeDisplay } from "./delayCodes";
import {
    computeAverageBoardingMinutes,
    computeFleetMixShare,
    computeInicioEmbarqueCompliance,
    computeLlegadaCrewCompliance,
    computePeaCounts,
    getBags,
    getMvtPaxOnly,
    hasMvtAtdForOtp,
    hasMvtSent,
    listAlternoFlightsForDay,
    listQrfFlightsForDay,
    otpDelayMinutes,
    rankDelayCodesByShare,
    flightDateToIso,
    normalizeIsoDateRange,
    countDaysInclusiveIso,
    type AlternoStatusDiaRow,
    type BoardingStatsFilter,
    type DelayCodeShare,
    type MilestoneComplianceStats,
    type QrfStatusDiaRow,
    type RouteAfectacionStatsRow,
} from "./controlHelpers";
import { isJesFlightNumber, getAirlinePrefix } from "./flightHelpers";
import { formatMinutesToHHMM } from "./mvtTime";

export interface StatsReportBoardingRow {
    label: string;
    avgMinutes: number | null;
    countWithBoarding: number;
}

export interface StatsReportOtpDailyColumn {
    dateIso: string;
    dateLabel: string;
    otp15Pct: number | null;
    otp60Pct: number | null;
    nMvtOtp: number;
}

export interface StatsReportData {
    periodLabel: string;
    airportLabel: string;
    atdTimeLabel: string;
    generatedAt: string;
    flightCount: number;
    otp15Pct: number | null;
    otp60Pct: number | null;
    otpBase: number;
    /** OTP por día calendario del filtro (solo si el rango tiene más de un día). */
    otpDailyColumns: StatsReportOtpDailyColumn[];
    periodDayCount: number;
    demoraCodigos: DelayCodeShare[];
    totalPax: number;
    totalBags: number;
    /** Bags sobre PAX (MVT), mismo criterio que Estadísticas en pantalla */
    bagsPerPaxPct: number | null;
    inicioEmbarque: MilestoneComplianceStats;
    llegadaCrew: MilestoneComplianceStats;
    fleet320Pct: number | null;
    fleet321Pct: number | null;
    fleet320Count: number;
    fleet321Count: number;
    fleetTotal: number;
    peaMangaPct: number | null;
    peaRemotaPct: number | null;
    peaMangaCount: number;
    peaRemotaCount: number;
    peaMvtBase: number;
    boardingRows: StatsReportBoardingRow[];
    qrfFlights: QrfStatusDiaRow[];
    alternoFlights: AlternoStatusDiaRow[];
    routeAfectaciones: RouteAfectacionStatsRow[];
}

const BOARDING_FILTERS: { filter: BoardingStatsFilter; label: string }[] = [
    { filter: "A320", label: "A320" },
    { filter: "A321", label: "A321" },
    { filter: "manga", label: "Manga" },
    { filter: "remota", label: "Remota" },
];

function computeOtpStats(flights: Flight[]): {
    nMvtOtp: number;
    otp15Pct: number | null;
    otp60Pct: number | null;
} {
    const conMvtOtp = flights.filter((f) => isJesFlightNumber(f.flt) && hasMvtAtdForOtp(f));
    const nMvtOtp = conMvtOtp.length;
    let otp15Count = 0;
    let otp60Count = 0;
    for (const f of conMvtOtp) {
        const d = otpDelayMinutes(f);
        if (d == null) continue;
        if (d <= 14) otp15Count += 1;
        if (d < 60) otp60Count += 1;
    }
    return {
        nMvtOtp,
        otp15Pct: nMvtOtp > 0 ? (otp15Count / nMvtOtp) * 100 : null,
        otp60Pct: nMvtOtp > 0 ? (otp60Count / nMvtOtp) * 100 : null,
    };
}

function enumerateIsoDaysInclusive(lo: string, hi: string): string[] {
    const days: string[] = [];
    let cur = lo;
    while (cur <= hi) {
        days.push(cur);
        const d = new Date(`${cur}T12:00:00`);
        if (Number.isNaN(d.getTime())) break;
        d.setDate(d.getDate() + 1);
        cur = d.toISOString().slice(0, 10);
    }
    return days;
}

function formatOtpDayColumnLabel(isoYmd: string): string {
    const d = new Date(`${isoYmd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoYmd;
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function computeOtpDailyColumns(
    flights: Flight[],
    isoFrom: string,
    isoTo: string,
): StatsReportOtpDailyColumn[] {
    const { lo, hi } = normalizeIsoDateRange(isoFrom, isoTo);
    if (!lo || !hi) return [];
    const byDay = new Map<string, Flight[]>();
    for (const f of flights) {
        if (f.cancelled) continue;
        const key = flightDateToIso(f);
        if (!key || key < lo || key > hi) continue;
        const prev = byDay.get(key);
        if (prev) prev.push(f);
        else byDay.set(key, [f]);
    }
    return enumerateIsoDaysInclusive(lo, hi).map((dateIso) => {
        const dayFlights = byDay.get(dateIso) ?? [];
        const otp = computeOtpStats(dayFlights);
        return {
            dateIso,
            dateLabel: formatOtpDayColumnLabel(dateIso),
            otp15Pct: otp.otp15Pct,
            otp60Pct: otp.otp60Pct,
            nMvtOtp: otp.nMvtOtp,
        };
    });
}

export function buildStatsReportData(params: {
    flights: Flight[];
    /** Vuelos del filtro (fecha, aeropuerto, ATD) para QRF / alterno. */
    eventFlights: Flight[];
    routeAfectaciones: RouteAfectacionStatsRow[];
    statsDateFrom: string;
    statsDateTo: string;
    periodLabel: string;
    airportLabel: string;
    atdTimeLabel: string;
}): StatsReportData {
    const {
        flights,
        eventFlights,
        routeAfectaciones,
        statsDateFrom,
        statsDateTo,
        periodLabel,
        airportLabel,
        atdTimeLabel,
    } = params;
    const operational = flights.filter((f) => !f.cancelled);
    const mvtSent = operational.filter(hasMvtSent);
    const otp = computeOtpStats(operational);
    const { lo, hi } = normalizeIsoDateRange(statsDateFrom, statsDateTo);
    const periodDayCount = lo && hi ? countDaysInclusiveIso(lo, hi) : 0;
    const otpDailyColumns =
        periodDayCount > 1 ? computeOtpDailyColumns(operational, statsDateFrom, statsDateTo) : [];
    const mix320 = computeFleetMixShare(operational, "A320");
    const mix321 = computeFleetMixShare(operational, "A321");
    const peaCounts = computePeaCounts(mvtSent);
    const peaMvtBase = mvtSent.length;

    const boardingRows = BOARDING_FILTERS.map(({ filter, label }) => {
        const { avgMinutes, countWithBoarding } = computeAverageBoardingMinutes(operational, filter);
        return { label, avgMinutes, countWithBoarding };
    });

    const totalPax = operational.reduce((s, f) => s + getMvtPaxOnly(f), 0);
    const totalBags = operational.reduce((s, f) => s + getBags(f), 0);
    const bagsPerPaxPct = totalPax > 0 ? (totalBags / totalPax) * 100 : null;

    const now = new Date();
    const generatedAt = now.toLocaleString("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
    });

    return {
        periodLabel,
        airportLabel,
        atdTimeLabel,
        generatedAt,
        flightCount: operational.length,
        otp15Pct: otp.otp15Pct,
        otp60Pct: otp.otp60Pct,
        otpBase: otp.nMvtOtp,
        otpDailyColumns,
        periodDayCount,
        demoraCodigos: rankDelayCodesByShare(operational),
        totalPax,
        totalBags,
        bagsPerPaxPct,
        inicioEmbarque: computeInicioEmbarqueCompliance(operational),
        llegadaCrew: computeLlegadaCrewCompliance(operational),
        fleet320Pct: mix320.sharePct,
        fleet321Pct: mix321.sharePct,
        fleet320Count: mix320.countOfType,
        fleet321Count: mix321.countOfType,
        fleetTotal: mix320.totalFlights,
        peaMangaPct: peaMvtBase > 0 ? (peaCounts.manga / peaMvtBase) * 100 : null,
        peaRemotaPct: peaMvtBase > 0 ? (peaCounts.remota / peaMvtBase) * 100 : null,
        peaMangaCount: peaCounts.manga,
        peaRemotaCount: peaCounts.remota,
        peaMvtBase,
        boardingRows,
        qrfFlights: listQrfFlightsForDay(eventFlights),
        alternoFlights: listAlternoFlightsForDay(eventFlights),
        routeAfectaciones,
    };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fmtPct(v: number | null, digits = 1): string {
    return v != null ? `${v.toFixed(digits)}%` : "—";
}

function fmtBoarding(m: number | null): string {
    return m != null ? formatMinutesToHHMM(Math.round(m)) : "—";
}

function formatStatsAt(iso: string): string {
    if (!iso.trim()) return "—";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "—";
    }
}

function renderEventTable(headers: string[], rows: string[][]): string {
    if (rows.length === 0) {
        return '<p class="empty">Sin registros en el filtro.</p>';
    }
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const body = rows
        .map(
            (cells) =>
                `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
        )
        .join("");
    return `<div class="evt-wrap"><table class="evt-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderOperationalEventsSection(data: StatsReportData): string {
    const qrfRows = data.qrfFlights.map((r) => [r.std, r.flt, r.reg, r.route, r.reason]);
    const alternoRows = data.alternoFlights.map((r) => [
        r.std,
        r.flt,
        r.reg,
        r.arrProgramado,
        r.ato,
        r.reason,
    ]);
    const routeRows = data.routeAfectaciones.map((r) => [
        formatStatsAt(r.at),
        `${getAirlinePrefix(r.flt)}${r.flt}`.trim(),
        r.reg,
        `${r.depAntes}-${r.arrAntes}`,
        `${r.depDespues}-${r.arrDespues}`,
        r.by || "—",
    ]);

    return `
    <section class="section">
      <h2>Eventos operacionales del período</h2>
      <p class="sub">QRF, alternos y cambios de ruta según fechas, aeropuertos de origen y filtro ATD del informe.</p>

      <h3 class="evt-title">QRF (regreso a posición) · ${data.qrfFlights.length}</h3>
      ${renderEventTable(["STD", "Vuelo", "Reg", "Ruta", "Motivo"], qrfRows)}

      <h3 class="evt-title">Alternos · ${data.alternoFlights.length}</h3>
      ${renderEventTable(["STD", "Vuelo", "Reg", "Dest. prog.", "ATO", "Motivo"], alternoRows)}

      <h3 class="evt-title">Cambios de ruta · ${data.routeAfectaciones.length}</h3>
      ${renderEventTable(["Hora", "Vuelo", "Reg", "Antes", "Después", "Registró"], routeRows)}
    </section>`;
}

function renderHBar(
    label: string,
    pct: number,
    display: string,
    color: string,
    maxPct = 100,
): string {
    const w = Math.min(100, Math.max(0, (pct / maxPct) * 100));
    return `
    <div class="hbar">
      <div class="hbar-label">${escapeHtml(label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${w.toFixed(1)}%;background:${color}"></div></div>
      <div class="hbar-val">${escapeHtml(display)}</div>
    </div>`;
}

function renderComplianceBlock(title: string, stats: MilestoneComplianceStats, color: string): string {
    const pct = stats.onTimePct ?? 0;
    const detail =
        stats.evaluatedCount > 0
            ? `${stats.onTimeCount} de ${stats.evaluatedCount} vuelos a tiempo`
            : "Sin vuelos evaluables en el filtro";
    const bar =
        stats.onTimePct != null
            ? renderHBar("Cumplimiento", pct, fmtPct(stats.onTimePct), color)
            : "";
    return `
    <div class="metric-card" style="margin-bottom:14px">
      <h3>${escapeHtml(title)}</h3>
      <p class="kpi" style="color:${color}">${fmtPct(stats.onTimePct)}</p>
      ${bar}
      <p class="sub">${escapeHtml(detail)}</p>
    </div>`;
}

function renderOtpDailyTable(columns: StatsReportOtpDailyColumn[]): string {
    if (columns.length <= 1) return "";
    const header = columns.map((c) => `<th>${escapeHtml(c.dateLabel)}</th>`).join("");
    const otp15Cells = columns
        .map((c) => `<td>${escapeHtml(c.otp15Pct != null ? fmtPct(c.otp15Pct) : "—")}</td>`)
        .join("");
    const otp60Cells = columns
        .map((c) => `<td>${escapeHtml(c.otp60Pct != null ? fmtPct(c.otp60Pct) : "—")}</td>`)
        .join("");
    return `
    <div class="otp-daily-wrap">
      <p class="sub center" style="margin-top:16px;margin-bottom:8px">OTP por día (JES con ATD)</p>
      <table class="otp-daily-table">
        <thead>
          <tr><th class="otp-daily-corner"></th>${header}</tr>
        </thead>
        <tbody>
          <tr><th>OTP 15</th>${otp15Cells}</tr>
          <tr><th>OTP 60</th>${otp60Cells}</tr>
        </tbody>
      </table>
    </div>`;
}

function renderOtpDonuts(data: StatsReportData): string {
    const o15 = data.otp15Pct ?? 0;
    const o60 = data.otp60Pct ?? 0;
    const base =
        data.otpBase > 0
            ? `Base: ${data.otpBase} vuelo${data.otpBase !== 1 ? "s" : ""} JES con ATD`
            : "Sin base OTP en el filtro";
    return `
    <div class="otp-grid">
      <div class="otp-item">
        <div class="donut-wrap">
          <svg viewBox="0 0 36 36" class="donut">
            <path class="donut-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="donut-fill emerald" stroke-dasharray="${o15.toFixed(1)}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
          </svg>
          <span class="donut-pct">${fmtPct(data.otp15Pct)}</span>
        </div>
        <p class="otp-title">OTP 15</p>
      </div>
      <div class="otp-item">
        <div class="donut-wrap">
          <svg viewBox="0 0 36 36" class="donut">
            <path class="donut-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="donut-fill teal" stroke-dasharray="${o60.toFixed(1)}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
          </svg>
          <span class="donut-pct">${fmtPct(data.otp60Pct)}</span>
        </div>
        <p class="otp-title">OTP 60</p>
      </div>
    </div>
    <p class="sub center">${escapeHtml(base)}</p>
    ${renderOtpDailyTable(data.otpDailyColumns)}`;
}

function buildStatsReportHtml(data: StatsReportData): string {
    const delayBars =
        data.demoraCodigos.length === 0
            ? '<p class="empty">Sin códigos de demora MVT en el período.</p>'
            : data.demoraCodigos
                  .slice(0, 12)
                  .map((d) =>
                      renderHBar(
                          formatDelayCodeDisplay(d.code),
                          d.pct,
                          `${d.count} · ${d.pct.toFixed(1)}%`,
                          "#dc2626",
                      ),
                  )
                  .join("");

    const boardingMax = Math.max(
        60,
        ...data.boardingRows.map((r) => r.avgMinutes ?? 0),
    );
    const boardingBars = data.boardingRows
        .map((r) => {
            const mins = r.avgMinutes ?? 0;
            const pct = r.avgMinutes != null ? (mins / boardingMax) * 100 : 0;
            const disp =
                r.avgMinutes != null
                    ? `${fmtBoarding(r.avgMinutes)} · ${r.countWithBoarding} vuelo${r.countWithBoarding !== 1 ? "s" : ""}`
                    : "Sin datos";
            return renderHBar(r.label, pct, disp, "#0d9488", 100);
        })
        .join("");

    const metaAtd = data.atdTimeLabel
        ? `<div><span>ATD</span><span class="v">${escapeHtml(data.atdTimeLabel)}</span></div>`
        : "";

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Informe estadísticas SMARTOPS</title>
  <style>
    :root {
      --navy: #143c6c;
      --text: #1e293b;
      --muted: #64748b;
      --border: #e2e8f0;
      --card: #fff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      color: var(--text);
      line-height: 1.45;
      padding: 24px 16px 48px;
    }
    .shell { max-width: 920px; margin: 0 auto; }
    .hero {
      background: linear-gradient(135deg, #143c6c 0%, #1e5a8a 100%);
      color: #fff;
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 24px;
      box-shadow: 0 8px 24px rgba(20,60,108,.25);
    }
    .hero h1 { margin: 0 0 6px; font-size: 1.5rem; font-weight: 900; letter-spacing: -0.02em; }
    .hero .tag { margin: 0; opacity: .9; font-size: .85rem; font-weight: 600; }
    .kv {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px 20px;
      margin-top: 18px;
      font-size: .8rem;
    }
    .kv span:first-child { display: block; opacity: .75; font-weight: 700; text-transform: uppercase; font-size: .65rem; letter-spacing: .06em; }
    .kv .v { font-weight: 800; font-size: .95rem; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .section h2 {
      margin: 0 0 14px;
      font-size: .75rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--navy);
    }
    .kpi-row { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 8px; }
    .kpi-big { font-size: 2rem; font-weight: 900; color: var(--navy); line-height: 1; }
    .kpi-label { font-size: .7rem; font-weight: 800; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
    .metric-card h3 { margin: 0 0 8px; font-size: .7rem; font-weight: 900; text-transform: uppercase; color: var(--muted); }
    .metric-card .kpi { font-size: 1.75rem; font-weight: 900; margin: 0 0 10px; }
    .hbar { display: grid; grid-template-columns: 100px 1fr 120px; gap: 10px; align-items: center; margin-bottom: 10px; font-size: .8rem; }
    .hbar-label { font-weight: 700; color: var(--text); }
    .hbar-track { height: 14px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .hbar-fill { height: 100%; border-radius: 999px; transition: width .3s; }
    .hbar-val { font-weight: 700; text-align: right; color: var(--muted); font-size: .75rem; }
    .otp-grid { display: flex; justify-content: center; gap: 48px; flex-wrap: wrap; margin: 8px 0; }
    .otp-item { text-align: center; }
    .otp-title { font-weight: 900; font-size: .85rem; text-transform: uppercase; color: var(--navy); margin: 8px 0 0; }
    .donut-wrap { position: relative; width: 120px; height: 120px; margin: 0 auto; }
    .donut { width: 100%; height: 100%; transform: rotate(-90deg); }
    .donut-bg { fill: none; stroke: #e2e8f0; stroke-width: 3; }
    .donut-fill { fill: none; stroke-width: 3; stroke-linecap: round; }
    .donut-fill.emerald { stroke: #059669; }
    .donut-fill.teal { stroke: #0d9488; }
    .donut-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 900; color: var(--navy); }
    .otp-daily-wrap { overflow-x: auto; margin-top: 4px; }
    .otp-daily-table { width: 100%; border-collapse: collapse; font-size: .78rem; min-width: 280px; }
    .otp-daily-table th, .otp-daily-table td { padding: 8px 10px; border: 1px solid var(--border); text-align: center; }
    .otp-daily-table thead th { background: #f1f5f9; font-size: .65rem; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; color: var(--navy); }
    .otp-daily-table tbody th { background: #f8fafc; font-weight: 900; text-align: left; color: var(--navy); white-space: nowrap; }
    .otp-daily-corner { background: #f8fafc !important; }
    .sub { font-size: .75rem; color: var(--muted); font-weight: 600; margin: 8px 0 0; }
    .sub.center { text-align: center; }
    .empty { color: var(--muted); font-style: italic; font-size: .85rem; margin: 0; }
    .evt-title { margin: 18px 0 8px; font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
    .evt-title:first-of-type { margin-top: 4px; }
    .evt-wrap { overflow-x: auto; margin-bottom: 4px; }
    .evt-table { width: 100%; border-collapse: collapse; font-size: .78rem; min-width: 480px; }
    .evt-table th { text-align: left; padding: 6px 8px; background: #f1f5f9; font-size: .65rem; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: var(--navy); border-bottom: 1px solid var(--border); }
    .evt-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .evt-table tr:nth-child(even) td { background: #fafafa; }
    footer { text-align: center; font-size: .7rem; color: var(--muted); margin-top: 24px; }
    @media print {
      body { background: #fff; padding: 12px; }
      .section { break-inside: avoid; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <h1>Informe de estadísticas operacionales</h1>
      <p class="tag">SMARTOPS · Generado ${escapeHtml(data.generatedAt)}</p>
      <div class="kv">
        <div><span>Período</span><span class="v">${escapeHtml(data.periodLabel || "—")}</span></div>
        <div><span>Aeropuertos</span><span class="v">${escapeHtml(data.airportLabel)}</span></div>
        ${metaAtd}
        <div><span>Vuelos operativos</span><span class="v">${data.flightCount}</span></div>
      </div>
    </header>

    <section class="section">
      <h2>OTP</h2>
      ${renderOtpDonuts(data)}
    </section>

    <div class="grid-2">
      <section class="section">
        <h2>Pasajeros y equipaje</h2>
        <div class="kpi-row">
          <div>
            <p class="kpi-label">Pasajeros transportados (MVT)</p>
            <p class="kpi-big">${data.totalPax.toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p class="kpi-label">Bags despachadas</p>
            <p class="kpi-big">${data.totalBags.toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p class="kpi-label">Bags / Pax</p>
            <p class="kpi-big">${data.bagsPerPaxPct != null ? `${data.bagsPerPaxPct.toFixed(2)}%` : "—"}</p>
            <p class="sub" style="margin-top:4px">Bags sobre pasajeros (MVT)</p>
          </div>
        </div>
      </section>
      <section class="section">
        <h2>Cumplimiento de hitos</h2>
        ${renderComplianceBlock("Inicio de embarque", data.inicioEmbarque, "#059669")}
        ${renderComplianceBlock("Llegada crew", data.llegadaCrew, "#4f46e5")}
      </section>
    </div>

    <div class="grid-2">
      <section class="section">
        <h2>Utilización de flota</h2>
        <p class="sub">% de vuelos operativos con equipo A320 / A321.</p>
        ${renderHBar("A320", data.fleet320Pct ?? 0, `${data.fleet320Count} de ${data.fleetTotal} · ${fmtPct(data.fleet320Pct)}`, "#334155")}
        ${renderHBar("A321", data.fleet321Pct ?? 0, `${data.fleet321Count} de ${data.fleetTotal} · ${fmtPct(data.fleet321Pct)}`, "#475569")}
      </section>
      <section class="section">
        <h2>Asignación de posiciones (PEA)</h2>
        <p class="sub">Sobre ${data.peaMvtBase} MVT enviado${data.peaMvtBase !== 1 ? "s" : ""} con PEA informada.</p>
        ${renderHBar("Manga", data.peaMangaPct ?? 0, `${data.peaMangaCount} · ${fmtPct(data.peaMangaPct)}`, "#7c3aed")}
        ${renderHBar("Remota", data.peaRemotaPct ?? 0, `${data.peaRemotaCount} · ${fmtPct(data.peaRemotaPct)}`, "#0284c7")}
      </section>
    </div>

    <section class="section">
      <h2>Promedio de embarque</h2>
      <p class="sub">Fin embarque − Inicio embarque (hitos operacionales o crew).</p>
      ${boardingBars}
    </section>

    <section class="section">
      <h2>Total de demoras por código</h2>
      <p class="sub">Participación de cada código en demoras MVT del filtro (top 12).</p>
      ${delayBars}
    </section>

    ${renderOperationalEventsSection(data)}

    <footer>SMARTOPS — Informe según filtros de la pestaña Estadísticas (fechas, aeropuertos y ATD).</footer>
  </div>
</body>
</html>`;
}

function safeFilePart(s: string): string {
    return s.replace(/[^\w.-]+/g, "_").slice(0, 48) || "informe";
}

/** Abre el informe en una pestaña nueva; si el popup está bloqueado, descarga el HTML. */
export function downloadStatsReport(data: StatsReportData): void {
    const html = buildStatsReportHtml(data);
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.document.title = "Informe estadísticas SMARTOPS";
        w.focus();
        return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_estadisticas_${safeFilePart(data.periodLabel.replace(/\s+/g, "_"))}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
