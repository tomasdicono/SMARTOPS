import { useEffect, useMemo, useState } from "react";
import type { Flight } from "../types";
import { getAirlinePrefix } from "../lib/flightHelpers";
import {
    buildGpuUsageFlightRows,
    computeAverageGpuUsageMinutes,
    countDaysInclusiveIso,
    filterFlightsForStats,
    flightDateToIso,
    flightTouchesInternationalGpuDestination,
    INTERNATIONAL_GPU_DESTINATIONS,
    normalizeIsoDateRange,
    uniqueAirportsFromFlights,
    type StatsAirportFilter,
} from "../lib/controlHelpers";
import { ControlAirportMultiSelect } from "./ControlAirportMultiSelect";
import { normalizeHitosData } from "../lib/flightDataNormalize";
import { formatMinutesToHHMM } from "../lib/mvtTime";
import { ChevronDown, Globe, ListOrdered, PlugZap } from "lucide-react";

interface Props {
    flights: Flight[];
    selectedDate: string;
    selectedAirports: string[];
    onAirportsChange: (airports: string[]) => void;
    airportOptions: string[];
}

function formatGpuHhmm(raw: string | undefined): string {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.length < 3) return "—";
    const p = digits.padStart(4, "0").slice(-4);
    return `${p.slice(0, 2)}:${p.slice(2, 4)}`;
}

function GpuFlightTable({
    rows,
    emptyMessage,
}: {
    rows: { flight: Flight; durationMinutes: number }[];
    emptyMessage: string;
}) {
    if (rows.length === 0) {
        return <p className="text-xs text-slate-500 py-3 px-1">{emptyMessage}</p>;
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm min-w-[640px]">
                <thead>
                    <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                        <th className="px-3 py-2 w-10">#</th>
                        <th className="px-3 py-2">Vuelo</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Ruta</th>
                        <th className="px-3 py-2">Inicio GPU</th>
                        <th className="px-3 py-2">Fin GPU</th>
                        <th className="px-3 py-2 text-right">Duración</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ flight, durationMinutes }, i) => {
                        const h = normalizeHitosData(flight.hitosData);
                        return (
                            <tr key={flight.id} className="border-t border-slate-100 hover:bg-amber-50/30">
                                <td className="px-3 py-2 text-slate-500 font-bold tabular-nums">{i + 1}</td>
                                <td className="px-3 py-2 font-bold whitespace-nowrap">
                                    {getAirlinePrefix(flight.flt)}
                                    {flight.flt}
                                </td>
                                <td className="px-3 py-2 tabular-nums text-slate-700 whitespace-nowrap">
                                    {flight.date || "—"}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap font-semibold">
                                    {flight.dep}-{flight.arr}
                                </td>
                                <td className="px-3 py-2 tabular-nums font-mono text-slate-800">
                                    {formatGpuHhmm(h.gpuStart)}
                                </td>
                                <td className="px-3 py-2 tabular-nums font-mono text-slate-800">
                                    {formatGpuHhmm(h.gpuEnd)}
                                </td>
                                <td className="px-3 py-2 text-right font-black tabular-nums text-amber-950">
                                    {formatMinutesToHHMM(durationMinutes)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function ControlGpuTab({
    flights,
    selectedDate,
    selectedAirports,
    onAirportsChange,
    airportOptions,
}: Props) {
    const [gpuDateFrom, setGpuDateFrom] = useState(selectedDate);
    const [gpuDateTo, setGpuDateTo] = useState(selectedDate);
    const [topGpuExpanded, setTopGpuExpanded] = useState(false);

    useEffect(() => {
        setGpuDateFrom(selectedDate);
        setGpuDateTo(selectedDate);
    }, [selectedDate]);

    const { dateFrom, dateTo } = useMemo(() => {
        const { lo, hi } = normalizeIsoDateRange(gpuDateFrom, gpuDateTo);
        return { dateFrom: lo, dateTo: hi };
    }, [gpuDateFrom, gpuDateTo]);

    const airportFilter: StatsAirportFilter = selectedAirports;

    const gpuAirportOptions = useMemo(() => {
        if (!dateFrom || !dateTo) return airportOptions;
        const inRange = flights.filter((f) => {
            const iso = flightDateToIso(f);
            return iso >= dateFrom && iso <= dateTo;
        });
        const fromRange = uniqueAirportsFromFlights(inRange);
        return fromRange.length > 0 ? fromRange : airportOptions;
    }, [flights, dateFrom, dateTo, airportOptions]);

    const gpuFlights = useMemo(() => {
        const inRange = filterFlightsForStats(flights, dateFrom, dateTo, airportFilter);
        return inRange.filter((f) => !f.cancelled);
    }, [flights, dateFrom, dateTo, airportFilter, selectedAirports]);

    const avgGpu = useMemo(() => computeAverageGpuUsageMinutes(gpuFlights), [gpuFlights]);
    const topGpuRows = useMemo(() => buildGpuUsageFlightRows(gpuFlights), [gpuFlights]);
    const internationalGpuRows = useMemo(
        () => topGpuRows.filter(({ flight }) => flightTouchesInternationalGpuDestination(flight)),
        [topGpuRows],
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

    const intlDestLabel = INTERNATIONAL_GPU_DESTINATIONS.join(" / ");

    return (
        <div className="animate-in fade-in duration-200">
            <div className="p-5 space-y-6">
                <div className="flex flex-wrap items-end gap-3 pb-1">
                    <div className="shrink-0">
                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Desde</label>
                        <input
                            type="date"
                            value={gpuDateFrom}
                            onChange={(e) => setGpuDateFrom(e.target.value)}
                            max={gpuDateTo || undefined}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                        />
                    </div>
                    <div className="shrink-0">
                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Hasta</label>
                        <input
                            type="date"
                            value={gpuDateTo}
                            onChange={(e) => setGpuDateTo(e.target.value)}
                            min={gpuDateFrom || undefined}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                        />
                    </div>
                    <ControlAirportMultiSelect
                        options={gpuAirportOptions}
                        selected={selectedAirports}
                        onChange={onAirportsChange}
                        label="Aeropuertos"
                        emptyHint="Todos (salida o llegada)"
                    />
                </div>

                <p className="text-[11px] text-slate-500 max-w-3xl leading-snug -mt-2">
                    Duración GPU desde hitos operacionales (inicio → fin). Se excluyen vuelos marcados como «no se
                    utilizó GPU» y los sin horarios válidos.
                </p>
                {periodLabel ? (
                    <p className="text-xs font-semibold text-slate-600 -mt-2">
                        Período: <span className="font-black text-slate-800 tabular-nums">{periodLabel}</span>
                        {" · "}
                        <span className="font-black text-slate-800 tabular-nums">
                            {gpuFlights.length} vuelo{gpuFlights.length !== 1 ? "s" : ""} operativo
                            {gpuFlights.length !== 1 ? "s" : ""} en el filtro
                        </span>
                        {selectedAirports.length > 0 ? (
                            <>
                                {" "}
                                · Aeropuertos:{" "}
                                <span className="font-black text-slate-800">{selectedAirports.join(", ")}</span>
                            </>
                        ) : null}
                    </p>
                ) : null}

                <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-5">
                    <p className="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
                        <PlugZap className="w-4 h-4 shrink-0" aria-hidden />
                        Uso promedio GPU
                    </p>
                    <p className="text-[11px] text-amber-800/90 font-semibold mt-1">
                        Promedio de duración (inicio → fin) en el período
                    </p>
                    <p className="text-4xl font-black text-amber-950 mt-3 tabular-nums">
                        {avgGpu.avgMinutes != null
                            ? formatMinutesToHHMM(Math.round(avgGpu.avgMinutes))
                            : "—"}
                    </p>
                    <p className="text-xs text-amber-900/80 mt-2 font-semibold">
                        {avgGpu.countWithGpu > 0
                            ? `${avgGpu.countWithGpu} vuelo${avgGpu.countWithGpu !== 1 ? "s" : ""} con GPU informada`
                            : "Sin vuelos con inicio y fin GPU en el período"}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                    <button
                        type="button"
                        onClick={() => setTopGpuExpanded((v) => !v)}
                        aria-expanded={topGpuExpanded}
                        className="w-full px-4 py-3 text-left bg-slate-50/80 hover:bg-amber-50/50 transition-colors"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                                <ListOrdered className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                                <div>
                                    <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">
                                        Mayor utilización de GPU
                                    </h4>
                                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                        {topGpuExpanded
                                            ? "Vuelos ordenados por duración descendente"
                                            : topGpuRows.length > 0
                                              ? `Clic para ver ${topGpuRows.length} vuelo${topGpuRows.length !== 1 ? "s" : ""} con GPU`
                                              : "Clic para ver el listado (sin vuelos con GPU en el período)"}
                                    </p>
                                </div>
                            </div>
                            <ChevronDown
                                className={`w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform ${
                                    topGpuExpanded ? "rotate-180" : ""
                                }`}
                                aria-hidden
                            />
                        </div>
                    </button>
                    {topGpuExpanded && (
                        <div className="p-4 border-t border-slate-100 animate-in fade-in duration-200">
                            <GpuFlightTable
                                rows={topGpuRows}
                                emptyMessage="No hay vuelos con uso de GPU registrado en el período."
                            />
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-indigo-200 overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-slate-50/80 flex items-start gap-2">
                        <Globe className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" aria-hidden />
                        <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-slate-800">
                                Vuelos internacionales con uso de GPU
                            </h4>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                Ruta con destino internacional ({intlDestLabel})
                            </p>
                        </div>
                    </div>
                    <div className="p-4">
                        <GpuFlightTable
                            rows={internationalGpuRows}
                            emptyMessage={`No hay vuelos internacionales (${intlDestLabel}) con GPU informada en el período.`}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
