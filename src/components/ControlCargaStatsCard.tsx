import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { computeTopAvgCargaGroups, getTotalCargaKg } from "../lib/controlHelpers";
import { ChevronDown, Weight } from "lucide-react";

interface Props {
    flights: Flight[];
    selectedAirports: string[];
}

function formatAvgKg(n: number): string {
    return Math.round(n).toLocaleString("es-AR");
}

export function ControlCargaStatsCard({ flights, selectedAirports }: Props) {
    const [expanded, setExpanded] = useState(false);
    const totalCargaKg = useMemo(() => flights.reduce((s, f) => s + getTotalCargaKg(f), 0), [flights]);
    const { mode, rows } = useMemo(
        () => computeTopAvgCargaGroups(flights, selectedAirports, 5),
        [flights, selectedAirports],
    );

    const groupLabel = mode === "routes" ? "Ruta" : "Destino";
    const panelTitle =
        mode === "routes"
            ? "Top 5 — mayor promedio de carga por ruta"
            : "Top 5 — mayor promedio de carga por destino";
    const hint =
        mode === "routes"
            ? "Clic para ver top 5 promedio de carga por ruta"
            : "Clic para ver top 5 promedio de carga por destino";

    return (
        <div
            className={`rounded-xl border border-slate-200 bg-gradient-to-br from-amber-50/60 to-white overflow-hidden ${
                expanded ? "sm:col-span-2 lg:col-span-3" : ""
            }`}
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="w-full p-4 text-left hover:bg-amber-50/50 transition-colors"
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                            <Weight className="w-3.5 h-3.5" /> Total carga (kg)
                        </p>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                            Suma de TOTAL CARGA (MVT) en el filtro
                        </p>
                        <p className="text-3xl font-black text-amber-950 mt-2 tabular-nums">
                            {totalCargaKg.toLocaleString("es-AR")}
                        </p>
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
                                        <th className="px-3 py-2 text-right">Promedio (kg)</th>
                                        <th className="px-3 py-2 text-right">Vuelos</th>
                                        <th className="px-3 py-2 text-right">Total (kg)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => (
                                        <tr key={row.label} className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-500 font-bold tabular-nums">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2 font-bold whitespace-nowrap">{row.label}</td>
                                            <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-amber-950">
                                                {formatAvgKg(row.avgValue)}
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
