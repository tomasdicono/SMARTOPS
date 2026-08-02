import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { flightDateToIso } from "../lib/controlHelpers";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { X, Download } from "lucide-react";
import { utils, writeFile } from "xlsx";

interface Props {
    flights: Flight[];
}

const TARGET_CODES = [
    "2", "3", "6", "11", "12", "14", "15", "18", "19", "31", 
    "33", "34", "35", "36", "38", "39", "55", "85", "86", "87"
];

const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function ControlDashboardAjsTab({ flights }: Props) {
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedCell, setSelectedCell] = useState<{ dep: string, year: number, month: number, code: string } | null>(null);

    // Filter valid flights
    const validFlights = useMemo(() => flights.filter(f => !f.cancelled && f.mvtData), [flights]);

    // Get available years
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        validFlights.forEach(f => {
            const iso = flightDateToIso(f);
            if (iso) {
                const y = parseInt(iso.substring(0, 4), 10);
                if (!isNaN(y)) years.add(y);
            }
        });
        const currentY = new Date().getFullYear();
        years.add(currentY);
        return Array.from(years).sort((a, b) => b - a);
    }, [validFlights]);

    // Calculate stats per year to easily compare with previous months/years
    const allStats = useMemo(() => {
        // data[year][airport][monthIndex][code] = count
        const data: Record<number, Record<string, Record<number, Record<string, number>>>> = {};

        validFlights.forEach(f => {
            const iso = flightDateToIso(f);
            if (!iso) return;
            const year = parseInt(iso.substring(0, 4), 10);
            const month = parseInt(iso.substring(5, 7), 10) - 1; // 0-11
            const dep = f.dep;
            
            // Format codes robustly
            const c1Raw = f.mvtData?.dlyCod1?.trim();
            const c2Raw = f.mvtData?.dlyCod2?.trim();
            const c1 = c1Raw ? parseInt(c1Raw, 10).toString() : null;
            const c2 = c2Raw ? parseInt(c2Raw, 10).toString() : null;

            const hasC1 = c1 && TARGET_CODES.includes(c1);
            const hasC2 = c2 && TARGET_CODES.includes(c2);

            if (!hasC1 && !hasC2) return; // Skip flights without target delay codes

            if (!data[year]) data[year] = {};
            if (!data[year][dep]) data[year][dep] = {};
            if (!data[year][dep][month]) {
                data[year][dep][month] = {};
                TARGET_CODES.forEach(c => { data[year][dep][month][c] = 0; });
            }

            if (hasC1) {
                data[year][dep][month][c1] = (data[year][dep][month][c1] || 0) + 1;
            }
            if (hasC2) {
                data[year][dep][month][c2] = (data[year][dep][month][c2] || 0) + 1;
            }
        });

        return data;
    }, [validFlights]);

    const airports = useMemo(() => {
        const yearData = allStats[selectedYear] || {};
        return Object.keys(yearData).sort();
    }, [allStats, selectedYear]);
    
    const monthsToShow = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    const modalFlights = useMemo(() => {
        if (!selectedCell) return [];
        return validFlights.filter(f => {
            const iso = flightDateToIso(f);
            if (!iso) return false;
            const y = parseInt(iso.substring(0, 4), 10);
            const m = parseInt(iso.substring(5, 7), 10) - 1;
            if (y !== selectedCell.year || m !== selectedCell.month || f.dep !== selectedCell.dep) return false;

            const c1Raw = f.mvtData?.dlyCod1?.trim();
            const c2Raw = f.mvtData?.dlyCod2?.trim();
            const c1 = c1Raw ? parseInt(c1Raw, 10).toString() : null;
            const c2 = c2Raw ? parseInt(c2Raw, 10).toString() : null;
            return c1 === selectedCell.code || c2 === selectedCell.code;
        }).sort((a,b) => {
            const dateA = flightDateToIso(a);
            const dateB = flightDateToIso(b);
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return a.std.localeCompare(b.std);
        });
    }, [validFlights, selectedCell]);

    const getCount = (year: number, dep: string, month: number, code: string) => {
        return allStats[year]?.[dep]?.[month]?.[code] || 0;
    };

    const handleDownloadExcel = () => {
        const wb = utils.book_new();
        
        // 1. Matrix Sheet
        const aoa: any[][] = [];
        
        // Header Row 1: Months
        const row1 = ["Aeropuerto"];
        monthsToShow.forEach(m => {
            row1.push(MONTH_NAMES[m]);
            for (let i = 1; i < TARGET_CODES.length; i++) row1.push("");
        });
        aoa.push(row1);
        
        // Header Row 2: Codes
        const row2 = [""];
        monthsToShow.forEach(() => {
            TARGET_CODES.forEach(c => row2.push(c));
        });
        aoa.push(row2);
        
        // Data Rows
        airports.forEach(dep => {
            const row: any[] = [dep];
            monthsToShow.forEach(m => {
                TARGET_CODES.forEach(c => {
                    row.push(getCount(selectedYear, dep, m, c));
                });
            });
            aoa.push(row);
        });

        const wsMatrix = utils.aoa_to_sheet(aoa);
        
        // Merges for Months row
        wsMatrix['!merges'] = [];
        let colIndex = 1;
        monthsToShow.forEach(() => {
            wsMatrix['!merges']!.push({
                s: { r: 0, c: colIndex },
                e: { r: 0, c: colIndex + TARGET_CODES.length - 1 }
            });
            colIndex += TARGET_CODES.length;
        });

        utils.book_append_sheet(wb, wsMatrix, `Dashboard ${selectedYear}`);
        
        // 2. Details Sheet (Todos los vuelos demorados del año que coincidan con TARGET_CODES)
        const detailsData = validFlights.filter(f => {
            const iso = flightDateToIso(f);
            if (!iso) return false;
            const y = parseInt(iso.substring(0, 4), 10);
            if (y !== selectedYear) return false;
            
            const c1Raw = f.mvtData?.dlyCod1?.trim();
            const c2Raw = f.mvtData?.dlyCod2?.trim();
            const c1 = c1Raw ? parseInt(c1Raw, 10).toString() : null;
            const c2 = c2Raw ? parseInt(c2Raw, 10).toString() : null;
            
            return (c1 && TARGET_CODES.includes(c1)) || (c2 && TARGET_CODES.includes(c2));
        }).map(f => {
            const c1Raw = f.mvtData?.dlyCod1?.trim();
            const c2Raw = f.mvtData?.dlyCod2?.trim();
            const c1 = c1Raw ? parseInt(c1Raw, 10).toString() : null;
            const c2 = c2Raw ? parseInt(c2Raw, 10).toString() : null;
            
            return {
                Fecha: flightDateToIso(f),
                Vuelo: `${getAirlinePrefix(f.flt)}${f.flt}`,
                Ruta: `${f.dep}-${f.arr}`,
                Aeropuerto: f.dep,
                STD: f.std,
                "Código 1": c1 || "",
                "Minutos 1": f.mvtData?.dlyTime1 || "",
                "Código 2": c2 || "",
                "Minutos 2": f.mvtData?.dlyTime2 || "",
                "MVT Obs": f.mvtData?.observaciones || "",
                "Reporte Obs": f.dailyReportObs || ""
            };
        }).sort((a,b) => a.Fecha.localeCompare(b.Fecha) || a.STD.localeCompare(b.STD));

        const wsDetails = utils.json_to_sheet(detailsData);
        utils.book_append_sheet(wb, wsDetails, `Detalle Vuelos ${selectedYear}`);

        writeFile(wb, `AJS_Demoras_${selectedYear}.xlsx`);
    };

    const handleDownloadModalExcel = () => {
        if (!selectedCell || modalFlights.length === 0) return;
        
        const wb = utils.book_new();
        const detailsData = modalFlights.map(f => {
            const dly1 = f.mvtData?.dlyCod1 ? `COD ${f.mvtData.dlyCod1} (${f.mvtData.dlyTime1 || 0}m)` : "";
            const dly2 = f.mvtData?.dlyCod2 ? `COD ${f.mvtData.dlyCod2} (${f.mvtData.dlyTime2 || 0}m)` : "";
            const demoras = [dly1, dly2].filter(Boolean).join(" | ");

            return {
                Fecha: flightDateToIso(f),
                Vuelo: `${getAirlinePrefix(f.flt)}${f.flt}`,
                Ruta: `${f.dep}-${f.arr}`,
                STD: f.std,
                Demoras: demoras,
                Comentario: f.dailyReportObs || ""
            };
        });

        const wsDetails = utils.json_to_sheet(detailsData);
        utils.book_append_sheet(wb, wsDetails, `Detalle ${selectedCell.dep} - Cod ${selectedCell.code}`);

        const monthName = MONTH_NAMES[selectedCell.month];
        writeFile(wb, `Demoras_${selectedCell.dep}_${monthName}_${selectedCell.year}_Cod${selectedCell.code}.xlsx`);
    };

    return (
        <div className="animate-in fade-in duration-200">
            <div className="p-5 space-y-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-bold text-slate-700">Año:</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                            className="rounded-lg border-slate-300 shadow-sm text-sm"
                        >
                            {availableYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleDownloadExcel}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black uppercase tracking-wide rounded-xl shadow-md transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Descargar Excel
                    </button>
                </div>
            </div>

            <div className="p-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white relative">
                    <table className="w-full text-sm text-center">
                        <thead>
                            {/* Months Header Row */}
                            <tr className="bg-slate-800 text-white">
                                <th className="px-4 py-3 border-r border-slate-700 font-black uppercase tracking-wider text-left bg-slate-900 z-10 sticky left-0" rowSpan={2}>
                                    Aeropuerto
                                </th>
                                {monthsToShow.map(m => (
                                    <th key={m} className="px-2 py-2 border-r border-slate-700 font-bold uppercase tracking-wider" colSpan={TARGET_CODES.length}>
                                        {MONTH_NAMES[m]}
                                    </th>
                                ))}
                            </tr>
                            {/* Codes Header Row */}
                            <tr className="bg-slate-100 text-slate-700 text-xs font-black">
                                {monthsToShow.map(m => (
                                    TARGET_CODES.map(c => (
                                        <th key={`${m}-${c}`} className="px-2 py-1.5 border-r border-b border-slate-200 min-w-[36px]">
                                            {c}
                                        </th>
                                    ))
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {airports.length === 0 ? (
                                <tr>
                                    <td colSpan={1 + TARGET_CODES.length * 12} className="py-8 text-slate-500 font-medium">
                                        No hay datos de vuelos con demoras para este año.
                                    </td>
                                </tr>
                            ) : (
                                airports.map((dep) => (
                                    <tr key={dep} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-4 py-2 border-r border-slate-200 font-black text-slate-900 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0]">
                                            {dep}
                                        </td>
                                        {monthsToShow.map(m => (
                                            TARGET_CODES.map((c, i) => {
                                                const currentCount = getCount(selectedYear, dep, m, c);
                                                
                                                let prevCount = 0;
                                                if (m === 0) {
                                                    prevCount = getCount(selectedYear - 1, dep, 11, c);
                                                } else {
                                                    prevCount = getCount(selectedYear, dep, m - 1, c);
                                                }

                                                let colorClass = "text-slate-400 font-normal";
                                                if (currentCount > 0) {
                                                    if (currentCount > prevCount) {
                                                        colorClass = "bg-red-100 text-red-900 font-bold hover:bg-red-200 cursor-pointer";
                                                    } else if (currentCount < prevCount) {
                                                        colorClass = "bg-green-100 text-green-900 font-bold hover:bg-green-200 cursor-pointer";
                                                    } else {
                                                        colorClass = "bg-yellow-100 text-yellow-900 font-bold hover:bg-yellow-200 cursor-pointer";
                                                    }
                                                }
                                                
                                                const isLastCode = i === TARGET_CODES.length - 1;
                                                return (
                                                    <td 
                                                        key={`${dep}-${m}-${c}`} 
                                                        onClick={() => {
                                                            if (currentCount > 0) {
                                                                setSelectedCell({ dep, year: selectedYear, month: m, code: c });
                                                            }
                                                        }}
                                                        className={`px-2 py-1.5 transition-colors ${isLastCode ? 'border-r border-slate-300' : 'border-r border-slate-100'} ${colorClass}`}
                                                    >
                                                        {currentCount > 0 ? currentCount : '-'}
                                                    </td>
                                                );
                                            })
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Detalle */}
            {selectedCell && (
                <div className="fixed inset-0 bg-slate-900/50 z-[999] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="font-black text-slate-900 text-lg uppercase tracking-wide">Detalle de Demoras</h3>
                                <p className="text-sm font-semibold text-slate-500 mt-1">
                                    <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold mr-2">{selectedCell.dep}</span>
                                    {MONTH_NAMES[selectedCell.month]} {selectedCell.year} · Código <span className="text-red-700 font-black">{selectedCell.code}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadModalExcel}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-black uppercase tracking-wide rounded-lg transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Descargar Excel
                                </button>
                                <button onClick={() => setSelectedCell(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="overflow-y-auto p-4 bg-slate-50/50">
                            {modalFlights.length === 0 ? (
                                <p className="text-center text-slate-500 py-4 font-semibold">No hay vuelos registrados para esta selección.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200/50">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-100 text-left text-[11px] font-black uppercase text-slate-600 tracking-wider">
                                                <th className="px-4 py-2.5 border-b border-slate-200">Fecha</th>
                                                <th className="px-4 py-2.5 border-b border-slate-200">Vuelo</th>
                                                <th className="px-4 py-2.5 border-b border-slate-200">Ruta</th>
                                                <th className="px-4 py-2.5 border-b border-slate-200">STD</th>
                                                <th className="px-4 py-2.5 border-b border-slate-200">Demoras</th>
                                                <th className="px-4 py-2.5 border-b border-slate-200">Comentarios</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {modalFlights.map(f => {
                                                const isoDate = flightDateToIso(f);
                                                const hasDly1 = !!f.mvtData?.dlyCod1;
                                                const hasDly2 = !!f.mvtData?.dlyCod2;

                                                return (
                                                    <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="px-4 py-2 text-slate-700 font-medium tabular-nums">{isoDate}</td>
                                                        <td className="px-4 py-2 font-black text-slate-900">{getAirlinePrefix(f.flt)}{f.flt}</td>
                                                        <td className="px-4 py-2 font-semibold text-slate-700">{f.dep}-{f.arr}</td>
                                                        <td className="px-4 py-2 font-mono font-medium text-slate-600">{f.std}</td>
                                                        <td className="px-4 py-2 whitespace-nowrap">
                                                            {hasDly1 && (
                                                                <div className="font-bold text-red-700">
                                                                    COD {f.mvtData?.dlyCod1} <span className="text-slate-500 font-medium">({f.mvtData?.dlyTime1}m)</span>
                                                                </div>
                                                            )}
                                                            {hasDly2 && (
                                                                <div className="font-bold text-red-700 mt-0.5">
                                                                    COD {f.mvtData?.dlyCod2} <span className="text-slate-500 font-medium">({f.mvtData?.dlyTime2}m)</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-slate-600 text-xs max-w-[300px]">
                                                            {f.dailyReportObs ? (
                                                                <span>{f.dailyReportObs}</span>
                                                            ) : (
                                                                <span className="text-slate-400 italic">Sin comentario</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
