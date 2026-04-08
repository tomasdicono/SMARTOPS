import { useMemo, useEffect, useRef } from "react";
import type { Flight } from "../types";
import { getAirlinePrefix } from "../lib/flightHelpers";
import {
    filterDelayedFlightsForDate,
    totalDelayMinutes,
    formatDelayCell,
} from "../lib/dailyReportHelpers";
import { formatMinutesToHHMM, parseTimeToMinutes } from "../lib/mvtTime";
import { downloadDailyReportPdf } from "../lib/dailyReportPdf";
import { FileDown, CalendarDays } from "lucide-react";

interface Props {
    flights: Flight[];
    selectedDate: string;
    onDateChange: (iso: string) => void;
    onUpdateDailyReportObs: (flightId: string, text: string) => void;
    /** HCC y AJS editan observaciones (guardado en dailyReportObs) */
    canEditObs: boolean;
    /** Nombre del usuario para el PDF (encabezado Responsable). */
    reportUserName: string;
}

export function DailyReportView({
    flights,
    selectedDate,
    onDateChange,
    onUpdateDailyReportObs,
    canEditObs,
    reportUserName,
}: Props) {
    const rows = useMemo(() => filterDelayedFlightsForDate(flights, selectedDate), [flights, selectedDate]);

    const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        return () => {
            Object.values(obsTimers.current).forEach(clearTimeout);
        };
    }, []);

    const flushObs = (id: string, text: string) => {
        onUpdateDailyReportObs(id, text);
    };

    const scheduleObs = (id: string, text: string) => {
        if (obsTimers.current[id]) clearTimeout(obsTimers.current[id]);
        obsTimers.current[id] = setTimeout(() => {
            flushObs(id, text);
            delete obsTimers.current[id];
        }, 600);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-end justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div>
                    <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Fecha del reporte</label>
                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50">
                        <CalendarDays className="w-4 h-4 text-cyan-600 shrink-0" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => onDateChange(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-900 focus:outline-none [color-scheme:light]"
                        />
                    </div>
                </div>
                <button
                    type="button"
                    disabled={rows.length === 0}
                    onClick={() => void downloadDailyReportPdf(rows, selectedDate, { responsibleName: reportUserName })}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white shadow-md transition-colors"
                >
                    <FileDown className="w-4 h-4 shrink-0" />
                    Descargar PDF
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 py-16 text-center text-slate-600 font-semibold">
                    No hay vuelos con demoras cargadas (DLY TIME) para esta fecha.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-200/80">
                    <table className="w-full text-sm min-w-[1200px]">
                        <thead>
                            <tr className="bg-slate-100 text-left text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                                <th className="px-2 py-3 whitespace-nowrap">DLY TTL</th>
                                <th className="px-2 py-3 whitespace-nowrap">FLT Number</th>
                                <th className="px-2 py-3 whitespace-nowrap">STD</th>
                                <th className="px-2 py-3 whitespace-nowrap">ATD</th>
                                <th className="px-2 py-3 whitespace-nowrap">From</th>
                                <th className="px-2 py-3 whitespace-nowrap">To</th>
                                <th className="px-2 py-3 whitespace-nowrap">Reg</th>
                                <th className="px-2 py-3 whitespace-nowrap">Min</th>
                                <th className="px-2 py-3 whitespace-nowrap">1° Code</th>
                                <th className="px-2 py-3 whitespace-nowrap">Min</th>
                                <th className="px-2 py-3 whitespace-nowrap">2° Code</th>
                                <th className="px-2 py-3 min-w-[200px]">Observaciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((f) => {
                                const m = f.mvtData!;
                                const ttl = totalDelayMinutes(f);
                                const atdStr = m.atd ? formatMinutesToHHMM(parseTimeToMinutes(m.atd)) : "—";
                                return (
                                    <tr key={f.id} className="hover:bg-slate-50/80 align-top">
                                        <td className="px-2 py-2 font-mono font-bold text-amber-800 whitespace-nowrap">
                                            {formatMinutesToHHMM(ttl)}
                                        </td>
                                        <td className="px-2 py-2 font-black whitespace-nowrap">
                                            <span className="text-slate-500 font-bold">{getAirlinePrefix(f.flt)}</span>
                                            {f.flt}
                                        </td>
                                        <td className="px-2 py-2 font-mono tabular-nums">{f.std || "—"}</td>
                                        <td className="px-2 py-2 font-mono tabular-nums text-slate-900">{atdStr}</td>
                                        <td className="px-2 py-2 font-bold">{f.dep}</td>
                                        <td className="px-2 py-2 font-bold">{f.arr}</td>
                                        <td className="px-2 py-2 font-mono">{f.reg}</td>
                                        <td className="px-2 py-2 font-mono tabular-nums">{formatDelayCell(m.dlyTime1)}</td>
                                        <td className="px-2 py-2 font-bold text-slate-800">{m.dlyCod1 || "—"}</td>
                                        <td className="px-2 py-2 font-mono tabular-nums">{formatDelayCell(m.dlyTime2)}</td>
                                        <td className="px-2 py-2 font-bold text-slate-800">{m.dlyCod2 || "—"}</td>
                                        <td className="px-2 py-2 max-w-[280px]">
                                            {canEditObs ? (
                                                <textarea
                                                    key={f.id}
                                                    defaultValue={f.dailyReportObs || ""}
                                                    rows={2}
                                                    placeholder="Observaciones…"
                                                    onChange={(e) => scheduleObs(f.id, e.target.value)}
                                                    className="w-full min-w-[180px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 resize-y"
                                                />
                                            ) : (
                                                <span className="text-xs text-slate-600 whitespace-pre-wrap block">
                                                    {f.dailyReportObs?.trim() ? f.dailyReportObs : "—"}
                                                </span>
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
    );
}
