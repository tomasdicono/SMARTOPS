import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { normalizeHitosData } from "../lib/flightDataNormalize";
import { isTrasladoFlight, getAirlinePrefix } from "../lib/flightHelpers";
import { Sparkles, CheckCircle2, XCircle, Plane, BarChart3, Download, Calendar } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
    flights: Flight[];
}

interface LimpiezaStats {
    totalVuelos: number;
    conLimpieza: number;
    sinLimpieza: number;
    planificada: number;
    crew: number;
    sinInfo: number;
    pctConLimpieza: number;
    pctPlanificada: number;
    pctCrew: number;
}

interface LimpiezaPorMatricula {
    reg: string;
    totalVuelos: number;
    conLimpieza: number;
    planificada: number;
    crew: number;
    pctLimpieza: number;
}

interface CumplimientoProgramada {
    totalPrimerosVuelos: number;
    conLimpiezaProgramada: number;
    pctCumplimiento: number;
}

function filterFlightsByDate(flights: Flight[], dateFrom: string, dateTo: string): Flight[] {
    if (!dateFrom && !dateTo) return flights;
    return flights.filter(f => {
        const d = f.date || "";
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
    });
}

function computeLimpiezaStats(flights: Flight[]): LimpiezaStats {
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    let conLimpieza = 0;
    let sinLimpieza = 0;
    let planificada = 0;
    let crew = 0;
    let sinInfo = 0;

    for (const f of validFlights) {
        const h = normalizeHitosData(f.hitosData);
        if (h.limpiezaStatus === "si") {
            conLimpieza++;
            if (h.limpiezaTipo === "planificada") planificada++;
            else if (h.limpiezaTipo === "crew") crew++;
        } else if (h.limpiezaStatus === "no") {
            sinLimpieza++;
        } else {
            sinInfo++;
        }
    }

    const totalVuelos = validFlights.length;
    return {
        totalVuelos,
        conLimpieza,
        sinLimpieza,
        planificada,
        crew,
        sinInfo,
        pctConLimpieza: totalVuelos > 0 ? (conLimpieza / totalVuelos) * 100 : 0,
        pctPlanificada: conLimpieza > 0 ? (planificada / conLimpieza) * 100 : 0,
        pctCrew: conLimpieza > 0 ? (crew / conLimpieza) * 100 : 0,
    };
}

function computeCumplimientoProgramada(flights: Flight[]): CumplimientoProgramada {
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    const flightsByRegAndDate = new Map<string, Flight[]>();
    
    for (const f of validFlights) {
        const reg = f.reg?.trim().toUpperCase() || "";
        const date = f.date || "";
        if (!reg || !date) continue;
        
        const key = `${reg}-${date}`;
        const existing = flightsByRegAndDate.get(key) || [];
        existing.push(f);
        flightsByRegAndDate.set(key, existing);
    }
    
    let totalPrimerosVuelos = 0;
    let conLimpiezaProgramada = 0;
    
    for (const [, dayFlights] of flightsByRegAndDate) {
        const sorted = dayFlights.sort((a, b) => {
            const stdA = a.std || a.etd || "";
            const stdB = b.std || b.etd || "";
            return stdA.localeCompare(stdB);
        });
        
        const primerVuelo = sorted[0];
        if (!primerVuelo) continue;
        
        const dep = primerVuelo.dep?.trim().toUpperCase() || "";
        if (dep === "LIM") continue;
        
        totalPrimerosVuelos++;
        
        const h = normalizeHitosData(primerVuelo.hitosData);
        if (h.limpiezaStatus === "si" && h.limpiezaTipo === "planificada") {
            conLimpiezaProgramada++;
        }
    }
    
    return {
        totalPrimerosVuelos,
        conLimpiezaProgramada,
        pctCumplimiento: totalPrimerosVuelos > 0 ? (conLimpiezaProgramada / totalPrimerosVuelos) * 100 : 0,
    };
}

function computeLimpiezaPorMatricula(flights: Flight[]): LimpiezaPorMatricula[] {
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    const byReg = new Map<string, { total: number; conLimpieza: number; planificada: number; crew: number }>();
    
    for (const f of validFlights) {
        const reg = f.reg?.trim().toUpperCase() || "SIN MAT";
        const h = normalizeHitosData(f.hitosData);
        
        const current = byReg.get(reg) || { total: 0, conLimpieza: 0, planificada: 0, crew: 0 };
        current.total++;
        
        if (h.limpiezaStatus === "si") {
            current.conLimpieza++;
            if (h.limpiezaTipo === "planificada") current.planificada++;
            else if (h.limpiezaTipo === "crew") current.crew++;
        }
        
        byReg.set(reg, current);
    }
    
    return Array.from(byReg.entries())
        .map(([reg, data]) => ({
            reg,
            totalVuelos: data.total,
            conLimpieza: data.conLimpieza,
            planificada: data.planificada,
            crew: data.crew,
            pctLimpieza: data.total > 0 ? (data.conLimpieza / data.total) * 100 : 0,
        }))
        .sort((a, b) => b.conLimpieza - a.conLimpieza);
}

function downloadLimpiezaExcel(
    flights: Flight[],
    stats: LimpiezaStats,
    cumplimiento: CumplimientoProgramada,
    porMatricula: LimpiezaPorMatricula[],
    dateFrom: string,
    dateTo: string
) {
    const wb = XLSX.utils.book_new();
    
    // Hoja 1: Resumen
    const resumenData = [
        ["REPORTE DE LIMPIEZA"],
        [""],
        ["Período", dateFrom && dateTo ? `${dateFrom} a ${dateTo}` : "Todos los vuelos"],
        [""],
        ["RESUMEN GENERAL"],
        ["Total de vuelos", stats.totalVuelos],
        ["Con limpieza", stats.conLimpieza, `${stats.pctConLimpieza.toFixed(1)}%`],
        ["Sin limpieza", stats.sinLimpieza],
        ["Sin información", stats.sinInfo],
        [""],
        ["TIPO DE LIMPIEZA"],
        ["Planificada", stats.planificada, `${stats.pctPlanificada.toFixed(1)}%`],
        ["Crew", stats.crew, `${stats.pctCrew.toFixed(1)}%`],
        [""],
        ["CUMPLIMIENTO PROGRAMADA"],
        ["Total primeros vuelos (excl. LIM)", cumplimiento.totalPrimerosVuelos],
        ["Con limpieza programada", cumplimiento.conLimpiezaProgramada],
        ["% Cumplimiento", `${cumplimiento.pctCumplimiento.toFixed(1)}%`],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    
    // Hoja 2: Por Matrícula
    const matriculaHeaders = ["Matrícula", "Total Vuelos", "Con Limpieza", "Planificada", "Crew", "% Limpieza"];
    const matriculaRows = porMatricula.map(r => [
        r.reg,
        r.totalVuelos,
        r.conLimpieza,
        r.planificada,
        r.crew,
        `${r.pctLimpieza.toFixed(1)}%`
    ]);
    const wsMatricula = XLSX.utils.aoa_to_sheet([matriculaHeaders, ...matriculaRows]);
    XLSX.utils.book_append_sheet(wb, wsMatricula, "Por Matrícula");
    
    // Hoja 3: Detalle de vuelos
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    const detalleHeaders = ["Fecha", "Vuelo", "Matrícula", "Origen", "Destino", "STD", "Limpieza", "Tipo"];
    const detalleRows = validFlights.map(f => {
        const h = normalizeHitosData(f.hitosData);
        const limpieza = h.limpiezaStatus === "si" ? "Sí" : h.limpiezaStatus === "no" ? "No" : "Sin info";
        const tipo = h.limpiezaTipo === "planificada" ? "Planificada" : h.limpiezaTipo === "crew" ? "Crew" : "-";
        return [
            f.date || "",
            `${getAirlinePrefix(f.flt)}${f.flt}`,
            f.reg || "",
            f.dep || "",
            f.arr || "",
            f.std || "",
            limpieza,
            tipo
        ];
    });
    const wsDetalle = XLSX.utils.aoa_to_sheet([detalleHeaders, ...detalleRows]);
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Vuelos");
    
    const dateLabel = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : "todos";
    XLSX.writeFile(wb, `reporte_limpieza_${dateLabel}.xlsx`);
}

export function ControlLimpiezaTab({ flights }: Props) {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    
    const filteredFlights = useMemo(() => filterFlightsByDate(flights, dateFrom, dateTo), [flights, dateFrom, dateTo]);
    const stats = useMemo(() => computeLimpiezaStats(filteredFlights), [filteredFlights]);
    const cumplimiento = useMemo(() => computeCumplimientoProgramada(filteredFlights), [filteredFlights]);
    const porMatricula = useMemo(() => computeLimpiezaPorMatricula(filteredFlights), [filteredFlights]);

    const handleDownloadExcel = () => {
        downloadLimpiezaExcel(filteredFlights, stats, cumplimiento, porMatricula, dateFrom, dateTo);
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
                        <h2 className="text-xl font-black text-slate-800">Estadísticas de Limpieza</h2>
                        <p className="text-sm text-slate-500">Análisis de limpiezas de tránsito por vuelo y matrícula</p>
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
                        {filteredFlights.length} vuelos en el período
                    </span>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total con Limpieza */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Con Limpieza</span>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="text-3xl font-black text-emerald-600">{stats.pctConLimpieza.toFixed(1)}%</div>
                    <div className="text-sm text-slate-500 mt-1">
                        {stats.conLimpieza} de {stats.totalVuelos} vuelos
                    </div>
                </div>

                {/* Planificada vs Crew */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Tipo de Limpieza</span>
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">Planificada</span>
                            <span className="font-bold text-blue-600">{stats.planificada} ({stats.pctPlanificada.toFixed(1)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">Crew</span>
                            <span className="font-bold text-violet-600">{stats.crew} ({stats.pctCrew.toFixed(1)}%)</span>
                        </div>
                    </div>
                </div>

                {/* Sin Limpieza */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Sin Limpieza</span>
                        <XCircle className="w-5 h-5 text-rose-500" />
                    </div>
                    <div className="text-3xl font-black text-rose-600">{stats.sinLimpieza}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        {stats.sinInfo > 0 && <span className="text-amber-600">{stats.sinInfo} sin información</span>}
                    </div>
                </div>

                {/* Cumplimiento Programada */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Cumplimiento</span>
                        <Plane className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div className={`text-3xl font-black ${cumplimiento.pctCumplimiento >= 80 ? "text-emerald-600" : cumplimiento.pctCumplimiento >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                        {cumplimiento.pctCumplimiento.toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                        {cumplimiento.conLimpiezaProgramada} de {cumplimiento.totalPrimerosVuelos} primeros vuelos
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                        (excluye salidas desde LIM)
                    </div>
                </div>
            </div>

            {/* Barra de distribución */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-3">Distribución de Limpiezas</h3>
                <div className="h-8 rounded-lg overflow-hidden flex">
                    {stats.planificada > 0 && (
                        <div 
                            className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold"
                            style={{ width: `${(stats.planificada / stats.totalVuelos) * 100}%` }}
                            title={`Planificada: ${stats.planificada}`}
                        >
                            {stats.planificada > 0 && stats.planificada}
                        </div>
                    )}
                    {stats.crew > 0 && (
                        <div 
                            className="bg-violet-500 flex items-center justify-center text-white text-xs font-bold"
                            style={{ width: `${(stats.crew / stats.totalVuelos) * 100}%` }}
                            title={`Crew: ${stats.crew}`}
                        >
                            {stats.crew > 0 && stats.crew}
                        </div>
                    )}
                    {stats.sinLimpieza > 0 && (
                        <div 
                            className="bg-rose-400 flex items-center justify-center text-white text-xs font-bold"
                            style={{ width: `${(stats.sinLimpieza / stats.totalVuelos) * 100}%` }}
                            title={`Sin limpieza: ${stats.sinLimpieza}`}
                        >
                            {stats.sinLimpieza > 0 && stats.sinLimpieza}
                        </div>
                    )}
                    {stats.sinInfo > 0 && (
                        <div 
                            className="bg-slate-300 flex items-center justify-center text-slate-600 text-xs font-bold"
                            style={{ width: `${(stats.sinInfo / stats.totalVuelos) * 100}%` }}
                            title={`Sin info: ${stats.sinInfo}`}
                        >
                            {stats.sinInfo > 0 && stats.sinInfo}
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-500"></div>
                        <span className="text-slate-600">Planificada</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-violet-500"></div>
                        <span className="text-slate-600">Crew</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-rose-400"></div>
                        <span className="text-slate-600">Sin limpieza</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-slate-300"></div>
                        <span className="text-slate-600">Sin información</span>
                    </div>
                </div>
            </div>

            {/* Tabla por Matrícula */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-bold text-slate-800">Limpiezas por Matrícula</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 text-left">Matrícula</th>
                                <th className="px-4 py-3 text-center">Vuelos</th>
                                <th className="px-4 py-3 text-center">Con Limpieza</th>
                                <th className="px-4 py-3 text-center">Planificada</th>
                                <th className="px-4 py-3 text-center">Crew</th>
                                <th className="px-4 py-3 text-center">% Limpieza</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {porMatricula.map((row) => (
                                <tr key={row.reg} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-bold text-slate-800">{row.reg}</td>
                                    <td className="px-4 py-3 text-center text-slate-600">{row.totalVuelos}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 font-bold">
                                            {row.conLimpieza}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-blue-100 text-blue-700 font-bold">
                                            {row.planificada}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-violet-100 text-violet-700 font-bold">
                                            {row.crew}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`font-bold ${row.pctLimpieza >= 80 ? "text-emerald-600" : row.pctLimpieza >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                                            {row.pctLimpieza.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {porMatricula.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                        No hay datos de limpieza disponibles
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
