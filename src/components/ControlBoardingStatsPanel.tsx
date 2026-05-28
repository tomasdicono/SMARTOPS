import { useMemo, useState } from "react";
import type { Flight } from "../types";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { getAircraftInfo } from "../lib/fleetData";
import {
    computeBoardingCategoryStats,
    getPax,
    type BoardingStatsFilter,
    type BoardingCategoryStats,
} from "../lib/controlHelpers";
import { normalizeHitosData } from "../lib/flightDataNormalize";
import { formatMinutesToHHMM } from "../lib/mvtTime";
import type { PeaPosition } from "../types";
import { Building2, ChevronDown, Clock, MapPin, Plane } from "lucide-react";

function formatPeaLabel(pea: PeaPosition | undefined): string {
    if (pea === "manga") return "Manga";
    if (pea === "remota") return "Remota";
    return "—";
}

function formatOccupancyPct(flight: Flight): string {
    const ac = getAircraftInfo(flight.reg);
    const cap = ac?.capacity ?? 0;
    if (cap <= 0) return "—";
    const pax = getPax(flight);
    return `${((pax / cap) * 100).toFixed(1)}%`;
}

interface Props {
    flights: Flight[];
}

const CATEGORIES: {
    id: BoardingStatsFilter;
    label: string;
    hint: string;
    Icon: typeof Building2;
}[] = [
    {
        id: "manga",
        label: "Promedio embarque manga",
        hint: "Fin embarque − Inicio embarque · PEA Manga",
        Icon: Building2,
    },
    {
        id: "remota",
        label: "Promedio embarque remota",
        hint: "Fin embarque − Inicio embarque · PEA Remota",
        Icon: MapPin,
    },
    {
        id: "A320",
        label: "Promedio de embarque 320",
        hint: "Embarque en vuelos con equipo A320",
        Icon: Plane,
    },
    {
        id: "A321",
        label: "Promedio de embarque 321",
        hint: "Embarque en vuelos con equipo A321",
        Icon: Plane,
    },
];

function formatAvg(minutes: number | null): string {
    return minutes != null ? formatMinutesToHHMM(Math.round(minutes)) : "—";
}

function BoardingAboveAverageList({
    stats,
    filterLabel,
}: {
    stats: BoardingCategoryStats;
    filterLabel: string;
}) {
    if (stats.avgMinutes == null) {
        return (
            <p className="text-xs text-slate-500 py-2 px-1">
                Sin vuelos con inicio y fin de embarque en esta categoría.
            </p>
        );
    }
    if (stats.aboveAverage.length === 0) {
        return (
            <p className="text-xs text-slate-500 py-2 px-1">
                Ningún vuelo supera el promedio ({formatAvg(stats.avgMinutes)}) en {filterLabel}.
            </p>
        );
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-2">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                        <th className="px-3 py-2">Vuelo</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Ruta</th>
                        <th className="px-3 py-2 text-right">Embarque</th>
                        <th className="px-3 py-2 text-center">PEA</th>
                        <th className="px-3 py-2 text-right">Ocupación</th>
                        <th className="px-3 py-2 text-right">vs promedio</th>
                    </tr>
                </thead>
                <tbody>
                    {stats.aboveAverage.map(({ flight, durationMinutes }) => {
                        const over = durationMinutes - (stats.avgMinutes ?? 0);
                        const pea = formatPeaLabel(normalizeHitosData(flight.hitosData).peaPosition);
                        return (
                            <tr key={flight.id} className="border-t border-slate-100 bg-amber-50/40">
                                <td className="px-3 py-2 font-bold whitespace-nowrap">
                                    {getAirlinePrefix(flight.flt)}
                                    {flight.flt}
                                </td>
                                <td className="px-3 py-2 tabular-nums text-slate-700 whitespace-nowrap">
                                    {flight.date || "—"}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    {flight.dep}-{flight.arr}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                                    {formatMinutesToHHMM(Math.round(durationMinutes))}
                                </td>
                                <td className="px-3 py-2 text-center font-semibold text-slate-800 whitespace-nowrap">
                                    {pea}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                                    {formatOccupancyPct(flight)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-900 font-bold">
                                    +{formatMinutesToHHMM(Math.round(over))}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function ControlBoardingStatsPanel({ flights }: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<BoardingStatsFilter | null>(null);

    const overall = useMemo(() => computeBoardingCategoryStats(flights), [flights]);
    const byCategory = useMemo(() => {
        const map = {} as Record<BoardingStatsFilter, BoardingCategoryStats>;
        for (const c of CATEGORIES) {
            map[c.id] = computeBoardingCategoryStats(flights, c.id);
        }
        return map;
    }, [flights]);

    const toggleCategory = (id: BoardingStatsFilter) => {
        setActiveCategory((prev) => (prev === id ? null : id));
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-cyan-50/50 to-white sm:col-span-2 lg:col-span-3">
            <button
                type="button"
                onClick={() => {
                    setMenuOpen((o) => {
                        if (o) setActiveCategory(null);
                        return !o;
                    });
                }}
                className="w-full p-4 text-left flex items-start justify-between gap-3 hover:bg-cyan-50/60 rounded-xl transition-colors"
                aria-expanded={menuOpen}
            >
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-cyan-700 shrink-0" aria-hidden />
                        Promedio de embarque
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                        Fin embarque − Inicio embarque (hitos operacionales o crew)
                    </p>
                    <p className="text-3xl font-black text-cyan-950 mt-2 tabular-nums">
                        {formatAvg(overall.avgMinutes)}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                        {overall.countWithBoarding > 0
                            ? `${overall.countWithBoarding} vuelo${overall.countWithBoarding !== 1 ? "s" : ""} con ambos hitos en el filtro`
                            : "Sin vuelos con ambos hitos de embarque en el filtro"}
                    </p>
                </div>
                <ChevronDown
                    className={`w-5 h-5 text-cyan-800 shrink-0 mt-1 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>

            {menuOpen && (
                <div className="px-4 pb-4 space-y-1 border-t border-cyan-100/80">
                    {CATEGORIES.map(({ id, label, hint, Icon }) => {
                        const stats = byCategory[id];
                        const isActive = activeCategory === id;
                        return (
                            <div key={id} className="rounded-lg border border-slate-100 bg-white/80 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => toggleCategory(id)}
                                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                                        isActive ? "bg-cyan-50" : "hover:bg-slate-50"
                                    }`}
                                    aria-expanded={isActive}
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-black uppercase text-slate-600 flex items-center gap-1">
                                            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                            {label}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{hint}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-lg font-black text-slate-900 tabular-nums">
                                            {formatAvg(stats.avgMinutes)}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            {stats.countWithBoarding > 0
                                                ? `${stats.countWithBoarding} vuelo${stats.countWithBoarding !== 1 ? "s" : ""}`
                                                : "—"}
                                        </p>
                                    </div>
                                </button>
                                {isActive && (
                                    <div className="px-3 pb-3 border-t border-slate-100">
                                        <p className="text-[10px] font-bold uppercase text-slate-500 mt-2 mb-1">
                                            Vuelos por encima del promedio ({formatAvg(stats.avgMinutes)})
                                        </p>
                                        <BoardingAboveAverageList stats={stats} filterLabel={label} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
