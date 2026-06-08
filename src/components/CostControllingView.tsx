import { useMemo, useState } from "react";
import {
    ARGENTINA_AIRPORTS,
    COST_CONTROLLING_CATEGORIES,
    currentYearMonth,
    formatCostAmount,
    formatCostMonthLabel,
    formatCostWeekTitle,
    getCostRatesForWeek,
    getCostWeekPeriods,
    getCurrentCostWeekId,
    parseYearMonth,
    type CostWeekId,
} from "../lib/costControllingHelpers";
import { CalendarDays, Calculator } from "lucide-react";

export function CostControllingView() {
    const [monthValue, setMonthValue] = useState(currentYearMonth);
    const parsed = parseYearMonth(monthValue);
    const year = parsed?.year ?? new Date().getFullYear();
    const month = parsed?.month ?? new Date().getMonth() + 1;

    const weeks = useMemo(() => getCostWeekPeriods(year, month), [year, month]);
    const defaultWeek =
        monthValue === currentYearMonth() ? getCurrentCostWeekId() : ("w1" as CostWeekId);
    const [selectedWeekId, setSelectedWeekId] = useState<CostWeekId>(defaultWeek);

    const activeWeek = weeks.find((w) => w.id === selectedWeekId) ?? weeks[0];
    const rates = useMemo(
        () => getCostRatesForWeek(year, month, activeWeek?.id ?? "w1"),
        [year, month, activeWeek?.id],
    );

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
                            Análisis por semanas fijas del mes:{" "}
                            <span className="font-black text-slate-800">01–07</span>,{" "}
                            <span className="font-black text-slate-800">08–15</span>,{" "}
                            <span className="font-black text-slate-800">16–22</span> y{" "}
                            <span className="font-black text-slate-800">23 a fin de mes</span>. Tres conceptos de
                            costo por aeropuerto argentino (tarifas pendientes de carga).
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
                <p className="text-sm font-semibold text-slate-600">
                    Período activo:{" "}
                    <span className="font-black text-slate-900">
                        {formatCostWeekTitle(activeWeek, year, month)}
                    </span>
                </p>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-slate-100 text-left">
                        <tr className="text-xs font-black uppercase tracking-wider text-slate-600">
                            <th className="px-4 py-3 whitespace-nowrap">Aeropuerto</th>
                            {COST_CONTROLLING_CATEGORIES.map((cat) => (
                                <th key={cat.id} className="px-4 py-3 whitespace-nowrap text-right">
                                    {cat.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {ARGENTINA_AIRPORTS.map((airport) => {
                            const row = rates[airport] ?? {};
                            return (
                                <tr key={airport} className="hover:bg-slate-50/80">
                                    <td className="px-4 py-3 font-mono font-black text-slate-900">{airport}</td>
                                    {COST_CONTROLLING_CATEGORIES.map((cat) => (
                                        <td
                                            key={cat.id}
                                            className="px-4 py-3 text-right tabular-nums font-semibold text-slate-500"
                                        >
                                            {formatCostAmount(row[cat.id] ?? null)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-xs font-semibold text-slate-500">
                {ARGENTINA_AIRPORTS.length} aeropuertos · {COST_CONTROLLING_CATEGORIES.length} conceptos por semana.
                Los importes se cargarán en la próxima iteración.
            </p>
        </div>
    );
}
