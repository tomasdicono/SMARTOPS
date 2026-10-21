import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { isTrasladoFlight, getAirlinePrefix } from "../lib/flightHelpers";
import { flightDateToIso } from "../lib/controlHelpers";
import { Sparkles, CheckCircle2, Plane, BarChart3, Download, Calendar } from "lucide-react";
import * as XLSX from "xlsx";

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

function computeLimpiezaStats(flights: Flight[]): LimpiezaStats {
    // Misma lógica que statsReport.ts
    const nonTrasladoOperational = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    
    const limpiezaTotal = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si").length;
    const limpiezaRequeridas = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si" && f.hitosData?.limpiezaTipo === "crew").length;
    const limpiezaPlanificadas = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si" && f.hitosData?.limpiezaTipo === "planificada").length;

    const totalVuelos = nonTrasladoOperational.length;

    return {
        totalVuelos,
        limpiezaTotal,
        limpiezaRequeridas,
        limpiezaPlanificadas,
        pctConLimpieza: totalVuelos > 0 ? (limpiezaTotal / totalVuelos) * 100 : 0,
        pctRequeridas: limpiezaTotal > 0 ? (limpiezaRequeridas / limpiezaTotal) * 100 : 0,
        pctPlanificadas: limpiezaTotal > 0 ? (limpiezaPlanificadas / limpiezaTotal) * 100 : 0,
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
        ["Total de vuelos operativos (excl. traslados)", stats.totalVuelos],
        [""],
        ["SERVICIOS DE LIMPIEZA"],
        ["Limpiezas Totales Realizadas", stats.limpiezaTotal],
        ["% de vuelos con limpieza", `${stats.pctConLimpieza.toFixed(1)}%`],
        [""],
        ["DESGLOSE"],
        ["A Requerimiento (Tripulación)", stats.limpiezaRequeridas, `${stats.pctRequeridas.toFixed(1)}%`],
        ["Programadas (Planificadas/itinerario)", stats.limpiezaPlanificadas, `${stats.pctPlanificadas.toFixed(1)}%`],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    
    // Hoja 2: Por Matrícula
    const matriculaHeaders = ["Matrícula", "Total Vuelos", "Limpiezas Realizadas", "A Requerimiento", "Programadas", "% Limpieza"];
    const matriculaRows = porMatricula.map(r => [
        r.reg,
        r.totalVuelos,
        r.limpiezasEjecutadas,
        r.requeridas,
        r.planificadas,
        `${r.pctLimpieza.toFixed(1)}%`
    ]);
    const wsMatricula = XLSX.utils.aoa_to_sheet([matriculaHeaders, ...matriculaRows]);
    XLSX.utils.book_append_sheet(wb, wsMatricula, "Por Matrícula");
    
    // Hoja 3: Detalle de vuelos con limpieza
    const nonTrasladoOperational = flights.filter(f => !isTrasladoFlight(f) && !f.cancelled);
    const flightsConLimpieza = nonTrasladoOperational.filter(f => f.hitosData?.limpiezaStatus === "si");
    
    const detalleHeaders = ["Fecha", "Vuelo", "Matrícula", "Origen", "Destino", "STD", "Tipo Limpieza"];
    const detalleRows = flightsConLimpieza.map(f => {
        const tipo = f.hitosData?.limpiezaTipo === "crew" ? "A Requerimiento (Tripulación)" : 
                     f.hitosData?.limpiezaTipo === "planificada" ? "Programada" : "-";
        return [
            flightDateToIso(f) || "",
            `${getAirlinePrefix(f.flt)}${f.flt}`,
            f.reg || "",
            f.dep || "",
            f.arr || "",
            f.std || "",
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
