import { useMemo, useState, useEffect, Fragment } from "react";
import type { Flight } from "../types";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { getAircraftInfo } from "../lib/fleetData";
import {
    flightDateToIso,
    getPax,
    getBags,
    getMvtPaxOnly,
    getScheduledPax,
    filterFlightsForStats,
    filterFlightsForStatsDepartureOnly,
    computeFleetMixShare,
    uniqueAirportsFromFlights,
    flightDaySegments,
    clipSegmentToWindow,
} from "../lib/controlHelpers";
import {
    BarChart3,
    GanttChartSquare,
    Plane,
    Luggage,
    Users,
    Percent,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Clock,
    Ban,
} from "lucide-react";

interface Props {
    flights: Flight[];
    /** Fecha ISO YYYY-MM-DD (sincronizada con el header) */
    selectedDate: string;
}

const WINDOW_HOURS = 8;
const WINDOW_STARTS = [0, 8, 16] as const;

function formatHm(minutes: number): string {
    const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

type ControlSubTab = "timeline" | "obvk" | "stats";

const FLIGHT_CARD_STYLES = [
    "from-cyan-500 via-cyan-600 to-teal-600 shadow-cyan-900/25",
    "from-sky-500 via-blue-600 to-indigo-600 shadow-indigo-900/25",
    "from-violet-500 via-purple-600 to-fuchsia-600 shadow-purple-900/20",
    "from-emerald-500 via-teal-600 to-cyan-600 shadow-emerald-900/20",
    "from-amber-500 via-orange-500 to-rose-600 shadow-amber-900/20",
];

export function ControlView({ flights, selectedDate }: Props) {
    const [subTab, setSubTab] = useState<ControlSubTab>("stats");
    const [statsDate, setStatsDate] = useState(selectedDate);
    const [statsAirport, setStatsAirport] = useState("");
    /** Inicio de la ventana visible en la línea de tiempo (0, 8 o 16 h) */
    const [timelineWindowStartH, setTimelineWindowStartH] = useState(0);
    /** Filtro aeropuerto (salida o llegada) en pestaña OBVK */
    const [obvkAirport, setObvkAirport] = useState("");

    useEffect(() => {
        setStatsDate(selectedDate);
    }, [selectedDate]);

    useEffect(() => {
        setTimelineWindowStartH(0);
    }, [selectedDate]);

    const dayFlights = useMemo(
        () => flights.filter((f) => flightDateToIso(f) === selectedDate).sort((a, b) => a.std.localeCompare(b.std)),
        [flights, selectedDate]
    );

    const obvkScopeFlights = useMemo(() => {
        if (!obvkAirport) return dayFlights;
        return dayFlights.filter((f) => f.dep === obvkAirport || f.arr === obvkAirport);
    }, [dayFlights, obvkAirport]);

    const obvkAirportOptions = useMemo(() => uniqueAirportsFromFlights(dayFlights), [dayFlights]);

    const byRegistration = useMemo(() => {
        const m = new Map<string, Flight[]>();
        for (const f of dayFlights) {
            const r = (f.reg && String(f.reg).trim()) || "Sin matrícula";
            if (!m.has(r)) m.set(r, []);
            m.get(r)!.push(f);
        }
        for (const arr of m.values()) {
            arr.sort((a, b) => a.std.localeCompare(b.std));
        }
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [dayFlights]);

    const windowStartMin = timelineWindowStartH * 60;
    const windowEndMin = windowStartMin + WINDOW_HOURS * 60;

    const shiftTimelinePrev = () => {
        const idx = WINDOW_STARTS.indexOf(timelineWindowStartH as (typeof WINDOW_STARTS)[number]);
        const i = idx === -1 ? 0 : idx;
        const next = (i - 1 + WINDOW_STARTS.length) % WINDOW_STARTS.length;
        setTimelineWindowStartH(WINDOW_STARTS[next]);
    };

    const shiftTimelineNext = () => {
        const idx = WINDOW_STARTS.indexOf(timelineWindowStartH as (typeof WINDOW_STARTS)[number]);
        const i = idx === -1 ? 0 : idx;
        const next = (i + 1) % WINDOW_STARTS.length;
        setTimelineWindowStartH(WINDOW_STARTS[next]);
    };

    const obvkFlights = useMemo(() => {
        return obvkScopeFlights
            .map((f) => {
                const ac = getAircraftInfo(f.reg);
                const pax = getPax(f);
                const cap = ac?.capacity ?? 0;
                const occ = cap > 0 ? (pax / cap) * 100 : null;
                const excess = ac ? pax - ac.capacity : 0;
                return { f, ac, pax, cap, occ, excess, isObvk: ac != null && pax > ac.capacity };
            })
            .filter((x) => x.isObvk);
    }, [obvkScopeFlights]);

    const obvkSummary = useMemo(() => {
        const totalExcessPax = obvkFlights.reduce((s, x) => s + Math.max(0, x.excess), 0);
        const count = obvkFlights.length;
        const avgExcessPax = count > 0 ? totalExcessPax / count : null;
        return { count, totalExcessPax, avgExcessPax };
    }, [obvkFlights]);

    const airportOptions = useMemo(() => uniqueAirportsFromFlights(flights), [flights]);

    const statsScope = useMemo(() => {
        const raw = filterFlightsForStats(flights, statsDate, statsAirport);
        const operational = raw.filter((f) => !f.cancelled);
        const cancelled = filterFlightsForStatsDepartureOnly(flights, statsDate, statsAirport)
            .filter((f) => f.cancelled)
            .sort((a, b) => a.std.localeCompare(b.std));
        return { raw, operational, cancelled };
    }, [flights, statsDate, statsAirport]);

    const statsFlights = statsScope.operational;
    const cancelledStatsFlights = statsScope.cancelled;
    const statsFlightsAnyInFilter = statsScope.raw.length > 0;

    const mix320 = useMemo(() => computeFleetMixShare(statsFlights, "A320"), [statsFlights]);
    const mix321 = useMemo(() => computeFleetMixShare(statsFlights, "A321"), [statsFlights]);

    const totalBags = useMemo(() => statsFlights.reduce((s, f) => s + getBags(f), 0), [statsFlights]);
    const totalPax = useMemo(() => statsFlights.reduce((s, f) => s + getMvtPaxOnly(f), 0), [statsFlights]);
    const bagsPerPaxPct = totalPax > 0 ? (totalBags / totalPax) * 100 : null;

    const cancelledScheduledPaxTotal = useMemo(
        () => cancelledStatsFlights.reduce((s, f) => s + getScheduledPax(f), 0),
        [cancelledStatsFlights]
    );

    const hourTickLabels = useMemo(() => {
        return Array.from({ length: WINDOW_HOURS + 1 }, (_, i) => windowStartMin + i * 60).map(formatHm);
    }, [windowStartMin]);

    return (
        <div className="pb-8">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden ring-1 ring-slate-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-cyan-50/40 to-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <GanttChartSquare className="w-5 h-5 text-cyan-600 shrink-0" />
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wide">Control operacional</h3>
                    </div>
                    <span className="text-xs font-bold text-slate-500 sm:ml-auto tabular-nums">{selectedDate}</span>
                </div>

                <div className="flex flex-wrap gap-1 px-3 sm:px-4 py-2 bg-slate-100/80 border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => setSubTab("stats")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "stats"
                                ? "bg-slate-800 text-white shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <BarChart3 className="w-4 h-4 shrink-0" />
                        Estadísticas
                    </button>
                    <button
                        type="button"
                        onClick={() => setSubTab("obvk")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "obvk"
                                ? "bg-amber-500 text-slate-900 shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        OBVK
                    </button>
                    <button
                        type="button"
                        onClick={() => setSubTab("timeline")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "timeline"
                                ? "bg-cyan-500 text-slate-900 shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <GanttChartSquare className="w-4 h-4 shrink-0" />
                        Línea de tiempo
                    </button>
                </div>

                {/* ——— Línea de tiempo ——— */}
                {subTab === "timeline" && (
                <div className="animate-in fade-in duration-200">
                {/* Controles ventana 8h */}
                <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 border-b border-slate-100">
                    <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4 text-cyan-600" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ventana local</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={shiftTimelinePrev}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 hover:border-cyan-300 transition-all"
                            title="8 horas antes"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">−8h</span>
                        </button>
                        <div className="min-w-[140px] text-center rounded-xl bg-white border border-cyan-200/80 px-4 py-2 shadow-inner">
                            <p className="text-[11px] font-black uppercase tracking-widest text-cyan-800/80">Intervalo</p>
                            <p className="text-sm font-black text-slate-900 tabular-nums">
                                {formatHm(windowStartMin)} – {formatHm(windowEndMin)}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={shiftTimelineNext}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 hover:border-cyan-300 transition-all"
                            title="8 horas después"
                        >
                            <span className="hidden sm:inline">+8h</span>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setTimelineWindowStartH(0)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-cyan-50 hover:border-cyan-300 transition-all"
                        >
                            00:00
                        </button>
                    </div>
                </div>

                <div className="px-4 pb-4 pt-0">
                    {byRegistration.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">No hay vuelos para esta fecha.</p>
                    ) : (
                        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                            {/* Cabecera: una sola regla horaria alineada con los carriles */}
                            <div className="grid grid-cols-[minmax(8.5rem,11rem)_1fr] border-b border-slate-200 bg-slate-50/95">
                                <div className="px-3 py-2.5 flex items-end border-r border-slate-200/70">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Matrícula</span>
                                </div>
                                <div className="px-2 py-2 min-w-0">
                                    <div className="grid grid-cols-9 gap-0">
                                        {hourTickLabels.map((label, i) => (
                                            <span
                                                key={`tick-${i}`}
                                                className={`text-[10px] font-black text-slate-500 tabular-nums ${
                                                    i === 0 ? "text-left" : i === WINDOW_HOURS ? "text-right" : "text-center"
                                                }`}
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {byRegistration.map(([reg, list], rowIdx) => {
                                const rowKey = `${reg}:${list.map((f) => `${f.id}:${f.reg}`).join("|")}`;
                                return (
                                    <Fragment key={rowKey}>
                                        <div
                                            className={`grid grid-cols-[minmax(8.5rem,11rem)_1fr] ${
                                                rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                            }`}
                                        >
                                            <div className="px-3 py-2 flex flex-col justify-center border-r border-slate-100 min-h-[3.25rem]">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Plane className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                                    <span className="font-black text-sm text-slate-900 truncate tabular-nums">{reg}</span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                    {getAircraftInfo(reg)?.model && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                                            {getAircraftInfo(reg)!.model}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-slate-400 font-semibold">
                                                        {list.length} vuelo{list.length !== 1 ? "s" : ""}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="relative min-h-[3.25rem] min-w-0 bg-gradient-to-b from-slate-50/80 to-white">
                                                {/* Cuadrícula cada hora */}
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {Array.from({ length: WINDOW_HOURS }, (_, i) => (
                                                        <div
                                                            key={`grid-${reg}-${i}`}
                                                            className={`flex-1 border-l border-slate-200/70 first:border-l-0 ${i % 2 === 0 ? "bg-slate-50/35" : "bg-transparent"}`}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300/70 z-0" />

                                                {list.map((f, fi) => {
                                                    const segments = flightDaySegments(f.std, f.sta);
                                                    return segments.map(([segStart, segEnd], si) => {
                                                        const clipped = clipSegmentToWindow(segStart, segEnd, windowStartMin, windowEndMin);
                                                        if (!clipped) return null;
                                                        const { leftPct, widthPct } = clipped;
                                                        const minW = widthPct < 8 ? 8 : widthPct;
                                                        const label = `${getAirlinePrefix(f.flt)}${f.flt}`;
                                                        const styleClass = FLIGHT_CARD_STYLES[fi % FLIGHT_CARD_STYLES.length];
                                                        return (
                                                            <div
                                                                key={`${f.id}-${f.reg}-${si}-${segStart}`}
                                                                title={`${label} ${f.dep}→${f.arr} · STD ${f.std} STA ${f.sta}`}
                                                                className={`absolute top-1/2 z-[1] -translate-y-1/2 min-h-[2.35rem] rounded-lg bg-gradient-to-r ${styleClass} text-white shadow-md border border-white/15 overflow-hidden hover:z-[2] hover:scale-[1.02] transition-transform`}
                                                                style={{
                                                                    left: `${leftPct}%`,
                                                                    width: `${minW}%`,
                                                                    minWidth: "72px",
                                                                }}
                                                            >
                                                                <div className="flex h-full w-full min-w-0 items-center justify-between gap-0.5 px-1 sm:px-1.5 py-0.5">
                                                                    <span className="shrink-0 text-[8px] sm:text-[10px] font-black leading-tight tracking-tight text-white/95 drop-shadow-sm">
                                                                        {f.dep}
                                                                    </span>
                                                                    <span className="min-w-0 flex-1 truncate text-center text-[8px] sm:text-[10px] font-black leading-tight px-0.5">
                                                                        {label}
                                                                    </span>
                                                                    <span className="shrink-0 text-[8px] sm:text-[10px] font-black leading-tight tracking-tight text-white/95 drop-shadow-sm">
                                                                        {f.arr}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })}
                                            </div>
                                        </div>
                                    </Fragment>
                                );
                            })}
                        </div>
                    )}
                </div>
                </div>
                )}

                {subTab === "obvk" && (
                <div className="animate-in fade-in duration-200">
                <div className="p-5 space-y-4 bg-amber-50/15">
                    <div className="flex flex-wrap gap-4 items-stretch">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 min-w-0 flex-1 max-w-xl">
                            <p className="text-xs font-bold uppercase text-amber-800 tracking-wider">Resumen del día</p>
                            <p className="text-2xl font-black text-amber-950 mt-1">{obvkSummary.count} vuelo{obvkSummary.count !== 1 ? "s" : ""} OBVK</p>
                            <p className="text-sm font-semibold text-amber-900 mt-1">
                                Suma plazas sobre capacidad: +{obvkSummary.totalExcessPax} pax
                            </p>
                            {obvkSummary.avgExcessPax != null && (
                                <p className="text-sm font-semibold text-amber-800/95 mt-2 pt-2 border-t border-amber-200/80">
                                    Promedio OBVK:{" "}
                                    <span className="font-black tabular-nums">
                                        +{obvkSummary.avgExcessPax.toFixed(1)} pax
                                    </span>{" "}
                                    por vuelo
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col justify-end min-w-[200px]">
                            <label className="block text-xs font-black uppercase text-slate-600 mb-1">Aeropuerto</label>
                            <select
                                value={obvkAirport}
                                onChange={(e) => setObvkAirport(e.target.value)}
                                className="w-full max-w-xs border border-amber-300/80 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 bg-white shadow-sm [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                            >
                                <option value="">Todos</option>
                                {obvkAirportOptions.map((code) => (
                                    <option key={code} value={code}>
                                        {code}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {dayFlights.length === 0 ? (
                        <p className="text-center text-slate-500 py-4">Sin vuelos este día.</p>
                    ) : obvkScopeFlights.length === 0 ? (
                        <p className="text-center text-slate-500 py-4">Ningún vuelo coincide con el aeropuerto seleccionado.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-600">
                                        <th className="px-3 py-2">Vuelo</th>
                                        <th className="px-3 py-2">Ruta</th>
                                        <th className="px-3 py-2">STD</th>
                                        <th className="px-3 py-2">Mat.</th>
                                        <th className="px-3 py-2">Equipo</th>
                                        <th className="px-3 py-2 text-right">Plazas</th>
                                        <th className="px-3 py-2 text-right">Pax</th>
                                        <th className="px-3 py-2 text-right">Ocup. %</th>
                                        <th className="px-3 py-2 text-right">OBVK</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {obvkScopeFlights.map((f) => {
                                        const ac = getAircraftInfo(f.reg);
                                        const pax = getPax(f);
                                        const cap = ac?.capacity ?? 0;
                                        const occ = cap > 0 ? (pax / cap) * 100 : null;
                                        const obvk = ac != null && pax > ac.capacity;
                                        return (
                                            <tr key={f.id} className={`border-t border-slate-100 ${obvk ? "bg-red-50" : ""}`}>
                                                <td className="px-3 py-2 font-bold">
                                                    {getAirlinePrefix(f.flt)}
                                                    {f.flt}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {f.dep}-{f.arr}
                                                </td>
                                                <td className="px-3 py-2 font-mono tabular-nums text-slate-800">{f.std || "—"}</td>
                                                <td className="px-3 py-2 font-mono text-xs">{f.reg || "—"}</td>
                                                <td className="px-3 py-2">{ac?.model ?? "—"}</td>
                                                <td className="px-3 py-2 text-right">{cap || "—"}</td>
                                                <td className="px-3 py-2 text-right font-semibold">{pax}</td>
                                                <td className="px-3 py-2 text-right">{occ != null ? `${occ.toFixed(1)}%` : "—"}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {obvk ? (
                                                        <span className="font-black text-red-700">+{pax - cap}</span>
                                                    ) : (
                                                        <span className="text-slate-400">—</span>
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
                )}

                {subTab === "stats" && (
                <div className="animate-in fade-in duration-200">
                <div className="p-5 space-y-6">
                    <div className="flex flex-wrap gap-4 items-end">
                        <div>
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={statsDate}
                                onChange={(e) => setStatsDate(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light]"
                            />
                        </div>
                        <div className="min-w-[200px] flex-1 max-w-xs">
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">Aeropuerto</label>
                            <select
                                value={statsAirport}
                                onChange={(e) => setStatsAirport(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                            >
                                <option value="">Todos los aeropuertos</option>
                                {airportOptions.map((ap) => (
                                    <option key={ap} value={ap}>
                                        {ap}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-slate-50 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Plane className="w-3.5 h-3.5" /> Utilización A320
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % de vuelos con equipo A320 (sobre el total del filtro)
                            </p>
                            <p className="text-3xl font-black text-slate-900 mt-2">
                                {mix320.sharePct != null ? `${mix320.sharePct.toFixed(1)}%` : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {mix320.countOfType} de {mix320.totalFlights} vuelo{mix320.totalFlights !== 1 ? "s" : ""} con A320
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-slate-50 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Plane className="w-3.5 h-3.5" /> Utilización A321
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % de vuelos con equipo A321 (sobre el total del filtro)
                            </p>
                            <p className="text-3xl font-black text-slate-900 mt-2">
                                {mix321.sharePct != null ? `${mix321.sharePct.toFixed(1)}%` : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {mix321.countOfType} de {mix321.totalFlights} vuelo{mix321.totalFlights !== 1 ? "s" : ""} con A321
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-cyan-50/50 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Luggage className="w-3.5 h-3.5" /> Bags despachadas
                            </p>
                            <p className="text-3xl font-black text-cyan-800 mt-2">{totalBags}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-slate-50 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" /> Pasajeros transportados
                            </p>
                            <p className="text-3xl font-black text-slate-900 mt-2">{totalPax}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-emerald-50/50 to-white sm:col-span-2 lg:col-span-1">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Percent className="w-3.5 h-3.5" /> Bags / Pax
                            </p>
                            <p className="text-3xl font-black text-emerald-800 mt-2">
                                {bagsPerPaxPct != null ? `${bagsPerPaxPct.toFixed(2)}%` : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">Porcentaje: bags sobre pasajeros (mismo filtro)</p>
                        </div>
                    </div>

                    {statsFlightsAnyInFilter && cancelledStatsFlights.length === 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex items-center gap-2 text-sm text-slate-600">
                            <Ban className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                            <span className="font-semibold">Sin vuelos cancelados en este Aeropuerto.</span>
                        </div>
                    )}

                    {cancelledStatsFlights.length > 0 && (
                        <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50/80 to-white p-4 sm:p-5 space-y-3 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2 justify-between">
                                <h4 className="text-sm font-black uppercase tracking-wide text-rose-900 flex items-center gap-2">
                                    <Ban className="w-4 h-4 shrink-0" aria-hidden />
                                    Vuelos cancelados
                                </h4>
                                <span className="text-xs font-black tabular-nums bg-rose-100 text-rose-900 px-2.5 py-1 rounded-full border border-rose-200">
                                    {cancelledStatsFlights.length} en el filtro
                                </span>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-rose-100 bg-white shadow-inner">
                                <table className="w-full text-sm min-w-[640px]">
                                    <thead>
                                        <tr className="bg-rose-50/90 text-left text-[10px] font-black uppercase tracking-wider text-rose-800 border-b border-rose-100">
                                            <th className="px-3 py-2">Vuelo</th>
                                            <th className="px-3 py-2">Ruta</th>
                                            <th className="px-3 py-2 whitespace-nowrap">STD</th>
                                            <th className="px-3 py-2 text-right whitespace-nowrap">PAX</th>
                                            <th className="px-3 py-2">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rose-50">
                                        {cancelledStatsFlights.map((f) => (
                                            <tr key={f.id} className="hover:bg-rose-50/50">
                                                <td className="px-3 py-2 font-black text-slate-900 whitespace-nowrap">
                                                    <span className="text-slate-500 font-bold">{getAirlinePrefix(f.flt)}</span>
                                                    {f.flt}
                                                </td>
                                                <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                                                    {f.dep} → {f.arr}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums font-mono text-slate-700">{f.std || "—"}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-800">
                                                    {getScheduledPax(f)}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 max-w-md">
                                                    {f.cancellationReason?.trim() ? (
                                                        <span className="line-clamp-3">{f.cancellationReason}</span>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Sin motivo registrado</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs font-bold text-rose-900/90 tabular-nums">
                                Total PAX (cancelaciones en filtro):{" "}
                                <span className="text-base font-black">{cancelledScheduledPaxTotal}</span>
                            </p>
                        </div>
                    )}

                    {!statsFlightsAnyInFilter && (
                        <p className="text-center text-slate-500 py-4">No hay vuelos para fecha y aeropuerto seleccionados.</p>
                    )}
                </div>
                </div>
                )}

            </div>
        </div>
    );
}
