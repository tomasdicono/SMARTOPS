import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { computeTopAvgBagsGroups, getBags } from "../lib/controlHelpers";
import { ChevronDown, Luggage } from "lucide-react";

interface Props {
    flights: Flight[];
    selectedAirports: string[];
}

function formatAvgBags(n: number): string {
    return Math.round(n).toLocaleString("es-AR");
}

export function ControlBagsStatsCard({ flights, selectedAirports }: Props) {
    const [expanded, setExpanded] = useState(false);
    const totalBags = useMemo(() => flights.reduce((s, f) => s + getBags(f), 0), [flights]);
    const { mode, rows } = useMemo(
        () => computeTopAvgBagsGroups(flights, selectedAirports, 5),
        [flights, selectedAirports],
    );

    const groupLabel = mode === "routes" ? "Ruta" : "Destino";
    const panelTitle =
        mode === "routes"
            ? "Top 5 — mayor promedio de equipajes por ruta"
            : "Top 5 — mayor promedio de equipajes por destino";
    const hint =
        mode === "routes"
            ? "Clic para ver top 5 promedio de equipajes por ruta"
            : "Clic para ver top 5 promedio de equipajes por destino";

    const rankedStations = useMemo(() => {
        const map = new Map<string, {
            station: string;
            searchActivations: number;
            flightsWithDelay18: number;
            totalDelayMinutes18: number;
            totalFlights: number;
        }>();

        for (const f of flights) {
            const station = String(f.dep ?? "").trim().toUpperCase();
            if (!station) continue;

            const entry = map.get(station) ?? {
                station,
                searchActivations: 0,
                flightsWithDelay18: 0,
                totalDelayMinutes18: 0,
                totalFlights: 0,
            };

            // Hitos check
            const hitos = f.hitosData;
            const hasSearch = hitos?.entries &&
                typeof hitos.entries["Inicio búsqueda de equipaje"] === "string" &&
                hitos.entries["Inicio búsqueda de equipaje"].trim() !== "";

            if (hasSearch) {
                entry.searchActivations += 1;
            }

            // Delay COD 18 check (Baggage Processing)
            const m = f.mvtData;
            let dlyMins = 0;
            let hasDelay18 = false;
            if (m) {
                if (m.dlyCod1 === "18") {
                    dlyMins += parseInt(m.dlyTime1, 10) || 0;
                    hasDelay18 = true;
                }
                if (m.dlyCod2 === "18") {
                    dlyMins += parseInt(m.dlyTime2, 10) || 0;
                    hasDelay18 = true;
                }
            }

            if (hasDelay18) {
                entry.flightsWithDelay18 += 1;
                entry.totalDelayMinutes18 += dlyMins;
            }

            entry.totalFlights += 1;
            map.set(station, entry);
        }

        return [...map.values()]
            .map((e) => {
                const avgDelay = e.flightsWithDelay18 > 0 ? e.totalDelayMinutes18 / e.flightsWithDelay18 : 0;
                const delayShare = e.totalFlights > 0 ? (e.flightsWithDelay18 / e.totalFlights) * 100 : 0;
                return {
                    ...e,
                    avgDelay,
                    delayShare,
                };
            })
            .sort((a, b) => b.searchActivations - a.searchActivations || a.station.localeCompare(b.station));
    }, [flights]);

    return (
        <div
            className={`rounded-xl border border-slate-200 bg-gradient-to-br from-cyan-50/50 to-white overflow-hidden ${
                expanded ? "sm:col-span-2 lg:col-span-3" : ""
            }`}
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="w-full p-4 text-left hover:bg-cyan-50/40 transition-colors"
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                            <Luggage className="w-3.5 h-3.5" /> Bags despachadas
                        </p>
                        <p className="text-3xl font-black text-cyan-800 mt-2 tabular-nums">{totalBags}</p>
                        <p className="text-[11px] text-slate-500 font-semibold mt-1">{hint}</p>
                    </div>
                    <ChevronDown
                        className={`w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform ${
                            expanded ? "rotate-180" : ""
                        }`}
                        aria-hidden
                    />
                </div>
            </button>
            {expanded && (
                <div className="px-4 pb-4 border-t border-slate-100">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
                        {/* Columna Izquierda: Tabla Original */}
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">{panelTitle}</p>
                            {rows.length === 0 ? (
                                <p className="text-xs text-slate-500 py-2">
                                    Sin vuelos en el filtro para calcular promedios.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                                                <th className="px-3 py-2 w-10">#</th>
                                                <th className="px-3 py-2">{groupLabel}</th>
                                                <th className="px-3 py-2 text-right">Promedio</th>
                                                <th className="px-3 py-2 text-right">Vuelos</th>
                                                <th className="px-3 py-2 text-right">Total bags</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => (
                                                <tr key={row.label} className="border-t border-slate-100">
                                                    <td className="px-3 py-2 text-slate-500 font-bold tabular-nums">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-3 py-2 font-bold whitespace-nowrap">{row.label}</td>
                                                    <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-cyan-900">
                                                        {formatAvgBags(row.avgValue)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                        {row.flightCount}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-800">
                                                        {row.totalValue.toLocaleString("es-AR")}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Columna Derecha: Ranking Escalas */}
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">
                                Ranking Escalas — Búsquedas & Demoras COD 18 (Baggage Processing)
                            </p>
                            {rankedStations.length === 0 ? (
                                <p className="text-xs text-slate-500 py-2">
                                    Sin datos para calcular el ranking de escalas.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                                                <th className="px-3 py-2 w-10">#</th>
                                                <th className="px-3 py-2">Escala</th>
                                                <th className="px-3 py-2 text-right">Búsquedas</th>
                                                <th className="px-3 py-2 text-right">Vuelos DLY 18</th>
                                                <th className="px-3 py-2 text-right">Demora Prom.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rankedStations.map((row, idx) => (
                                                <tr key={row.station} className="border-t border-slate-100 hover:bg-slate-50/50">
                                                    <td className="px-3 py-2 text-slate-500 font-bold tabular-nums">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-3 py-2 font-bold whitespace-nowrap">{row.station}</td>
                                                    <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-cyan-800">
                                                        {row.searchActivations}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                        {row.flightsWithDelay18} <span className="text-[10px] text-slate-500">({row.delayShare.toFixed(1)}%)</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-800 font-bold">
                                                        {row.flightsWithDelay18 > 0 ? `${Math.round(row.avgDelay)} min` : "—"}
                                                    </td>
                                                </tr>
                                            ))}
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
