import { useMemo, useState } from "react";
import type { Flight } from "../types";
import {
    COST_CONTROLLING_CATEGORIES,
    computeCostControllingRows,
    currentYearMonth,
    flightsInMonth,
    formatCostAmount,
    formatCostMonthLabel,
    formatCostWeekTitle,
    formatUnitRate,
    getCostWeekPeriods,
    getCurrentCostWeekId,
    parseYearMonth,
    type CostWeekId,
} from "../lib/costControllingHelpers";
import { CalendarDays, Calculator } from "lucide-react";

interface Props {
    flights: Flight[];
}

export function CostControllingView({ flights }: Props) {
    const [monthValue, setMonthValue] = useState(currentYearMonth);
    const parsed = parseYearMonth(monthValue);
    const year = parsed?.year ?? new Date().getFullYear();
    const month = parsed?.month ?? new Date().getMonth() + 1;

    const weeks = useMemo(() => getCostWeekPeriods(year, month), [year, month]);
    const defaultWeek =
        monthValue === currentYearMonth() ? getCurrentCostWeekId() : ("w1" as CostWeekId);
    const [selectedWeekId, setSelectedWeekId] = useState<CostWeekId>(defaultWeek);

    const activeWeek = weeks.find((w) => w.id === selectedWeekId) ?? weeks[0];
    const monthFlights = useMemo(() => flightsInMonth(flights, year, month), [flights, year, month]);

    const rows = useMemo(
        () => (activeWeek ? computeCostControllingRows(monthFlights, year, month, activeWeek) : []),
        [monthFlights, year, month, activeWeek],
    );

    const weekTotalPasadasSobreAla = useMemo(
        () =>
            rows.reduce((sum, row) => {
                const v = row.costs.pasadasSobreAla;
                return sum + (v != null && Number.isFinite(v) ? v : 0);
            }, 0),
        [rows],
    );

    const servicedRows = rows.filter((r) => r.provider != null);

    return (
        <div className="space-y-5 animate-in fade-in duration-200 pb-12">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-wrap items-start gap-3 min-w-0">
                    <Calculator className="w-8 h-8 text-emerald-600 shrink-0" aria-hidden />
                    <div>
                        <p className="text-lg font-black uppercase tracking-wide text-slate-900">
                            Cost controlling
                        </p>
                        <p className="text-sm font-semibold text-slate-600 max-w-3xl">
                            Semanas fijas del mes.{" "}
                            <span className="font-black text-slate-800">Pasada</span> = vuelo operado con salida
                            desde el aeropuerto.{" "}
                            <span className="font-black text-slate-800">Swissport</span> (AEP/EZE): tarifa mensual por
                            tramo de pasadas acumuladas.{" "}
                            <span className="font-black text-slate-800">FlySeg</span>: tarifa semanal por tramo.
                            Adicionales y bajo ala: pendientes.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shrink-0">
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600">
                        <CalendarDays className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />
                        Mes
                    </label>
                    <input
                        type="month"
                        value={monthValue}
                        onChange={(e) => {
                            setMonthValue(e.target.value);
                            setSelectedWeekId("w1");
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-black text-slate-800">{formatCostMonthLabel(year, month)}</span>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {weeks.map((week) => (
                    <button
                        key={week.id}
                        type="button"
                        onClick={() => setSelectedWeekId(week.id)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            selectedWeekId === week.id
                                ? "bg-emerald-600 text-white shadow-md"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                        Semana {week.id.slice(1)} · {week.label}
                    </button>
                ))}
            </div>

            {activeWeek && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
                    <span>
                        Período:{" "}
                        <span className="font-black text-slate-900">
                            {formatCostWeekTitle(activeWeek, year, month)}
                        </span>
                    </span>
                    <span>
                        Total pasadas sobre ala (semana):{" "}
                        <span className="font-black text-emerald-700 tabular-nums">
                            {formatCostAmount(weekTotalPasadasSobreAla)}
                        </span>
                    </span>
                </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm min-w-[960px]">
                    <thead className="bg-slate-100 text-left">
                        <tr className="text-xs font-black uppercase tracking-wider text-slate-600">
                            <th className="px-3 py-3 whitespace-nowrap">Aeropuerto</th>
                            <th className="px-3 py-3 whitespace-nowrap">Proveedor</th>
                            <th className="px-3 py-3 whitespace-nowrap text-right">Pasadas</th>
                            <th className="px-3 py-3 whitespace-nowrap text-right">Tarifa / pasada</th>
                            {COST_CONTROLLING_CATEGORIES.map((cat) => (
                                <th key={cat.id} className="px-3 py-3 whitespace-nowrap text-right">
                                    {cat.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => {
                            const hasProvider = row.provider != null;
                            const dim = hasProvider ? "" : "opacity-50";
                            return (
                                <tr key={row.airport} className={`hover:bg-slate-50/80 ${dim}`}>
                                    <td className="px-3 py-3 font-mono font-black text-slate-900">{row.airport}</td>
                                    <td className="px-3 py-3 font-semibold text-slate-700">{row.providerLabel}</td>
                                    <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-800">
                                        {row.weekPasadas}
                                        {row.provider === "swissport" && row.weekPasadas > 0 ? (
                                            <span className="block text-[10px] font-semibold text-slate-500">
                                                mes acum. {row.monthPasadasForTier}
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600 tabular-nums">
                                        {formatUnitRate(row.unitRatePasadasSobreAla)}
                                    </td>
                                    {COST_CONTROLLING_CATEGORIES.map((cat) => (
                                        <td
                                            key={cat.id}
                                            className="px-3 py-3 text-right tabular-nums font-semibold text-slate-700"
                                        >
                                            {formatCostAmount(row.costs[cat.id])}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-xs font-semibold text-slate-500">
                {servicedRows.length} estaciones con proveedor sobre ala · {rows.length} aeropuertos argentinos en
                tabla · adicionales sobre/bajo ala pendientes de carga.
            </p>
        </div>
    );
}
