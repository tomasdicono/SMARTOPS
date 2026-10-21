import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { isTrasladoFlight, getAirlinePrefix, flightNeedsCleaningWarning, getHitosDepartureTime } from "../lib/flightHelpers";
import { flightDateToIso, parseHHmmToMinutes } from "../lib/controlHelpers";
import { ARGENTINA_AIRPORTS } from "../lib/costControllingHelpers";
import { Sparkles, CheckCircle2, Plane, BarChart3, Download, Calendar, Target } from "lucide-react";

const ARGENTINA_DEP_AIRPORTS = new Set<string>([...ARGENTINA_AIRPORTS, "SDE", "UAQ"]);

function isArgentinaDeparture(f: Flight): boolean {
    return ARGENTINA_DEP_AIRPORTS.has(String(f.dep ?? "").trim().toUpperCase());
}

interface Props {
    flights: Flight[];
}

interface LimpiezaStats {
    totalVuelos: number;
    limpiezaTotal: number;
    limpiezaRequeridas: number;  // Por tripulación (crew)
    limpiezaPlanificadas: number;
    pctConLimpieza: number;
    pctRequeridas: number;
    pctPlanificadas: number;
    programadasEsperadas: number;
    programadasCumplidas: number;
    pctCumplimiento: number;
}

interface ProgramadaRow {
    fecha: string;
    vuelo: string;
    reg: string;
    dep: string;
    arr: string;
    std: string;
    motivo: string;
    marcadoEn: string;
    ejecutada: boolean;
}

interface LimpiezaPorMatricula {
    reg: string;
    totalVuelos: number;
    limpiezasEjecutadas: number;
    requeridas: number;
    planificadas: number;
    pctLimpieza: number;
}

function filterFlightsByDate(flights: Flight[], dateFrom: string, dateTo: string): Flight[] {
    if (!dateFrom && !dateTo) return flights;
    return flights.filter(f => {
        const d = flightDateToIso(f);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
    });
}

function operationalFlights(flights: Flight[]): Flight[] {
    return flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
}

function compareFlightTimeline(a: Flight, b: Flight): number {
    const dateCmp = flightDateToIso(a).localeCompare(flightDateToIso(b));
    if (dateCmp !== 0) return dateCmp;
    return parseHHmmToMinutes(getHitosDepartureTime(a)) - parseHHmmToMinutes(getHitosDepartureTime(b));
}

function firstDeparturesByRegAndDate(flights: Flight[]): Set<string> {
    const byKey = new Map<string, Flight>();
    for (const f of flights) {
        const reg = f.reg?.trim().toUpperCase() || "";
        const date = flightDateToIso(f);
        if (!reg || !date) continue;
        const key = `${reg}|${date}`;
        const prev = byKey.get(key);
        if (!prev || compareFlightTimeline(f, prev) < 0) {
            byKey.set(key, f);
        }
    }
    return new Set([...byKey.values()].map(f => f.id));
}

function buildNextFlightById(timelineFlights: Flight[]): Map<string, Flight> {
    const byReg = new Map<string, Flight[]>();
    for (const f of timelineFlights) {
        const reg = f.reg?.trim().toUpperCase() || "";
        if (!reg) continue;
        const list = byReg.get(reg) ?? [];
        list.push(f);
        byReg.set(reg, list);
    }
    const nextById = new Map<string, Flight>();
    for (const list of byReg.values()) {
        list.sort(compareFlightTimeline);
        for (let i = 0; i < list.length - 1; i++) {
            nextById.set(list[i].id, list[i + 1]);
        }
    }
    return nextById;
}

function flightLabel(f: Flight): string {
    return `${getAirlinePrefix(f.flt)}${f.flt}`;
}

function toProgramadaRow(
    f: Flight,
    motivo: string,
    checkFlight: Flight | undefined,
    marcadoEn: string,
): ProgramadaRow {
    return {
        fecha: flightDateToIso(f) || "",
        vuelo: flightLabel(f),
        reg: f.reg || "",
        dep: f.dep || "",
        arr: f.arr || "",
        std: f.std || "",
        motivo,
        marcadoEn,
        ejecutada: checkFlight?.hitosData?.limpiezaStatus === "si",
    };
}

function computeProgramadas(scopedFlights: Flight[], timelineFlights: Flight[]): ProgramadaRow[] {
    const scoped = operationalFlights(scopedFlights);
    const timeline = operationalFlights(timelineFlights);
    const firstIds = firstDeparturesByRegAndDate(scoped);
    const nextById = buildNextFlightById(timeline);
    const rows: ProgramadaRow[] = [];

    for (const f of scoped) {
        if (!isArgentinaDeparture(f)) continue;
        const first = firstIds.has(f.id);
        const longBlock = flightNeedsCleaningWarning(f);

        if (first) {
            rows.push(toProgramadaRow(f, "Primera salida del día", f, `${flightLabel(f)} (mismo vuelo)`));
        }
        if (longBlock) {
            const next = nextById.get(f.id);
            const marcadoEn = next
                ? `${flightLabel(next)} ${flightDateToIso(next)} ${next.dep}-${next.arr}`.trim()
                : "Sin vuelo siguiente";
            rows.push(toProgramadaRow(f, "Bloque > 03:30hs (limpia en destino)", next, marcadoEn));
        }
    }

    return rows.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.vuelo.localeCompare(b.vuelo) || a.motivo.localeCompare(b.motivo));
}

function computeLimpiezaStats(scopedFlights: Flight[], timelineFlights: Flight[]): LimpiezaStats {
    const nonTrasladoOperational = operationalFlights(scopedFlights);
    
    const limpiezaTotal = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si").length;
    const limpiezaRequeridas = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si" && f.hitosData?.limpiezaTipo === "crew").length;
    const limpiezaPlanificadas = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si" && f.hitosData?.limpiezaTipo === "planificada").length;
    const programadas = computeProgramadas(scopedFlights, timelineFlights);
    const programadasEsperadas = programadas.length;
    const programadasCumplidas = programadas.filter(p => p.ejecutada).length;

    const totalVuelos = nonTrasladoOperational.length;

    return {
        totalVuelos,
        limpiezaTotal,
        limpiezaRequeridas,
        limpiezaPlanificadas,
        pctConLimpieza: totalVuelos > 0 ? (limpiezaTotal / totalVuelos) * 100 : 0,
        pctRequeridas: limpiezaTotal > 0 ? (limpiezaRequeridas / limpiezaTotal) * 100 : 0,
        pctPlanificadas: limpiezaTotal > 0 ? (limpiezaPlanificadas / limpiezaTotal) * 100 : 0,
        programadasEsperadas,
        programadasCumplidas,
        pctCumplimiento: programadasEsperadas > 0 ? (programadasCumplidas / programadasEsperadas) * 100 : 0,
    };
}

function computeLimpiezaPorMatricula(flights: Flight[]): LimpiezaPorMatricula[] {
    const nonTrasladoOperational = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    const byReg = new Map<string, { total: number; limpiezas: number; requeridas: number; planificadas: number }>();
    
    for (const f of nonTrasladoOperational) {
        const reg = f.reg?.trim().toUpperCase() || "SIN MAT";
        
        const current = byReg.get(reg) || { total: 0, limpiezas: 0, requeridas: 0, planificadas: 0 };
        current.total++;
        
        if (f.hitosData?.limpiezaStatus === "si") {
            current.limpiezas++;
            if (f.hitosData?.limpiezaTipo === "crew") {
                current.requeridas++;
            } else if (f.hitosData?.limpiezaTipo === "planificada") {
                current.planificadas++;
            }
        }
        
        byReg.set(reg, current);
    }
    
    return Array.from(byReg.entries())
        .map(([reg, data]) => ({
            reg,
            totalVuelos: data.total,
            limpiezasEjecutadas: data.limpiezas,
            requeridas: data.requeridas,
            planificadas: data.planificadas,
            pctLimpieza: data.total > 0 ? (data.limpiezas / data.total) * 100 : 0,
        }))
        .filter(r => r.limpiezasEjecutadas > 0)
        .sort((a, b) => b.limpiezasEjecutadas - a.limpiezasEjecutadas);
}

function escHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function htmlTable(headers: string[], rows: unknown[][], opts?: { lastColBadge?: boolean }): string {
    const head = headers.map(h => `<th>${escHtml(h)}</th>`).join("");
    const body = rows.map((row, i) => {
        const tds = row.map((cell, idx) => {
            const raw = String(cell ?? "");
            let cls = "";
            if (opts?.lastColBadge && idx === row.length - 1) {
                cls = raw === "Sí" ? "ok" : raw === "No" ? "bad" : raw === "Programada" ? "prog" : raw === "A Requerimiento" ? "req" : "";
            }
            return `<td class="${cls}">${escHtml(raw)}</td>`;
        }).join("");
        return `<tr class="${i % 2 ? "alt" : ""}">${tds}</tr>`;
    }).join("");
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function downloadLimpiezaExcel(
    flights: Flight[],
    allFlights: Flight[],
    stats: LimpiezaStats,
    porMatricula: LimpiezaPorMatricula[],
    dateFrom: string,
    dateTo: string
) {
    const period = dateFrom && dateTo ? `${dateFrom} a ${dateTo}` : "Todos los vuelos";
    const programadas = computeProgramadas(flights, allFlights);
    const cumplimientoColor = stats.pctCumplimiento >= 80 ? "#10B981" : stats.pctCumplimiento >= 50 ? "#F59E0B" : "#F43F5E";

    const flightsConLimpieza = operationalFlights(flights).filter(f => f.hitosData?.limpiezaStatus === "si");
    const detalleRows = flightsConLimpieza.map(f => [
        flightDateToIso(f) || "",
        `${getAirlinePrefix(f.flt)}${f.flt}`,
        f.reg || "",
        f.dep || "",
        f.arr || "",
        f.std || "",
        f.hitosData?.limpiezaTipo === "crew" ? "A Requerimiento" :
        f.hitosData?.limpiezaTipo === "planificada" ? "Programada" : "-",
    ]);
    const matriculaRows = porMatricula.map(r => [
        r.reg, r.totalVuelos, r.limpiezasEjecutadas, r.requeridas, r.planificadas, `${r.pctLimpieza.toFixed(1)}%`
    ]);
    const cumplimientoRows = programadas.map(p => [
        p.fecha, p.vuelo, p.reg, p.dep, p.arr, p.std, p.motivo, p.marcadoEn, p.ejecutada ? "Sí" : "No"
    ]);

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #0F172A; }
  .banner { background: #0F172A; color: #fff; padding: 16px 20px; }
  .banner h1 { margin: 0; font-size: 22px; }
  .banner p { margin: 4px 0 0; color: #67E8F9; font-weight: 700; }
  .kpis { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .kpis th { background: #7C3AED; color: #fff; padding: 8px 10px; text-align: left; }
  .kpis td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; }
  .kpis tr:nth-child(even) td { background: #F8FAFC; }
  .cumpl { background: ${cumplimientoColor}; color: #fff; font-weight: 800; }
  h2 { color: #0F172A; border-left: 6px solid #06B6D4; padding-left: 10px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  th { background: #0F172A; color: #fff; padding: 8px; font-size: 12px; }
  td { padding: 7px 8px; border-bottom: 1px solid #E2E8F0; text-align: center; }
  tr.alt td { background: #F1F5F9; }
  td.ok { background: #D1FAE5; color: #047857; font-weight: 800; }
  td.bad { background: #FEE2E2; color: #BE123C; font-weight: 800; }
  td.prog { background: #EDE9FE; color: #6D28D9; font-weight: 700; }
  td.req { background: #DBEAFE; color: #1D4ED8; font-weight: 700; }
</style>
</head>
<body>
  <div class="banner">
    <h1>SMARTOPS · Servicios de Limpieza</h1>
    <p>Período: ${escHtml(period)}</p>
  </div>
  <h2>Resumen</h2>
  <table class="kpis">
    <tr><th>KPI</th><th>Valor</th><th>Detalle</th></tr>
    <tr><td>Vuelos operativos</td><td>${stats.totalVuelos}</td><td>Excluye traslados y cancelados</td></tr>
    <tr><td>Limpiezas realizadas</td><td>${stats.limpiezaTotal}</td><td>${stats.pctConLimpieza.toFixed(1)}% de los vuelos</td></tr>
    <tr><td>A requerimiento (tripulación)</td><td>${stats.limpiezaRequeridas}</td><td>${stats.pctRequeridas.toFixed(1)}% de las realizadas</td></tr>
    <tr><td>Programadas (hitos)</td><td>${stats.limpiezaPlanificadas}</td><td>${stats.pctPlanificadas.toFixed(1)}% de las realizadas</td></tr>
    <tr><td>Programadas esperadas</td><td>${stats.programadasEsperadas}</td><td>Primera salida del día (mismo vuelo) + bloque &gt; 03:30hs verificado en el vuelo siguiente (solo salidas de Argentina)</td></tr>
    <tr><td>Programadas cumplidas</td><td>${stats.programadasCumplidas}</td><td>Con limpieza registrada en hitos del vuelo correspondiente</td></tr>
    <tr class="cumpl"><td>% cumplimiento programadas</td><td>${stats.pctCumplimiento.toFixed(1)}%</td><td>${stats.programadasCumplidas} de ${stats.programadasEsperadas}</td></tr>
  </table>
  <h2>Por matrícula</h2>
  ${htmlTable(["Matrícula", "Total Vuelos", "Limpiezas Realizadas", "A Requerimiento", "Programadas", "% Limpieza"], matriculaRows)}
  <h2>Detalle de limpiezas realizadas</h2>
  ${htmlTable(["Fecha", "Vuelo", "Matrícula", "Origen", "Destino", "STD", "Tipo Limpieza"], detalleRows, { lastColBadge: true })}
  <h2>Cumplimiento de programadas</h2>
  ${htmlTable(["Fecha", "Vuelo", "Matrícula", "Origen", "Destino", "STD", "Motivo programada", "Limpieza se marca en", "Ejecutada"], cumplimientoRows, { lastColBadge: true })}
</body>
</html>`;

    const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateLabel = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : "todos";
    a.href = url;
    a.download = `reporte_limpieza_${dateLabel}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function ControlLimpiezaTab({ flights }: Props) {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    
    const filteredFlights = useMemo(() => filterFlightsByDate(flights, dateFrom, dateTo), [flights, dateFrom, dateTo]);
    const stats = useMemo(() => computeLimpiezaStats(filteredFlights, flights), [filteredFlights, flights]);
    const porMatricula = useMemo(() => computeLimpiezaPorMatricula(filteredFlights), [filteredFlights]);

    const handleDownloadExcel = () => {
        downloadLimpiezaExcel(filteredFlights, flights, stats, porMatricula, dateFrom, dateTo);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-100 rounded-xl">
                        <Sparkles className="w-6 h-6 text-violet-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Servicios de Limpieza</h2>
                        <p className="text-sm text-slate-500">Limpiezas registradas en hitos operacionales</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleDownloadExcel}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-all"
                >
                    <Download className="w-4 h-4" />
                    Descargar Excel
                </button>
            </div>

            {/* Filtro de Fechas */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-5 h-5 text-slate-500" />
                    <span className="font-bold text-slate-700">Filtrar por Fecha</span>
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">Desde:</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">Hasta:</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                        />
                    </div>
                    {(dateFrom || dateTo) && (
                        <button
                            type="button"
                            onClick={() => { setDateFrom(""); setDateTo(""); }}
                            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                        >
                            Limpiar filtro
                        </button>
                    )}
                    <span className="text-sm text-slate-500">
                        {stats.totalVuelos} vuelos operativos en el período
                    </span>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Limpiezas Realizadas */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Realizadas</span>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="text-3xl font-black text-emerald-600">{stats.limpiezaTotal.toLocaleString("es-AR")}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        {stats.pctConLimpieza.toFixed(1)}% de {stats.totalVuelos} vuelos
                    </div>
                </div>

                {/* A Requerimiento (Tripulación) */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">A Requerimiento</span>
                        <Plane className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-3xl font-black text-blue-600">{stats.limpiezaRequeridas.toLocaleString("es-AR")}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        Por tripulación
                    </div>
                </div>

                {/* Programadas */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Programadas</span>
                        <BarChart3 className="w-5 h-5 text-violet-500" />
                    </div>
                    <div className="text-3xl font-black text-violet-600">{stats.limpiezaPlanificadas.toLocaleString("es-AR")}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        Planificadas/itinerario
                    </div>
                </div>

                {/* Distribución */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Distribución</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">Requerimiento</span>
                            <span className="font-bold text-blue-600">{stats.pctRequeridas.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">Programadas</span>
                            <span className="font-bold text-violet-600">{stats.pctPlanificadas.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                {/* Cumplimiento programadas */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Cumplimiento</span>
                        <Target className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div className={`text-3xl font-black ${stats.pctCumplimiento >= 80 ? "text-emerald-600" : stats.pctCumplimiento >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                        {stats.pctCumplimiento.toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                        {stats.programadasCumplidas} de {stats.programadasEsperadas} programadas
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                        Primera salida: mismo vuelo · Bloque &gt; 03:30hs: vuelo siguiente · solo salidas de Argentina
                    </div>
                </div>
            </div>

            {/* Barra de distribución */}
            {stats.limpiezaTotal > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3">Distribución de Limpiezas</h3>
                    <div className="h-8 rounded-lg overflow-hidden flex">
                        {stats.limpiezaRequeridas > 0 && (
                            <div 
                                className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold"
                                style={{ width: `${stats.pctRequeridas}%` }}
                                title={`A Requerimiento: ${stats.limpiezaRequeridas}`}
                            >
                                {stats.limpiezaRequeridas}
                            </div>
                        )}
                        {stats.limpiezaPlanificadas > 0 && (
                            <div 
                                className="bg-violet-500 flex items-center justify-center text-white text-xs font-bold"
                                style={{ width: `${stats.pctPlanificadas}%` }}
                                title={`Programadas: ${stats.limpiezaPlanificadas}`}
                            >
                                {stats.limpiezaPlanificadas}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-blue-500"></div>
                            <span className="text-slate-600">A Requerimiento (Por tripulación)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-violet-500"></div>
                            <span className="text-slate-600">Programadas (Planificadas/itinerario)</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabla por Matrícula */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-bold text-slate-800">Limpiezas Ejecutadas por Matrícula</h3>
                    <p className="text-sm text-slate-500 mt-1">Solo matrículas con al menos una limpieza registrada</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 text-left">Matrícula</th>
                                <th className="px-4 py-3 text-center">Total Vuelos</th>
                                <th className="px-4 py-3 text-center">Limpiezas</th>
                                <th className="px-4 py-3 text-center">A Requerimiento</th>
                                <th className="px-4 py-3 text-center">Programadas</th>
                                <th className="px-4 py-3 text-center">% del Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {porMatricula.map((row) => (
                                <tr key={row.reg} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-bold text-slate-800">{row.reg}</td>
                                    <td className="px-4 py-3 text-center text-slate-600">{row.totalVuelos}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 font-bold">
                                            {row.limpiezasEjecutadas}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-blue-100 text-blue-700 font-bold">
                                            {row.requeridas}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-violet-100 text-violet-700 font-bold">
                                            {row.planificadas}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="font-bold text-slate-600">
                                            {row.pctLimpieza.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {porMatricula.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                        No hay limpiezas registradas en el período seleccionado
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
