import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { normalizeHitosData } from "../lib/flightDataNormalize";
import { isTrasladoFlight, flightNeedsCleaningWarning, getAirlinePrefix } from "../lib/flightHelpers";
import { flightDateToIso } from "../lib/controlHelpers";
import { Sparkles, CheckCircle2, Plane, BarChart3, Download, Calendar, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
    flights: Flight[];
}

interface LimpiezaStats {
    // Vuelos con bloque > 3:30hs (requieren limpieza programada)
    vuelosConWarning: number;
    // De esos, cuántos tienen limpieza ejecutada
    warningConLimpieza: number;
    // % de cumplimiento de limpiezas programadas
    pctCumplimientoProgramada: number;
    
    // Vuelos sin warning pero con limpieza requerida por crew
    limpiezasNoProgramadas: number;
    
    // Total de vuelos válidos
    totalVuelos: number;
    // Total de limpiezas ejecutadas (programadas + no programadas)
    totalLimpiezasEjecutadas: number;
}

interface LimpiezaPorMatricula {
    reg: string;
    totalVuelos: number;
    limpiezasEjecutadas: number;
    programadas: number;
    porCrew: number;
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

function computeLimpiezaStats(flights: Flight[]): LimpiezaStats {
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    let vuelosConWarning = 0;
    let warningConLimpieza = 0;
    let limpiezasNoProgramadas = 0;
    let totalLimpiezasEjecutadas = 0;

    for (const f of validFlights) {
        const h = normalizeHitosData(f.hitosData);
        const needsCleaning = flightNeedsCleaningWarning(f);
        const tieneHitos = h.hitosSentAt && h.hitosSentAt.trim() !== "";
        
        if (needsCleaning) {
            vuelosConWarning++;
            if (tieneHitos && h.limpiezaStatus === "si") {
                warningConLimpieza++;
                totalLimpiezasEjecutadas++;
            }
        } else {
            // Vuelo sin warning pero con limpieza requerida por crew
            if (tieneHitos && h.limpiezaStatus === "si" && h.limpiezaTipo === "crew") {
                limpiezasNoProgramadas++;
                totalLimpiezasEjecutadas++;
            }
        }
    }

    return {
        vuelosConWarning,
        warningConLimpieza,
        pctCumplimientoProgramada: vuelosConWarning > 0 ? (warningConLimpieza / vuelosConWarning) * 100 : 0,
        limpiezasNoProgramadas,
        totalVuelos: validFlights.length,
        totalLimpiezasEjecutadas,
    };
}

function computeLimpiezaPorMatricula(flights: Flight[]): LimpiezaPorMatricula[] {
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    const byReg = new Map<string, { total: number; limpiezas: number; programadas: number; porCrew: number }>();
    
    for (const f of validFlights) {
        const reg = f.reg?.trim().toUpperCase() || "SIN MAT";
        const h = normalizeHitosData(f.hitosData);
        const tieneHitos = h.hitosSentAt && h.hitosSentAt.trim() !== "";
        const needsCleaning = flightNeedsCleaningWarning(f);
        
        const current = byReg.get(reg) || { total: 0, limpiezas: 0, programadas: 0, porCrew: 0 };
        current.total++;
        
        if (tieneHitos && h.limpiezaStatus === "si") {
            current.limpiezas++;
            if (needsCleaning) {
                current.programadas++;
            } else if (h.limpiezaTipo === "crew") {
                current.porCrew++;
            }
        }
        
        byReg.set(reg, current);
    }
    
    return Array.from(byReg.entries())
        .map(([reg, data]) => ({
            reg,
            totalVuelos: data.total,
            limpiezasEjecutadas: data.limpiezas,
            programadas: data.programadas,
            porCrew: data.porCrew,
            pctLimpieza: data.total > 0 ? (data.limpiezas / data.total) * 100 : 0,
        }))
        .filter(r => r.limpiezasEjecutadas > 0)
        .sort((a, b) => b.limpiezasEjecutadas - a.limpiezasEjecutadas);
}

function downloadLimpiezaExcel(
    flights: Flight[],
    stats: LimpiezaStats,
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
        ["Total de vuelos (excl. traslados y cancelados)", stats.totalVuelos],
        [""],
        ["LIMPIEZAS PROGRAMADAS (Bloque > 3:30hs)"],
        ["Vuelos que requieren limpieza", stats.vuelosConWarning],
        ["Limpiezas ejecutadas", stats.warningConLimpieza],
        ["% Cumplimiento", `${stats.pctCumplimientoProgramada.toFixed(1)}%`],
        [""],
        ["LIMPIEZAS NO PROGRAMADAS (Requeridas por crew)"],
        ["Cantidad", stats.limpiezasNoProgramadas],
        [""],
        ["TOTAL LIMPIEZAS EJECUTADAS", stats.totalLimpiezasEjecutadas],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    
    // Hoja 2: Por Matrícula
    const matriculaHeaders = ["Matrícula", "Total Vuelos", "Limpiezas Ejecutadas", "Programadas", "Por Crew", "% Limpieza"];
    const matriculaRows = porMatricula.map(r => [
        r.reg,
        r.totalVuelos,
        r.limpiezasEjecutadas,
        r.programadas,
        r.porCrew,
        `${r.pctLimpieza.toFixed(1)}%`
    ]);
    const wsMatricula = XLSX.utils.aoa_to_sheet([matriculaHeaders, ...matriculaRows]);
    XLSX.utils.book_append_sheet(wb, wsMatricula, "Por Matrícula");
    
    // Hoja 3: Detalle de vuelos con limpieza
    const validFlights = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    const flightsConLimpieza = validFlights.filter(f => {
        const h = normalizeHitosData(f.hitosData);
        return h.hitosSentAt && h.hitosSentAt.trim() !== "" && h.limpiezaStatus === "si";
    });
    
    const detalleHeaders = ["Fecha", "Vuelo", "Matrícula", "Origen", "Destino", "STD", "Requiere Limpieza (>3:30)", "Tipo"];
    const detalleRows = flightsConLimpieza.map(f => {
        const h = normalizeHitosData(f.hitosData);
        const needsCleaning = flightNeedsCleaningWarning(f);
        const tipo = needsCleaning ? "Programada" : (h.limpiezaTipo === "crew" ? "Por Crew" : h.limpiezaTipo || "-");
        return [
            flightDateToIso(f) || "",
            `${getAirlinePrefix(f.flt)}${f.flt}`,
            f.reg || "",
            f.dep || "",
            f.arr || "",
            f.std || "",
            needsCleaning ? "Sí" : "No",
            tipo
        ];
    });
    const wsDetalle = XLSX.utils.aoa_to_sheet([detalleHeaders, ...detalleRows]);
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Limpiezas");
    
    const dateLabel = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : "todos";
    XLSX.writeFile(wb, `reporte_limpieza_${dateLabel}.xlsx`);
}

export function ControlLimpiezaTab({ flights }: Props) {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    
    const filteredFlights = useMemo(() => filterFlightsByDate(flights, dateFrom, dateTo), [flights, dateFrom, dateTo]);
    const stats = useMemo(() => computeLimpiezaStats(filteredFlights), [filteredFlights]);
    const porMatricula = useMemo(() => computeLimpiezaPorMatricula(filteredFlights), [filteredFlights]);

    const handleDownloadExcel = () => {
        downloadLimpiezaExcel(filteredFlights, stats, porMatricula, dateFrom, dateTo);
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
                        <p className="text-sm text-slate-500">Análisis de limpiezas de tránsito programadas y no programadas</p>
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
                {/* Vuelos que requieren limpieza programada */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Requieren Limpieza</span>
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="text-3xl font-black text-amber-600">{stats.vuelosConWarning}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        Vuelos con bloque &gt; 3:30hs
                    </div>
                </div>

                {/* Cumplimiento de limpiezas programadas */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Cumplimiento</span>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className={`text-3xl font-black ${stats.pctCumplimientoProgramada >= 80 ? "text-emerald-600" : stats.pctCumplimientoProgramada >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                        {stats.pctCumplimientoProgramada.toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                        {stats.warningConLimpieza} de {stats.vuelosConWarning} programadas ejecutadas
                    </div>
                </div>

                {/* Limpiezas no programadas (por crew) */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">No Programadas</span>
                        <Plane className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-3xl font-black text-blue-600">{stats.limpiezasNoProgramadas}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        Requeridas por crew
                    </div>
                </div>

                {/* Total limpiezas ejecutadas */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-500 uppercase">Total Ejecutadas</span>
                        <BarChart3 className="w-5 h-5 text-violet-500" />
                    </div>
                    <div className="text-3xl font-black text-violet-600">{stats.totalLimpiezasEjecutadas}</div>
                    <div className="text-sm text-slate-500 mt-1">
                        Programadas + No programadas
                    </div>
                </div>
            </div>

            {/* Barra de distribución */}
            {stats.totalLimpiezasEjecutadas > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3">Distribución de Limpiezas Ejecutadas</h3>
                    <div className="h-8 rounded-lg overflow-hidden flex">
                        {stats.warningConLimpieza > 0 && (
                            <div 
                                className="bg-emerald-500 flex items-center justify-center text-white text-xs font-bold"
                                style={{ width: `${(stats.warningConLimpieza / stats.totalLimpiezasEjecutadas) * 100}%` }}
                                title={`Programadas: ${stats.warningConLimpieza}`}
                            >
                                {stats.warningConLimpieza}
                            </div>
                        )}
                        {stats.limpiezasNoProgramadas > 0 && (
                            <div 
                                className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold"
                                style={{ width: `${(stats.limpiezasNoProgramadas / stats.totalLimpiezasEjecutadas) * 100}%` }}
                                title={`Por Crew: ${stats.limpiezasNoProgramadas}`}
                            >
                                {stats.limpiezasNoProgramadas}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-emerald-500"></div>
                            <span className="text-slate-600">Programadas (bloque &gt; 3:30hs)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-blue-500"></div>
                            <span className="text-slate-600">No programadas (por crew)</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabla por Matrícula */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-bold text-slate-800">Limpiezas Ejecutadas por Matrícula</h3>
                    <p className="text-sm text-slate-500 mt-1">Solo matrículas con al menos una limpieza ejecutada</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 text-left">Matrícula</th>
                                <th className="px-4 py-3 text-center">Total Vuelos</th>
                                <th className="px-4 py-3 text-center">Limpiezas</th>
                                <th className="px-4 py-3 text-center">Programadas</th>
                                <th className="px-4 py-3 text-center">Por Crew</th>
                                <th className="px-4 py-3 text-center">% del Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {porMatricula.map((row) => (
                                <tr key={row.reg} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-bold text-slate-800">{row.reg}</td>
                                    <td className="px-4 py-3 text-center text-slate-600">{row.totalVuelos}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-violet-100 text-violet-700 font-bold">
                                            {row.limpiezasEjecutadas}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 font-bold">
                                            {row.programadas}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-1 rounded-md bg-blue-100 text-blue-700 font-bold">
                                            {row.porCrew}
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
                                        No hay limpiezas ejecutadas en el período seleccionado
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
