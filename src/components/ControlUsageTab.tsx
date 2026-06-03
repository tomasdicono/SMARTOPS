import { useEffect, useMemo, useState } from "react";
import type { Flight } from "../types";
import {
    computeUsageControlByBase,
    countDaysInclusiveIso,
    flightDateToIso,
    normalizeIsoDateRange,
    uniqueAirportsFromFlights,
    type StatsAirportFilter,
    type UsageControlBaseRow,
} from "../lib/controlHelpers";
import { ControlAirportMultiSelect } from "./ControlAirportMultiSelect";
import { Gauge, Percent } from "lucide-react";

interface Props {
    flights: Flight[];
    selectedDate: string;
    selectedAirports: string[];
    onAirportsChange: (airports: string[]) => void;
    airportOptions: string[];
}

function formatPct(v: number | null): string {
    return v != null ? `${v.toFixed(1)}%` : "—";
}

function UsageCell({ count, pct }: { count: number; pct: number | null }) {
    return (
        <td className="px-3 py-2 text-right tabular-nums">
            <span className="font-black text-slate-900">{count}</span>
            <span className="text-slate-500 font-semibold ml-1.5">({formatPct(pct)})</span>
        </td>
    );
}

function UsageTableRow({ row, isTotal }: { row: UsageControlBaseRow; isTotal?: boolean }) {
    return (
        <tr className={isTotal ? "bg-teal-50/80 font-semibold" : "hover:bg-slate-50/80"}>
            <td className="px-3 py-2 font-black text-slate-900 whitespace-nowrap" title="Escala de salida (dep)">
                {row.base}
            </td>
            <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800">{row.totalFlights}</td>
            <td className="px-3 py-2 text-right tabular-nums">
                <span className="font-black text-cyan-900">{row.mvtSentCount}</span>
                <span className="text-slate-500 font-semibold ml-1.5">({formatPct(row.mvtUtilizationPct)})</span>
            </td>
            <UsageCell count={row.mvtOnlyCount} pct={row.mvtOnlyPct} />
            <UsageCell count={row.completeCount} pct={row.completePct} />
            <UsageCell count={row.incompleteCount} pct={row.incompletePct} />
        </tr>
    );
}

export function ControlUsageTab({
    flights,
    selectedDate,
    selectedAirports,
    onAirportsChange,
    airportOptions,
}: Props) {
    const [usageDateFrom, setUsageDateFrom] = useState(selectedDate);
    const [usageDateTo, setUsageDateTo] = useState(selectedDate);
    useEffect(() => {
        setUsageDateFrom(selectedDate);
        setUsageDateTo(selectedDate);
    }, [selectedDate]);

    const { dateFrom, dateTo } = useMemo(() => {
        const { lo, hi } = normalizeIsoDateRange(usageDateFrom, usageDateTo);
        return { dateFrom: lo, dateTo: hi };
    }, [usageDateFrom, usageDateTo]);

    const airportFilter: StatsAirportFilter = selectedAirports;

    const usageAirportOptions = useMemo(() => {
        if (!dateFrom || !dateTo) return airportOptions;
        const inRange = flights.filter((f) => {
            const iso = flightDateToIso(f);
            return iso >= dateFrom && iso <= dateTo;
        });
        const fromRange = uniqueAirportsFromFlights(inRange);
        return fromRange.length > 0 ? fromRange : airportOptions;
    }, [flights, dateFrom, dateTo, airportOptions]);

    const usageData = useMemo(
        () => computeUsageControlByBase(flights, dateFrom, dateTo, airportFilter, usageAirportOptions),
        [flights, dateFrom, dateTo, airportFilter, selectedAirports, usageAirportOptions],
    );

    const periodLabel = useMemo(() => {
        if (!dateFrom || !dateTo) return "";
        const d0 = new Date(`${dateFrom}T12:00:00`);
        const d1 = new Date(`${dateTo}T12:00:00`);
        const f0 = d0.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
        const f1 = d1.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
        const days = countDaysInclusiveIso(dateFrom, dateTo);
        if (dateFrom === dateTo) return f0;
        return `${f0} – ${f1} · ${days} día${days !== 1 ? "s" : ""}`;
    }, [dateFrom, dateTo]);

    return (
        <div className="animate-in fade-in duration-200">
            <div className="p-5 space-y-5">
                <div className="flex flex-wrap items-end gap-3 pb-1">
                    <div className="shrink-0">
                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Desde</label>
                        <input
                            type="date"
                            value={usageDateFrom}
                            onChange={(e) => setUsageDateFrom(e.target.value)}
                            max={usageDateTo || undefined}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                        />
                    </div>
                    <div className="shrink-0">
                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Hasta</label>
                        <input
                            type="date"
                            value={usageDateTo}
                            onChange={(e) => setUsageDateTo(e.target.value)}
                            min={usageDateFrom || undefined}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                        />
                    </div>
                    <ControlAirportMultiSelect
                        options={usageAirportOptions}
                        selected={selectedAirports}
                        onChange={onAirportsChange}
                        label="Aeropuertos"
                        emptyHint="Todas las escalas de salida"
                    />
                </div>

                <p className="text-[11px] text-slate-500 max-w-3xl leading-snug">
                    Utilización de la herramienta = MVT enviados ÷ vuelos operativos de cada escala (salida). Los
                    porcentajes de completitud se calculan sobre el mismo total de vuelos por fila.
                </p>
                {periodLabel ? (
                    <p className="text-xs font-semibold text-slate-600">
                        Período: <span className="font-black text-slate-800 tabular-nums">{periodLabel}</span>
                        {selectedAirports.length > 0 ? (
                            <>
                                {" "}
                                · Aeropuertos:{" "}
                                <span className="font-black text-slate-800">{selectedAirports.join(", ")}</span>
                            </>
                        ) : null}
                    </p>
                ) : null}

                <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-white p-4">
                    <p className="text-xs font-black uppercase text-teal-900 flex items-center gap-1.5">
                        <Gauge className="w-4 h-4" aria-hidden />
                        Utilización global MVT (filtro aplicado)
                    </p>
                    <p className="text-3xl font-black text-teal-950 mt-2 tabular-nums">
                        {formatPct(usageData.totals.mvtUtilizationPct)}
                    </p>
                    <p className="text-xs text-teal-800/90 mt-1 font-semibold">
                        {usageData.totals.mvtSentCount} MVT enviados de {usageData.totals.totalFlights} vuelo
                        {usageData.totals.totalFlights !== 1 ? "s" : ""} operativos en el período
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                        <Percent className="w-4 h-4 text-slate-600" aria-hidden />
                        <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">
                            Adopción por aeropuerto
                        </h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[720px]">
                            <thead>
                                <tr className="text-left text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 bg-slate-50/50">
                                    <th className="px-3 py-2">Aeropuerto</th>
                                    <th className="px-3 py-2 text-right">Vuelos</th>
                                    <th className="px-3 py-2 text-right">MVT enviados</th>
                                    <th className="px-3 py-2 text-right">MVT solo (hitos pend.)</th>
                                    <th className="px-3 py-2 text-right">Completos (MVT + hitos)</th>
                                    <th className="px-3 py-2 text-right">Sin completar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {usageData.rows.length === 0 && usageData.totals.totalFlights === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500 font-semibold">
                                            Sin vuelos en el período con los filtros elegidos.
                                        </td>
                                    </tr>
                                ) : (
                                    usageData.rows.map((row) => (
                                        <UsageTableRow key={row.base} row={row} />
                                    ))
                                )}
                                {usageData.totals.totalFlights > 0 ? (
                                    <UsageTableRow row={usageData.totals} isTotal />
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <p className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-100 leading-snug">
                        «MVT solo»: MVT enviado sin hitos validados. «Completos»: MVT enviado y hitos con guardado
                        validado. «Sin completar»: sin MVT enviado ni hitos validados (vuelos con solo hitos en borrador
                        no cuentan como completos ni como MVT).
                    </p>
                </div>
            </div>
        </div>
    );
}
