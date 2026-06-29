import { useMemo, useState, useEffect } from "react";
import type { Flight, RouteAfectacionEntry } from "../types";
import { getAirlinePrefix, getHitosDepartureTime } from "../lib/flightHelpers";
import { getAircraftInfo } from "../lib/fleetData";
import {
    flightDateToIso,
    getPax,
    getBags,
    getMvtPaxOnly,
    getScheduledPax,
    filterFlightsForStats,
    computeFleetMixShare,
    uniqueAirportsFromFlights,
    computeStatusDiaDaySummary,
    buildStatusDiaPrensaText,
    listQrfFlightsForDay,
    listAlternoFlightsForDay,
    filterRouteAfectacionesForStats,
    normalizeIsoDateRange,
    countDaysInclusiveIso,
    flightMatchesStatsAtdTimeFilter,
    isStatsAtdTimeFilterActive,
    computeAverageGpuUsageMinutes,
    computeInicioEmbarqueCompliance,
    computeLlegadaCrewCompliance,
    computeBusquedasBagCompliance,
    computePeaCounts,
    hasMvtSent,
    flightMatchesStatsAirports,
    filterDayFlightsForSseeStats,
    filterFlightsForSseeStats,
    computeTotalSseeAssistances,
} from "../lib/controlHelpers";
import { formatMinutesToHHMM, parseTimeToMinutes } from "../lib/mvtTime";
import { formatDelayCodeDisplay } from "../lib/delayCodes";
import { buildStatsReportData, downloadStatsReport } from "../lib/statsReport";
import { ControlFuelTab } from "./ControlFuelTab";
import { ControlGpuTab } from "./ControlGpuTab";
import { ControlUsageTab } from "./ControlUsageTab";
import { ControlAirportMultiSelect } from "./ControlAirportMultiSelect";
import { ControlBoardingStatsPanel } from "./ControlBoardingStatsPanel";
import { ControlBagsStatsCard } from "./ControlBagsStatsCard";
import { ControlCargaStatsCard } from "./ControlCargaStatsCard";
import { ControlPaxStatsCard } from "./ControlPaxStatsCard";
import { AlternoIcon } from "./AlternoIcon";
import { ControlTimelineTab } from "./ControlTimelineTab";
import { RemoveQrfConfirmModal } from "./RemoveQrfConfirmModal";
import {
    BarChart3,
    GanttChartSquare,
    Plane,
    Percent,
    AlertTriangle,
    Ban,
    Activity,
    ListOrdered,
    BarChartHorizontal,
    Route,
    FileText,
    FileBarChart2,
    Zap,
    Building2,
    MapPin,
    Flame,
    Gauge,
    UserCheck,
    CircleCheck,
    RotateCcw,
    PlugZap,
    Accessibility,
    X,
    Luggage,
} from "lucide-react";

interface Props {
    flights: Flight[];
    /** Fecha ISO YYYY-MM-DD (sincronizada con el header) */
    selectedDate: string;
    /** Cambios de ruta registrados para ese día (Firebase routeAfectaciones/{fecha}) */
    routeAfectaciones?: RouteAfectacionEntry[];
    /** Todos los cambios de ruta por fecha (informe de estadísticas multi-día). */
    routeAfectacionesByDate?: Record<string, RouteAfectacionEntry[]>;
    onRemoveQrfEvent?: (flightId: string, eventIndex: number) => void | Promise<void>;
}

/** Pestaña «Línea de tiempo» en Control operacional. */
const SHOW_TIMELINE_TAB = true;

type ControlSubTab = "timeline" | "obvk" | "stats" | "statusDia" | "fuel" | "usage" | "gpu";

export function ControlView({
    flights,
    selectedDate,
    routeAfectaciones = [],
    routeAfectacionesByDate = {},
    onRemoveQrfEvent,
}: Props) {
    const [subTab, setSubTab] = useState<ControlSubTab>("statusDia");
    const [statsDateFrom, setStatsDateFrom] = useState(selectedDate);
    const [statsDateTo, setStatsDateTo] = useState(selectedDate);
    /** Filtro opcional: ventana de ATD (MVT), formato `HH:MM` de `<input type="time" />` o vacío */
    const [statsTimeFrom, setStatsTimeFrom] = useState("");
    const [statsTimeTo, setStatsTimeTo] = useState("");
    /** Filtro multi-aeropuerto compartido entre pestañas de Control */
    const [controlAirports, setControlAirports] = useState<string[]>([]);
    const [qrfDeleteTarget, setQrfDeleteTarget] = useState<{
        flightId: string;
        eventIndex: number;
        flt: string;
        reason: string;
    } | null>(null);
    const [showCod18Modal, setShowCod18Modal] = useState(false);
    useEffect(() => {
        setStatsDateFrom(selectedDate);
        setStatsDateTo(selectedDate);
    }, [selectedDate]);

    useEffect(() => {
        if (!SHOW_TIMELINE_TAB && subTab === "timeline") {
            setSubTab("statusDia");
        }
    }, [subTab]);

    const dayFlights = useMemo(
        () =>
            flights
                .filter((f) => flightDateToIso(f) === selectedDate)
                .sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b))),
        [flights, selectedDate]
    );

    const dayFlightsAirportFiltered = useMemo(
        () =>
            controlAirports.length === 0
                ? dayFlights
                : dayFlights.filter((f) => flightMatchesStatsAirports(f, controlAirports, "depOnly")),
        [dayFlights, controlAirports],
    );

    const obvkScopeFlights = dayFlightsAirportFiltered;

    const obvkAirportOptions = useMemo(() => uniqueAirportsFromFlights(dayFlights), [dayFlights]);

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
        const dateAirportRaw = filterFlightsForStats(flights, statsDateFrom, statsDateTo, controlAirports);
        const raw = dateAirportRaw.filter((f) => flightMatchesStatsAtdTimeFilter(f, statsTimeFrom, statsTimeTo));
        const operational = raw.filter((f) => !f.cancelled);
        const cancelled = filterFlightsForStats(flights, statsDateFrom, statsDateTo, controlAirports)
            .filter((f) => f.cancelled)
            .filter((f) => flightMatchesStatsAtdTimeFilter(f, statsTimeFrom, statsTimeTo))
            .sort((a, b) => {
                const da = flightDateToIso(a).localeCompare(flightDateToIso(b));
                if (da !== 0) return da;
                return getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b));
            });
        return { raw, operational, cancelled, dateAirportMatchCount: dateAirportRaw.length };
    }, [flights, statsDateFrom, statsDateTo, controlAirports, statsTimeFrom, statsTimeTo]);

    const statsRangeLabel = useMemo(() => {
        const { lo, hi } = normalizeIsoDateRange(statsDateFrom, statsDateTo);
        if (!lo || !hi) return "";
        const d0 = new Date(`${lo}T12:00:00`);
        const d1 = new Date(`${hi}T12:00:00`);
        const f0 = d0.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
        const f1 = d1.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
        const days = countDaysInclusiveIso(lo, hi);
        if (lo === hi) return f0;
        return `${f0} – ${f1} · ${days} día${days !== 1 ? "s" : ""}`;
    }, [statsDateFrom, statsDateTo]);

    const statsAtdTimeLabel = useMemo(() => {
        if (!isStatsAtdTimeFilterActive(statsTimeFrom, statsTimeTo)) return "";
        const a = statsTimeFrom.trim();
        const b = statsTimeTo.trim();
        const fmt = (s: string) => (s ? formatMinutesToHHMM(parseTimeToMinutes(s)) : null);
        const fa = a ? fmt(a) : null;
        const fb = b ? fmt(b) : null;
        if (fa && fb) {
            const overnight = parseTimeToMinutes(a) > parseTimeToMinutes(b);
            return `${fa} – ${fb}${overnight ? " (cruce medianoche)" : ""}`;
        }
        if (fa) return `desde ${fa}`;
        if (fb) return `hasta ${fb}`;
        return "";
    }, [statsTimeFrom, statsTimeTo]);

    const statsFlights = statsScope.operational;
    const cancelledStatsFlights = statsScope.cancelled;
    const statsFlightsAnyInFilter = statsScope.raw.length > 0;
    const statsDateAirportMatchCount = statsScope.dateAirportMatchCount;

    const mix320 = useMemo(() => computeFleetMixShare(statsFlights, "A320"), [statsFlights]);
    const mix321 = useMemo(() => computeFleetMixShare(statsFlights, "A321"), [statsFlights]);

    const totalBags = useMemo(() => statsFlights.reduce((s, f) => s + getBags(f), 0), [statsFlights]);
    const totalPax = useMemo(() => statsFlights.reduce((s, f) => s + getMvtPaxOnly(f), 0), [statsFlights]);
    const bagsPerPaxPct = totalPax > 0 ? (totalBags / totalPax) * 100 : null;
    const avgGpuUsage = useMemo(() => computeAverageGpuUsageMinutes(statsFlights), [statsFlights]);
    const inicioEmbarqueCompliance = useMemo(
        () => computeInicioEmbarqueCompliance(statsFlights),
        [statsFlights],
    );
    const llegadaCrewCompliance = useMemo(
        () => computeLlegadaCrewCompliance(statsFlights),
        [statsFlights],
    );
    const busquedasBagCompliance = useMemo(
        () => computeBusquedasBagCompliance(statsFlights),
        [statsFlights],
    );
    const statsFlightsMvtSent = useMemo(() => statsFlights.filter(hasMvtSent), [statsFlights]);
    const statsMvtSentTotal = statsFlightsMvtSent.length;
    const peaCounts = useMemo(() => computePeaCounts(statsFlightsMvtSent), [statsFlightsMvtSent]);
    const statsFlightTotal = statsFlights.length;
    const peaMangaPct =
        statsMvtSentTotal > 0 ? (peaCounts.manga / statsMvtSentTotal) * 100 : null;
    const peaRemotaPct =
        statsMvtSentTotal > 0 ? (peaCounts.remota / statsMvtSentTotal) * 100 : null;

    const cancelledScheduledPaxTotal = useMemo(
        () => cancelledStatsFlights.reduce((s, f) => s + getScheduledPax(f), 0),
        [cancelledStatsFlights]
    );

    const handleGenerateStatsReport = () => {
        if (statsFlights.length === 0) {
            alert(
                statsDateAirportMatchCount === 0
                    ? "No hay vuelos para el período y aeropuertos seleccionados."
                    : "No hay vuelos operativos que cumplan el filtro de ATD para generar el informe.",
            );
            return;
        }
        const airportLabel =
            controlAirports.length > 0
                ? `${controlAirports.join(", ")} (origen)`
                : "Todas las escalas de salida";
        downloadStatsReport(
            buildStatsReportData({
                flights: statsFlights,
                eventFlights: statsScope.raw,
                routeAfectaciones: filterRouteAfectacionesForStats(
                    routeAfectacionesByDate,
                    flights,
                    statsDateFrom,
                    statsDateTo,
                    controlAirports,
                    statsTimeFrom,
                    statsTimeTo,
                ),
                periodLabel: statsRangeLabel,
                airportLabel,
                atdTimeLabel: statsAtdTimeLabel,
                statsDateFrom,
                statsDateTo,
                selectedAirports: controlAirports,
            }),
        );
    };

    const statusDia = useMemo(() => {
        const summary = computeStatusDiaDaySummary(dayFlightsAirportFiltered, routeAfectaciones.length);
        return {
            ...summary,
            /** QRF / Alterno: siempre todos los del día (sin filtro de aeropuerto del status). */
            qrfFlights: listQrfFlightsForDay(dayFlights),
            alternoFlights: listAlternoFlightsForDay(dayFlights),
        };
    }, [dayFlightsAirportFiltered, dayFlights, routeAfectaciones.length]);

    const statusDiaSseeFlights = useMemo(
        () => filterDayFlightsForSseeStats(dayFlights, controlAirports),
        [dayFlights, controlAirports],
    );
    const statusDiaSseeCount = useMemo(
        () => computeTotalSseeAssistances(statusDiaSseeFlights),
        [statusDiaSseeFlights],
    );

    const statsSseeFlights = useMemo(
        () =>
            filterFlightsForSseeStats(
                flights,
                statsDateFrom,
                statsDateTo,
                controlAirports,
                statsTimeFrom,
                statsTimeTo,
            ),
        [flights, statsDateFrom, statsDateTo, controlAirports, statsTimeFrom, statsTimeTo],
    );
    const statsSseeCount = useMemo(
        () => computeTotalSseeAssistances(statsSseeFlights),
        [statsSseeFlights],
    );

    const [prensaModal, setPrensaModal] = useState<{ open: boolean; text: string }>({
        open: false,
        text: "",
    });
    const [prensaCopied, setPrensaCopied] = useState(false);

    return (
        <>
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
                        onClick={() => setSubTab("statusDia")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "statusDia"
                                ? "bg-indigo-600 text-white shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <Activity className="w-4 h-4 shrink-0" />
                        Status día
                    </button>
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
                        onClick={() => setSubTab("usage")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "usage"
                                ? "bg-teal-600 text-white shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <Gauge className="w-4 h-4 shrink-0" />
                        Control de uso
                    </button>
                    <button
                        type="button"
                        onClick={() => setSubTab("fuel")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "fuel"
                                ? "bg-orange-600 text-white shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <Flame className="w-4 h-4 shrink-0" />
                        Fuel
                    </button>
                    <button
                        type="button"
                        onClick={() => setSubTab("gpu")}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                            subTab === "gpu"
                                ? "bg-amber-600 text-white shadow-md"
                                : "bg-white/80 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
                        }`}
                    >
                        <PlugZap className="w-4 h-4 shrink-0" aria-hidden />
                        GPU
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
                    {SHOW_TIMELINE_TAB && (
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
                    )}
                </div>

                {/* ——— Línea de tiempo ——— */}
                {SHOW_TIMELINE_TAB && subTab === "timeline" && (
                    <ControlTimelineTab selectedDate={selectedDate} dayFlights={dayFlights} />
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
                        <ControlAirportMultiSelect
                            options={obvkAirportOptions}
                            selected={controlAirports}
                            onChange={setControlAirports}
                            label="Aeropuertos"
                            emptyHint="Todos"
                        />
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

                {subTab === "statusDia" && (
                <div className="animate-in fade-in duration-200">
                <div className="p-3 sm:p-4 space-y-3 bg-gradient-to-b from-indigo-50/30 to-white print:p-2 print:space-y-2 print:bg-white print:from-white print:shadow-none">
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/90 pb-2 print:border-slate-400 print:pb-1.5">
                        <p className="text-xs sm:text-sm text-slate-700 leading-snug">
                            <span className="font-black uppercase text-slate-900">Status día</span>
                            <span className="tabular-nums font-semibold mx-1">· {selectedDate}</span>
                            <span className="text-slate-500">
                                · {statusDia.totalVuelosDia} vuelos · {statusDia.countVuelosOperados} operados
                            </span>
                        </p>
                        <ControlAirportMultiSelect
                            options={obvkAirportOptions}
                            selected={controlAirports}
                            onChange={setControlAirports}
                            label="Aeropuertos"
                            emptyHint="Todos"
                            className="print:hidden"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setPrensaCopied(false);
                                setPrensaModal({
                                    open: true,
                                    text: buildStatusDiaPrensaText(selectedDate, statusDia, routeAfectaciones),
                                });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-violet-950 shadow-sm hover:bg-violet-100 print:hidden"
                            aria-label="Abrir texto listo para prensa o comunicaciones"
                        >
                            <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            Texto para prensa
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-2xl leading-snug -mt-1 print:text-slate-600">
                        Los datos que se muestran a continuación provienen de la data extraída de los mensajes operacionales.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-9 gap-2 print:gap-1.5">
                        <div className="rounded-lg border border-sky-200/90 bg-sky-50/80 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-sky-900 leading-tight">Operados</p>
                            <p className="text-[8px] font-semibold text-sky-800/80 leading-tight">MVT enviado</p>
                            <p className="text-xl sm:text-2xl font-black text-sky-950 tabular-nums leading-tight mt-0.5">
                                {statusDia.countVuelosOperados}
                            </p>
                        </div>
                        <div className="rounded-lg border border-blue-200/90 bg-blue-50/80 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-blue-900 leading-tight">Pasajeros embarcados</p>
                            <p className="text-[8px] font-semibold text-blue-800/80 leading-tight">PAX MVT</p>
                            <p className="text-xl sm:text-2xl font-black text-blue-950 tabular-nums leading-tight mt-0.5">
                                {statusDia.pasajerosEmbarcados.toLocaleString("es-AR")}
                            </p>
                        </div>
                        <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/90 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-emerald-900 leading-tight">OTP 0</p>
                            <p className="text-[8px] font-semibold text-emerald-800/80 leading-tight">solo JES</p>
                            {statusDia.nMvtOtp > 0 && statusDia.otp0Pct != null ? (
                                <p className="text-xl sm:text-2xl font-black text-emerald-950 tabular-nums leading-tight mt-0.5">
                                    {statusDia.otp0Pct.toFixed(1)}%
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 mt-1">—</p>
                            )}
                        </div>
                        <div className="rounded-lg border border-teal-200/90 bg-teal-50/80 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-teal-900 leading-tight">OTP 15</p>
                            <p className="text-[8px] font-semibold text-teal-800/80 leading-tight">solo JES</p>
                            {statusDia.nMvtOtp > 0 && statusDia.otp15Pct != null ? (
                                <p className="text-xl sm:text-2xl font-black text-teal-950 tabular-nums leading-tight mt-0.5">
                                    {statusDia.otp15Pct.toFixed(1)}%
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 mt-1">—</p>
                            )}
                        </div>
                        <div className="rounded-lg border border-indigo-200/90 bg-indigo-50/70 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-indigo-900 leading-tight">F. ocup. prog.</p>
                            {statusDia.factorOcupacionProgramadoPct != null ? (
                                <p className="text-xl sm:text-2xl font-black text-indigo-950 tabular-nums leading-tight mt-0.5">
                                    {statusDia.factorOcupacionProgramadoPct.toFixed(1)}%
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 mt-1">—</p>
                            )}
                        </div>
                        <div className="rounded-lg border border-violet-200/90 bg-violet-50/70 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-violet-900 leading-tight">F. ocup. real</p>
                            {statusDia.factorOcupacionRealPct != null ? (
                                <p className="text-xl sm:text-2xl font-black text-violet-950 tabular-nums leading-tight mt-0.5">
                                    {statusDia.factorOcupacionRealPct.toFixed(1)}%
                                </p>
                            ) : (
                                <p className="text-[11px] text-slate-500 mt-1">—</p>
                            )}
                        </div>
                        <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-amber-900 leading-tight">Reprog.</p>
                            <p className="text-xl sm:text-2xl font-black text-amber-950 tabular-nums leading-tight mt-0.5">
                                {statusDia.countVuelosReprogramados}
                            </p>
                        </div>
                        <div className="rounded-lg border border-orange-200/90 bg-orange-50/70 p-2 print:p-1.5 print:border-slate-400 print:bg-white">
                            <p className="text-[9px] font-black uppercase text-orange-900 leading-tight">PAX reprog.</p>
                            <p className="text-xl sm:text-2xl font-black text-orange-950 tabular-nums leading-tight mt-0.5">
                                {statusDia.paxAfectadosReprogramacion}
                            </p>
                        </div>
                        <div className="rounded-lg border border-cyan-200/90 bg-cyan-50/80 p-2 print:p-1.5 print:border-slate-400 print:bg-white sm:col-span-2 xl:col-span-1">
                            <p className="text-[9px] font-black uppercase text-cyan-900 leading-tight">Afect. ruta</p>
                            <p className="text-xl sm:text-2xl font-black text-cyan-950 tabular-nums leading-tight mt-0.5">
                                {statusDia.countAfectacionesRuta}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border border-rose-200/90 bg-rose-50/50 p-2 sm:p-2.5 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400 print:bg-white">
                        <div className="flex flex-wrap items-center gap-1.5 justify-between mb-1">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-rose-900 flex items-center gap-1">
                                <Accessibility className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                Asistencias
                            </h4>
                            <span className="text-xl sm:text-2xl font-black tabular-nums text-rose-950 leading-tight">
                                {statusDiaSseeCount.toLocaleString("es-AR")}
                            </span>
                        </div>
                        <p className="text-[10px] text-rose-900/80 leading-snug">
                            Servicios especiales SSEE informados en MVT
                            {controlAirports.length > 0
                                ? " · incluye vuelos que salen o arriban en el aeropuerto filtrado"
                                : ""}
                        </p>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2 sm:p-2.5 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400 print:bg-white">
                        <div className="flex flex-wrap items-center gap-1.5 justify-between mb-1.5">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-blue-900 flex items-center gap-1">
                                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                QRF (regreso a posición)
                            </h4>
                            <span className="text-[10px] font-black tabular-nums bg-blue-100 text-blue-950 px-1.5 py-0.5 rounded border border-blue-200">
                                {statusDia.qrfFlights.length}
                            </span>
                        </div>
                        {statusDia.qrfFlights.length === 0 ? (
                            <p className="text-[11px] text-slate-500 py-1">Sin QRF registrados.</p>
                        ) : (
                            <div className="overflow-x-auto rounded border border-blue-100 bg-white print:border-slate-300">
                                <table className="w-full text-[11px] min-w-[560px] leading-tight">
                                    <thead>
                                        <tr className="bg-blue-50 text-left text-[9px] font-black uppercase tracking-wide text-blue-900 print:bg-slate-100">
                                            <th className="px-1.5 py-1 whitespace-nowrap">STD</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Vuelo</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Reg</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Ruta</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Estado</th>
                                            <th className="px-1.5 py-1">Motivo</th>
                                            {onRemoveQrfEvent ? (
                                                <th className="px-1 py-1 w-8 print:hidden" aria-label="Eliminar" />
                                            ) : null}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-blue-50">
                                        {statusDia.qrfFlights.map((row, i) => (
                                            <tr key={`${row.flightId}-${row.eventIndex}-${i}`} className="hover:bg-blue-50/40 print:hover:bg-transparent">
                                                <td className="px-1.5 py-0.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                                    {row.std}
                                                </td>
                                                <td className="px-1.5 py-0.5 font-bold text-slate-900 whitespace-nowrap">
                                                    {row.flt}
                                                </td>
                                                <td className="px-1.5 py-0.5 font-mono">{row.reg}</td>
                                                <td className="px-1.5 py-0.5 font-mono font-semibold text-slate-700 whitespace-nowrap">
                                                    {row.route}
                                                </td>
                                                <td className="px-1.5 py-0.5 whitespace-nowrap">
                                                    <span
                                                        className={
                                                            row.status === "Activo"
                                                                ? "font-bold text-blue-800"
                                                                : "font-semibold text-emerald-700"
                                                        }
                                                    >
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="px-1.5 py-0.5 text-slate-700">
                                                    <span className="line-clamp-2 break-words">{row.reason}</span>
                                                </td>
                                                {onRemoveQrfEvent ? (
                                                    <td className="px-1 py-0.5 text-center print:hidden">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setQrfDeleteTarget({
                                                                    flightId: row.flightId,
                                                                    eventIndex: row.eventIndex,
                                                                    flt: row.flt,
                                                                    reason: row.reason,
                                                                })
                                                            }
                                                            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 border border-transparent hover:border-red-200 transition-colors"
                                                            title="Eliminar QRF"
                                                            aria-label={`Eliminar QRF ${row.flt}`}
                                                        >
                                                            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                        </button>
                                                    </td>
                                                ) : null}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 sm:p-2.5 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400 print:bg-white">
                        <div className="flex flex-wrap items-center gap-1.5 justify-between mb-1.5">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-amber-900 flex items-center gap-1">
                                <AlternoIcon className="w-3.5 h-3.5 shrink-0" />
                                Alternos
                            </h4>
                            <span className="text-[10px] font-black tabular-nums bg-amber-100 text-amber-950 px-1.5 py-0.5 rounded border border-amber-200">
                                {statusDia.alternoFlights.length}
                            </span>
                        </div>
                        {statusDia.alternoFlights.length === 0 ? (
                            <p className="text-[11px] text-slate-500 py-1">Sin alternos activos.</p>
                        ) : (
                            <div className="overflow-x-auto rounded border border-amber-100 bg-white print:border-slate-300">
                                <table className="w-full text-[11px] min-w-[520px] leading-tight">
                                    <thead>
                                        <tr className="bg-amber-50 text-left text-[9px] font-black uppercase tracking-wide text-amber-900 print:bg-slate-100">
                                            <th className="px-1.5 py-1 whitespace-nowrap">STD</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Vuelo</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Reg</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">Dest. prog.</th>
                                            <th className="px-1.5 py-1 whitespace-nowrap">ATO</th>
                                            <th className="px-1.5 py-1">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-50">
                                        {statusDia.alternoFlights.map((row, i) => (
                                            <tr key={`${row.flt}-${row.std}-${i}`} className="hover:bg-amber-50/40 print:hover:bg-transparent">
                                                <td className="px-1.5 py-0.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                                    {row.std}
                                                </td>
                                                <td className="px-1.5 py-0.5 font-bold text-slate-900 whitespace-nowrap">
                                                    {row.flt}
                                                </td>
                                                <td className="px-1.5 py-0.5 font-mono">{row.reg}</td>
                                                <td className="px-1.5 py-0.5 font-mono text-slate-500 line-through whitespace-nowrap">
                                                    {row.arrProgramado}
                                                </td>
                                                <td className="px-1.5 py-0.5 font-mono font-bold text-amber-800 whitespace-nowrap">
                                                    {row.ato}
                                                </td>
                                                <td className="px-1.5 py-0.5 text-slate-700">
                                                    <span className="line-clamp-2 break-words">{row.reason}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-cyan-200 bg-white p-2 sm:p-3 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400">
                        <div className="flex flex-wrap items-center gap-1.5 justify-between mb-1.5">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-cyan-900 flex items-center gap-1">
                                <Route className="w-3.5 h-3.5 shrink-0" />
                                Afectaciones de ruta
                            </h4>
                            <span className="text-[10px] font-black tabular-nums bg-cyan-100 text-cyan-950 px-1.5 py-0.5 rounded border border-cyan-200">
                                {routeAfectaciones.length}
                            </span>
                        </div>
                        {routeAfectaciones.length === 0 ? (
                            <p className="text-[11px] text-slate-500 py-1">Sin datos.</p>
                        ) : (
                            <div className="overflow-x-auto rounded border border-cyan-100 bg-white print:border-slate-300">
                                <table className="w-full text-[11px] min-w-[520px] leading-tight">
                                    <thead>
                                        <tr className="bg-cyan-50 text-left text-[9px] font-black uppercase tracking-wide text-cyan-900 print:bg-slate-100">
                                            <th className="px-1.5 py-1 whitespace-nowrap">Hora</th>
                                            <th className="px-1.5 py-1">Vuelo</th>
                                            <th className="px-1.5 py-1">Mat.</th>
                                            <th className="px-1.5 py-1">Antes</th>
                                            <th className="px-1.5 py-1">Después</th>
                                            <th className="px-1.5 py-1">Registró</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-cyan-50/80">
                                        {routeAfectaciones.map((row) => {
                                            let hora = "—";
                                            try {
                                                const d = new Date(row.at);
                                                if (!Number.isNaN(d.getTime())) {
                                                    hora = d.toLocaleString("es-AR", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    });
                                                }
                                            } catch {
                                                /* ignore */
                                            }
                                            return (
                                                <tr key={row.id} className="hover:bg-cyan-50/40 print:hover:bg-transparent">
                                                    <td className="px-1.5 py-0.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                                        {hora}
                                                    </td>
                                                    <td className="px-1.5 py-0.5 font-bold text-slate-900">
                                                        {getAirlinePrefix(row.flt)}
                                                        {row.flt}
                                                    </td>
                                                    <td className="px-1.5 py-0.5 font-mono">{row.reg || "—"}</td>
                                                    <td className="px-1.5 py-0.5 font-mono font-semibold text-slate-700">
                                                        {row.depAntes}-{row.arrAntes}
                                                    </td>
                                                    <td className="px-1.5 py-0.5 font-mono font-black text-cyan-900">
                                                        {row.depDespues}-{row.arrDespues}
                                                    </td>
                                                    <td className="px-1.5 py-0.5 text-slate-700 max-w-[10rem]">
                                                        <span className="line-clamp-2 break-all">{row.by || "—"}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 sm:p-2.5 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400 print:bg-white">
                        <h4 className="text-[11px] font-black uppercase tracking-wide text-amber-900 flex items-center gap-1 mb-1.5">
                            <ListOrdered className="w-3.5 h-3.5 shrink-0" />
                            Motivos reprogramación
                        </h4>
                        {statusDia.motivosReprogramacion.length === 0 ? (
                            <p className="text-[11px] text-slate-500 py-0.5">Sin datos.</p>
                        ) : (
                            <div className="overflow-x-auto rounded border border-amber-100 bg-white print:border-slate-300">
                                <table className="w-full text-[11px] min-w-[240px] leading-tight">
                                    <thead>
                                        <tr className="bg-amber-50 text-left text-[9px] font-black uppercase text-amber-900 print:bg-slate-100">
                                            <th className="px-1.5 py-1 text-right w-10">N</th>
                                            <th className="px-1.5 py-1">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-50/80">
                                        {statusDia.motivosReprogramacion.map((row, i) => (
                                            <tr key={`${row.text}-${i}`}>
                                                <td className="px-1.5 py-0.5 text-right font-black tabular-nums text-amber-900">
                                                    {row.count}
                                                </td>
                                                <td className="px-1.5 py-0.5 text-slate-800 font-semibold">{row.text}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-2 sm:p-2.5 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400 print:bg-white">
                        <h4 className="text-[11px] font-black uppercase tracking-wide text-violet-950 flex items-center gap-1 mb-1.5">
                            <BarChartHorizontal className="w-3.5 h-3.5 shrink-0" />
                            Demoras MVT
                        </h4>
                        {statusDia.demoraCodigos.length === 0 ? (
                            <p className="text-[11px] text-slate-500 py-0.5">Sin datos.</p>
                        ) : (
                            <div className="overflow-x-auto rounded border border-violet-100 bg-white print:border-slate-300">
                                <table className="w-full text-[11px] min-w-[280px] leading-tight">
                                    <thead>
                                        <tr className="bg-violet-50 text-left text-[9px] font-black uppercase text-violet-900 print:bg-slate-100">
                                            <th className="px-1.5 py-1">Código / descripción</th>
                                            <th className="px-1.5 py-1 text-right w-12">%</th>
                                            <th className="px-1.5 py-1 text-right w-8">N</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-violet-50/80">
                                        {statusDia.demoraCodigos.map((row, i) => (
                                            <tr key={`${row.code}-${i}`}>
                                                <td className="px-1.5 py-0.5 font-semibold text-slate-800 break-words">
                                                    {formatDelayCodeDisplay(row.code)}
                                                </td>
                                                <td className="px-1.5 py-0.5 text-right tabular-nums font-bold text-violet-900">
                                                    {row.pct.toFixed(1)}
                                                </td>
                                                <td className="px-1.5 py-0.5 text-right tabular-nums font-black text-slate-700">
                                                    {row.count}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-2 sm:p-2.5 shadow-sm print:shadow-none print:p-1.5 print:border-slate-400 print:bg-white">
                        <div className="flex flex-wrap items-center gap-1.5 justify-between mb-1">
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-rose-900 flex items-center gap-1">
                                <Ban className="w-3.5 h-3.5 shrink-0" />
                                Cancelaciones
                            </h4>
                            <span className="text-[10px] font-black tabular-nums bg-rose-100 text-rose-950 px-1.5 py-0.5 rounded border border-rose-200">
                                {statusDia.countCancelados} vuelos · PAX {statusDia.paxCancelados}
                            </span>
                        </div>
                        {statusDia.motivosCancelacionDetalle.length === 0 ? (
                            <p className="text-[11px] text-slate-500 py-0.5">Sin datos.</p>
                        ) : (
                            <div className="overflow-x-auto rounded border border-rose-100 bg-white print:border-slate-300">
                                <table className="w-full text-[11px] min-w-[260px] leading-tight">
                                    <thead>
                                        <tr className="bg-rose-50 text-left text-[9px] font-black uppercase text-rose-800 print:bg-slate-100">
                                            <th className="px-1.5 py-1">Motivo</th>
                                            <th className="px-1.5 py-1 text-right whitespace-nowrap w-12">Vuelos</th>
                                            <th className="px-1.5 py-1 text-right whitespace-nowrap w-12">PAX</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rose-50/80">
                                        {statusDia.motivosCancelacionDetalle.map((row, i) => (
                                            <tr key={`${row.text}-${i}`} className="hover:bg-rose-50/40 print:hover:bg-transparent">
                                                <td className="px-1.5 py-0.5 text-slate-800 max-w-[min(100vw,18rem)]">
                                                    <span className="line-clamp-2">{row.text}</span>
                                                </td>
                                                <td className="px-1.5 py-0.5 text-right font-black tabular-nums text-rose-900">
                                                    {row.count}
                                                </td>
                                                <td className="px-1.5 py-0.5 text-right font-bold tabular-nums text-slate-800">
                                                    {row.pax}
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

                {subTab === "stats" && (
                <div className="animate-in fade-in duration-200">
                <div className="p-5 space-y-6">
                    <div className="flex flex-wrap items-end gap-3 pb-1">
                        <div className="shrink-0">
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">Desde</label>
                            <input
                                type="date"
                                value={statsDateFrom}
                                onChange={(e) => setStatsDateFrom(e.target.value)}
                                max={statsDateTo || undefined}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                            />
                        </div>
                        <div className="shrink-0">
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">Hasta</label>
                            <input
                                type="date"
                                value={statsDateTo}
                                onChange={(e) => setStatsDateTo(e.target.value)}
                                min={statsDateFrom || undefined}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                            />
                        </div>
                        <ControlAirportMultiSelect
                            options={airportOptions}
                            selected={controlAirports}
                            onChange={setControlAirports}
                            label="Aeropuertos"
                            emptyHint="Todas las escalas de salida"
                        />
                        <div className="shrink-0">
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">ATD desde</label>
                            <input
                                type="time"
                                value={statsTimeFrom}
                                onChange={(e) => setStatsTimeFrom(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light]"
                            />
                        </div>
                        <div className="shrink-0">
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">ATD hasta</label>
                            <input
                                type="time"
                                value={statsTimeTo}
                                onChange={(e) => setStatsTimeTo(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light]"
                            />
                        </div>
                        {(statsTimeFrom || statsTimeTo) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setStatsTimeFrom("");
                                    setStatsTimeTo("");
                                }}
                                className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            >
                                Quitar ATD
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleGenerateStatsReport}
                            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 text-xs font-black uppercase tracking-wide shadow-md transition-colors"
                        >
                            <FileBarChart2 className="w-4 h-4 shrink-0" aria-hidden />
                            Generar Informe
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-500 -mt-2 max-w-2xl leading-snug">
                        Los datos que se muestran a continuación provienen de la data extraída de los mensajes operacionales.
                    </p>
                    {statsRangeLabel ? (
                        <p className="text-xs font-semibold text-slate-600 -mt-1">
                            Período: <span className="font-black text-slate-800 tabular-nums">{statsRangeLabel}</span>
                            {statsAtdTimeLabel ? (
                                <>
                                    {" "}
                                    · ATD:{" "}
                                    <span className="font-black text-slate-800 tabular-nums">{statsAtdTimeLabel}</span>
                                </>
                            ) : null}
                        </p>
                    ) : statsAtdTimeLabel ? (
                        <p className="text-xs font-semibold text-slate-600 -mt-1">
                            ATD: <span className="font-black text-slate-800 tabular-nums">{statsAtdTimeLabel}</span>
                        </p>
                    ) : null}

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
                        <ControlBagsStatsCard flights={statsFlights} selectedAirports={controlAirports} />
                        <ControlCargaStatsCard flights={statsFlights} selectedAirports={controlAirports} />
                        <ControlPaxStatsCard flights={statsFlights} selectedAirports={controlAirports} />
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-rose-50/60 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Accessibility className="w-3.5 h-3.5 text-rose-700" aria-hidden />
                                Asistencias
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                Σ servicios especiales SSEE (MVT)
                                {controlAirports.length > 0
                                    ? " · salidas y arribos en aeropuertos filtrados"
                                    : ""}
                            </p>
                            <p className="text-3xl font-black text-rose-950 mt-2 tabular-nums">
                                {statsSseeCount.toLocaleString("es-AR")}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {statsSseeFlights.length > 0
                                    ? `${statsSseeFlights.length} vuelo${statsSseeFlights.length !== 1 ? "s" : ""} en el filtro`
                                    : "Sin vuelos en el filtro"}
                            </p>
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
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-amber-50/40 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Zap className="w-3.5 h-3.5 text-amber-600" aria-hidden />
                                Uso promedio GPU
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                Promedio de duración (inicio → fin) según hitos operacionales
                            </p>
                            <p className="text-3xl font-black text-amber-950 mt-2 tabular-nums">
                                {avgGpuUsage.avgMinutes != null
                                    ? formatMinutesToHHMM(Math.round(avgGpuUsage.avgMinutes))
                                    : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {avgGpuUsage.countWithGpu > 0
                                    ? `${avgGpuUsage.countWithGpu} vuelo${avgGpuUsage.countWithGpu !== 1 ? "s" : ""} con inicio y fin GPU (excl. «no se utilizó GPU»)`
                                    : "Sin vuelos con GPU informada en el filtro"}
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-emerald-50/60 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <CircleCheck className="w-3.5 h-3.5 text-emerald-700" aria-hidden />
                                Cumplimiento inicio embarque
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % a tiempo · hito Inicio Embarque vs carta Gantt
                            </p>
                            <p className="text-3xl font-black text-emerald-950 mt-2 tabular-nums">
                                {inicioEmbarqueCompliance.onTimePct != null
                                    ? `${inicioEmbarqueCompliance.onTimePct.toFixed(1)}%`
                                    : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {inicioEmbarqueCompliance.evaluatedCount > 0
                                    ? `${inicioEmbarqueCompliance.onTimeCount} de ${inicioEmbarqueCompliance.evaluatedCount} vuelo${inicioEmbarqueCompliance.evaluatedCount !== 1 ? "s" : ""} a tiempo`
                                    : "Sin vuelos con hito y carta en el filtro"}
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-indigo-50/60 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5 text-indigo-700" aria-hidden />
                                Cumplimiento llegada crew
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % a tiempo · hito Llegada crew vs carta
                            </p>
                            <p className="text-3xl font-black text-indigo-950 mt-2 tabular-nums">
                                {llegadaCrewCompliance.onTimePct != null
                                    ? `${llegadaCrewCompliance.onTimePct.toFixed(1)}%`
                                    : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {llegadaCrewCompliance.evaluatedCount > 0
                                    ? `${llegadaCrewCompliance.onTimeCount} de ${llegadaCrewCompliance.evaluatedCount} vuelo${llegadaCrewCompliance.evaluatedCount !== 1 ? "s" : ""} a tiempo`
                                    : "Sin vuelos con Llegada crew cargada y carta Gantt en el filtro"}
                            </p>
                        </div>
                        <div 
                            className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-fuchsia-50/60 to-white cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => setShowCod18Modal(true)}
                        >
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Luggage className="w-3.5 h-3.5 text-fuchsia-700" aria-hidden />
                                Búsquedas de equipaje
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % a tiempo · Inicio búsqueda de equipaje
                            </p>
                            <p className="text-3xl font-black text-fuchsia-950 mt-2 tabular-nums">
                                {busquedasBagCompliance.onTimePct != null
                                    ? `${busquedasBagCompliance.onTimePct.toFixed(1)}%`
                                    : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {busquedasBagCompliance.evaluatedCount > 0
                                    ? `${busquedasBagCompliance.onTimeCount} de ${busquedasBagCompliance.evaluatedCount} vuelo${busquedasBagCompliance.evaluatedCount !== 1 ? "s" : ""} a tiempo`
                                    : "Sin vuelos con búsqueda de equipaje cargada en el filtro"}
                            </p>
                        </div>
                        <ControlBoardingStatsPanel flights={statsFlights} />
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-violet-50/50 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5 text-violet-600" aria-hidden />
                                Uso de manga
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % sobre MVT enviados en el filtro (PEA en hitos operacionales)
                            </p>
                            <p className="text-3xl font-black text-violet-950 mt-2 tabular-nums">
                                {peaMangaPct != null ? `${peaMangaPct.toFixed(1)}%` : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {statsMvtSentTotal > 0
                                    ? `${peaCounts.manga} de ${statsMvtSentTotal} MVT enviado${statsMvtSentTotal !== 1 ? "s" : ""} con PEA «Manga»`
                                    : statsFlightTotal > 0
                                      ? "Sin MVT enviados en el filtro"
                                      : "Sin vuelos en el filtro"}
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-sky-50/50 to-white">
                            <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-sky-600" aria-hidden />
                                Uso de remota
                            </p>
                            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                % sobre MVT enviados en el filtro (PEA en hitos operacionales)
                            </p>
                            <p className="text-3xl font-black text-sky-950 mt-2 tabular-nums">
                                {peaRemotaPct != null ? `${peaRemotaPct.toFixed(1)}%` : "—"}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                                {statsMvtSentTotal > 0
                                    ? `${peaCounts.remota} de ${statsMvtSentTotal} MVT enviado${statsMvtSentTotal !== 1 ? "s" : ""} con PEA «Remota»`
                                    : statsFlightTotal > 0
                                      ? "Sin MVT enviados en el filtro"
                                      : "Sin vuelos en el filtro"}
                            </p>
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
                        <p className="text-center text-slate-500 py-4 max-w-lg mx-auto leading-relaxed">
                            {statsDateAirportMatchCount === 0
                                ? "No hay vuelos para el período y aeropuerto seleccionados."
                                : "Hay vuelos en el período y aeropuerto, pero ninguno cumple el filtro de ATD (o no tienen MVT con ATD cargado)."}
                        </p>
                    )}
                </div>
                </div>
                )}

                {subTab === "usage" && (
                    <ControlUsageTab
                        flights={flights}
                        selectedDate={selectedDate}
                        selectedAirports={controlAirports}
                        onAirportsChange={setControlAirports}
                        airportOptions={airportOptions}
                    />
                )}

                {subTab === "fuel" && (
                    <ControlFuelTab
                        flights={flights}
                        selectedDate={selectedDate}
                        selectedAirports={controlAirports}
                        onAirportsChange={setControlAirports}
                        airportOptions={airportOptions}
                    />
                )}

                {subTab === "gpu" && (
                    <ControlGpuTab
                        flights={flights}
                        selectedDate={selectedDate}
                        selectedAirports={controlAirports}
                        onAirportsChange={setControlAirports}
                        airportOptions={airportOptions}
                    />
                )}

            </div>
        </div>

        {prensaModal.open && (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="prensa-modal-title"
                onClick={(e) => {
                    if (e.target === e.currentTarget) setPrensaModal({ open: false, text: "" });
                }}
            >
                <div
                    className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-200/80"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
                        <FileText className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" aria-hidden />
                        <div className="min-w-0">
                            <h2 id="prensa-modal-title" className="text-sm font-black uppercase tracking-wide text-slate-900">
                                Borrador para prensa / comunicaciones
                            </h2>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                                Texto armado con los mismos datos del Status día (sin servicios externos). Copiá y
                                ajustá el tono antes de enviar.
                            </p>
                        </div>
                    </div>
                    <div className="p-3 flex-1 min-h-0 flex flex-col gap-2">
                        <textarea
                            readOnly
                            value={prensaModal.text}
                            className="w-full flex-1 min-h-[220px] resize-y rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-800 font-mono shadow-inner"
                            spellCheck={false}
                        />
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            {prensaCopied && (
                                <span className="text-[11px] font-bold text-emerald-700 mr-auto">Copiado al portapapeles</span>
                            )}
                            <button
                                type="button"
                                onClick={() => setPrensaModal({ open: false, text: "" })}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(prensaModal.text);
                                        setPrensaCopied(true);
                                        window.setTimeout(() => setPrensaCopied(false), 2500);
                                    } catch {
                                        window.alert(
                                            "No se pudo copiar automáticamente. Seleccioná el texto en el cuadro y usá Ctrl+C."
                                        );
                                    }
                                }}
                                className="rounded-xl border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-violet-700"
                            >
                                Copiar texto
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        {qrfDeleteTarget && onRemoveQrfEvent ? (
            <RemoveQrfConfirmModal
                flt={qrfDeleteTarget.flt}
                reason={qrfDeleteTarget.reason}
                onClose={() => setQrfDeleteTarget(null)}
                onConfirm={async () => {
                    await onRemoveQrfEvent(qrfDeleteTarget.flightId, qrfDeleteTarget.eventIndex);
                    setQrfDeleteTarget(null);
                }}
            />
        ) : null}
        
        {showCod18Modal && (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                role="dialog"
                aria-modal="true"
                onClick={(e) => {
                    if (e.target === e.currentTarget) setShowCod18Modal(false);
                }}
            >
                <div
                    className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-200/80"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-fuchsia-50 to-white">
                        <Luggage className="w-5 h-5 text-fuchsia-600 shrink-0 mt-0.5" aria-hidden />
                        <div className="min-w-0">
                            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                                Vuelos con demora COD 18 (Búsqueda de equipaje)
                            </h2>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                                Muestra todos los casos con demora COD 18 y si la búsqueda se inició o no a tiempo. (AEP contabiliza a tiempo si T-20)
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowCod18Modal(false)}
                            className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-0 flex-1 min-h-0 overflow-auto">
                        {busquedasBagCompliance.cod18Flights.length === 0 ? (
                            <p className="text-center text-slate-500 py-8 text-sm">No hay vuelos con demora COD 18 en este período.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-fuchsia-50/90 backdrop-blur border-b border-fuchsia-100">
                                    <tr className="text-left text-xs font-black uppercase tracking-wider text-fuchsia-900">
                                        <th className="px-4 py-3">Vuelo</th>
                                        <th className="px-4 py-3">Ruta</th>
                                        <th className="px-4 py-3">STD</th>
                                        <th className="px-4 py-3">Mat.</th>
                                        <th className="px-4 py-3">Demoras (MVT)</th>
                                        <th className="px-4 py-3">Inicio búsqueda</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-fuchsia-50">
                                    {busquedasBagCompliance.cod18Flights.map((info, i) => (
                                        <tr key={info.flight.id + "-" + i} className="hover:bg-fuchsia-50/30">
                                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                                                {getAirlinePrefix(info.flight.flt)}{info.flight.flt}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">
                                                {info.flight.dep}-{info.flight.arr}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                                                {info.flight.std || "—"}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                                                {info.flight.reg || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {info.flight.mvtData?.dlyCod1 && (
                                                    <div>{info.flight.mvtData.dlyCod1} ({info.flight.mvtData.dlyTime1}m)</div>
                                                )}
                                                {info.flight.mvtData?.dlyCod2 && (
                                                    <div>{info.flight.mvtData.dlyCod2} ({info.flight.mvtData.dlyTime2}m)</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-semibold whitespace-nowrap">
                                                {info.onTime === true ? (
                                                    <span className="text-emerald-700 flex items-center gap-1.5"><CircleCheck className="w-3.5 h-3.5"/> A tiempo</span>
                                                ) : info.onTime === false ? (
                                                    <span className="text-rose-700 flex items-center gap-1.5"><X className="w-3.5 h-3.5"/> Demorado</span>
                                                ) : (
                                                    <span className="text-slate-400 italic">No registrado</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
