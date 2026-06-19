import { Fragment, useEffect, useMemo, useState } from "react";
import type { Flight } from "../types";
import { getAirlinePrefix, getHitosDepartureTime } from "../lib/flightHelpers";
import { getAircraftInfo } from "../lib/fleetData";
import { flightDaySegments, clipSegmentToWindow } from "../lib/controlHelpers";
import {
    computeTimelineFlightPaint,
    timelineReferenceNowMinutes,
    defaultTimelineWindowStartMin,
    clampTimelineWindowStartMin,
    TIMELINE_WINDOW_HOURS,
    TIMELINE_SHIFT_HOURS,
} from "../lib/timelineHelpers";
import { ControlTimelineFlightDetailModal } from "./ControlTimelineFlightDetailModal";
import { Clock, GanttChartSquare, Plane } from "lucide-react";

function formatHm(minutes: number): string {
    const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

interface Props {
    selectedDate: string;
    dayFlights: Flight[];
    /** Vista SC a pantalla completa (fuera del card de Control operacional). */
    standalone?: boolean;
}

export function ControlTimelineTab({ selectedDate, dayFlights, standalone = false }: Props) {
    const [windowStartMin, setWindowStartMin] = useState(() =>
        defaultTimelineWindowStartMin(selectedDate),
    );
    const [detailFlight, setDetailFlight] = useState<Flight | null>(null);
    const [nowMin, setNowMin] = useState(() => timelineReferenceNowMinutes(selectedDate));

    useEffect(() => {
        setWindowStartMin(defaultTimelineWindowStartMin(selectedDate));
    }, [selectedDate]);

    useEffect(() => {
        setNowMin(timelineReferenceNowMinutes(selectedDate));
        const id = window.setInterval(() => {
            setNowMin(timelineReferenceNowMinutes(selectedDate));
        }, 60_000);
        return () => window.clearInterval(id);
    }, [selectedDate]);

    const shiftWindow = (hours: number) => {
        setWindowStartMin((prev) => clampTimelineWindowStartMin(prev + hours * 60));
    };

    const byRegistration = useMemo(() => {
        const m = new Map<string, Flight[]>();
        for (const f of dayFlights) {
            const r = (f.reg && String(f.reg).trim()) || "Sin matrícula";
            if (!m.has(r)) m.set(r, []);
            m.get(r)!.push(f);
        }
        for (const arr of m.values()) {
            arr.sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b)));
        }
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [dayFlights]);

    const windowEndMin = windowStartMin + TIMELINE_WINDOW_HOURS * 60;

    const hourTickLabels = useMemo(
        () =>
            Array.from({ length: TIMELINE_WINDOW_HOURS + 1 }, (_, i) => windowStartMin + i * 60).map(formatHm),
        [windowStartMin],
    );

    const toolbar = (
        <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-600">
                <Clock className="w-4 h-4 text-cyan-600 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Ventana {formatHm(windowStartMin)} – {formatHm(windowEndMin)}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
                {TIMELINE_SHIFT_HOURS.map((h) => (
                    <button
                        key={`shift-${-h}`}
                        type="button"
                        onClick={() => shiftWindow(-h)}
                        className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-600 shadow-sm hover:bg-slate-100 hover:border-cyan-300 transition-colors"
                        title={`${h} h atrás`}
                    >
                        −{h}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setWindowStartMin(defaultTimelineWindowStartMin(selectedDate))}
                    className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cyan-900 shadow-sm hover:bg-cyan-100 transition-colors mx-0.5"
                    title="Centrar en hora actual"
                >
                    Ahora
                </button>
                {TIMELINE_SHIFT_HOURS.map((h) => (
                    <button
                        key={`shift-${h}`}
                        type="button"
                        onClick={() => shiftWindow(h)}
                        className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-600 shadow-sm hover:bg-slate-100 hover:border-cyan-300 transition-colors"
                        title={`${h} h adelante`}
                    >
                        +{h}
                    </button>
                ))}
            </div>
        </div>
    );

    const legend = (
        <div className="px-4 sm:px-5 py-2 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-white">
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-slate-400 border border-slate-500/40" />
                Programado
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
                A horario · progreso
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
                Demora
            </span>
            <span className="text-slate-400 normal-case font-semibold">Doble clic en un vuelo para ver detalle</span>
        </div>
    );

    const grid = (
        <div className={`${standalone ? "px-2 sm:px-4 pb-4" : "px-4 pb-4 pt-0"}`}>
            {byRegistration.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No hay vuelos para esta fecha.</p>
            ) : (
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-[minmax(8.5rem,11rem)_1fr] border-b border-slate-200 bg-slate-50/95">
                        <div className="px-3 py-2.5 flex items-end border-r border-slate-200/70">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Matrícula
                            </span>
                        </div>
                        <div className="px-2 py-2 min-w-0">
                            <div className="grid grid-cols-9 gap-0">
                                {hourTickLabels.map((label, i) => (
                                    <span
                                        key={`tick-${i}`}
                                        className={`text-[10px] font-black text-slate-500 tabular-nums ${
                                            i === 0
                                                ? "text-left"
                                                : i === TIMELINE_WINDOW_HOURS
                                                  ? "text-right"
                                                  : "text-center"
                                        }`}
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {byRegistration.map(([reg, list], rowIdx) => (
                        <Fragment key={reg}>
                            <div
                                className={`grid grid-cols-[minmax(8.5rem,11rem)_1fr] ${
                                    rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                }`}
                            >
                                <div className="px-3 py-2 flex flex-col justify-center border-r border-slate-100 min-h-[3.25rem]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Plane className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                        <span className="font-black text-sm text-slate-900 truncate tabular-nums">
                                            {reg}
                                        </span>
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
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {Array.from({ length: TIMELINE_WINDOW_HOURS }, (_, i) => (
                                            <div
                                                key={`grid-${reg}-${i}`}
                                                className={`flex-1 border-l border-slate-200/70 first:border-l-0 ${
                                                    i % 2 === 0 ? "bg-slate-50/35" : "bg-transparent"
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300/70 z-0" />

                                    {list.map((f) => {
                                        const std = f.std?.trim() || "";
                                        const sta = f.sta?.trim() || "";
                                        const segments = flightDaySegments(std, sta);
                                        return segments.map(([segStart, segEnd], si) => {
                                            const clipped = clipSegmentToWindow(
                                                segStart,
                                                segEnd,
                                                windowStartMin,
                                                windowEndMin,
                                            );
                                            if (!clipped) return null;
                                            const { leftPct, widthPct } = clipped;
                                            const minW = widthPct < 8 ? 8 : widthPct;
                                            const label = `${getAirlinePrefix(f.flt)}${f.flt}`;
                                            const paint = computeTimelineFlightPaint(
                                                f,
                                                segStart,
                                                segEnd,
                                                nowMin,
                                            );

                                            return (
                                                <div
                                                    key={`${f.id}-${si}-${segStart}`}
                                                    title={`${label} ${f.dep}→${f.arr} · STD ${std} STA ${sta}`}
                                                    onDoubleClick={() => setDetailFlight(f)}
                                                    className={`absolute top-1/2 z-[1] -translate-y-1/2 min-h-[2.35rem] rounded-lg bg-slate-400 border border-slate-500/50 text-white shadow-md overflow-hidden hover:z-[2] hover:ring-2 hover:ring-cyan-400/60 cursor-pointer transition-shadow ${
                                                        f.cancelled ? "opacity-50" : ""
                                                    }`}
                                                    style={{
                                                        left: `${leftPct}%`,
                                                        width: `${minW}%`,
                                                        minWidth: "72px",
                                                    }}
                                                >
                                                    {paint.layers.map((layer, li) => (
                                                        <div
                                                            key={li}
                                                            className={`absolute inset-y-0 ${
                                                                layer.color === "red"
                                                                    ? "bg-red-500"
                                                                    : "bg-emerald-500"
                                                            }`}
                                                            style={{
                                                                left: `${layer.leftPct}%`,
                                                                width: `${layer.widthPct}%`,
                                                            }}
                                                        />
                                                    ))}
                                                    <div className="relative z-[1] flex h-full w-full min-w-0 items-center justify-between gap-0.5 px-1 sm:px-1.5 py-0.5">
                                                        <span className="shrink-0 text-[8px] sm:text-[10px] font-black leading-tight tracking-tight text-white drop-shadow-sm">
                                                            {f.dep}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate text-center text-[8px] sm:text-[10px] font-black leading-tight px-0.5 drop-shadow-sm">
                                                            {label}
                                                        </span>
                                                        <span className="shrink-0 text-[8px] sm:text-[10px] font-black leading-tight tracking-tight text-white drop-shadow-sm">
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
                    ))}
                </div>
            )}
        </div>
    );

    const body = (
        <>
            {toolbar}
            {legend}
            {grid}
        </>
    );

    return (
        <>
            {standalone ? (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden ring-1 ring-slate-200/80 min-h-[calc(100vh-12rem)]">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-cyan-50/40 to-slate-50">
                        <div className="flex items-center gap-2 min-w-0">
                            <GanttChartSquare className="w-5 h-5 text-cyan-600 shrink-0" />
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                                Línea de tiempo
                            </h3>
                        </div>
                        <span className="text-xs font-bold text-slate-500 sm:ml-auto tabular-nums">
                            {selectedDate}
                        </span>
                    </div>
                    <div className="animate-in fade-in duration-200">{body}</div>
                </div>
            ) : (
                <div className="animate-in fade-in duration-200">{body}</div>
            )}

            {detailFlight ? (
                <ControlTimelineFlightDetailModal flight={detailFlight} onClose={() => setDetailFlight(null)} />
            ) : null}
        </>
    );
}
