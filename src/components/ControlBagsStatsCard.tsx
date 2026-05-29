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
                    <p className="text-[10px] font-bold uppercase text-slate-500 mt-3 mb-2">{panelTitle}</p>
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
            )}
        </div>
    );
}
