import React, { useMemo } from "react";
import type { Flight } from "../types";
import { computePeaHourlyDistribution } from "../lib/controlHelpers";
import { Building2, MapPin, X, TrendingUp, BarChart2 } from "lucide-react";

interface Props {
    flights: Flight[];
    peaType: "manga" | "remota";
    periodDayCount: number;
    onClose: () => void;
}

export const ControlPeaHourlyChart: React.FC<Props> = ({
    flights,
    peaType,
    periodDayCount,
    onClose,
}) => {
    const isManga = peaType === "manga";

    const distribution = useMemo(
        () => computePeaHourlyDistribution(flights, peaType, periodDayCount),
        [flights, peaType, periodDayCount],
    );

    const { slots, maxCount, peakHour, totalWithAtd, totalWithoutAtd } = distribution;

    const safeDays = Math.max(1, periodDayCount);
    const overallDailyAvg = (totalWithAtd / safeDays).toFixed(1);

    const theme = isManga
        ? {
              cardBg: "bg-gradient-to-br from-violet-50/90 via-purple-50/50 to-white dark:from-violet-950/30 dark:via-purple-950/20 dark:to-slate-900",
              borderColor: "border-violet-200 dark:border-violet-800/60",
              titleColor: "text-violet-950 dark:text-violet-200",
              accentText: "text-violet-600 dark:text-violet-400",
              badgeBg: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300",
              barGradient: "bg-gradient-to-t from-violet-600 to-purple-500 dark:from-violet-500 dark:to-purple-400",
              barHover: "hover:from-violet-500 hover:to-purple-400 dark:hover:from-violet-400 dark:hover:to-purple-300",
              Icon: Building2,
              label: "Manga",
          }
        : {
              cardBg: "bg-gradient-to-br from-sky-50/90 via-cyan-50/50 to-white dark:from-sky-950/30 dark:via-cyan-950/20 dark:to-slate-900",
              borderColor: "border-sky-200 dark:border-sky-800/60",
              titleColor: "text-sky-950 dark:text-sky-200",
              accentText: "text-sky-600 dark:text-sky-400",
              badgeBg: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
              barGradient: "bg-gradient-to-t from-sky-600 to-cyan-500 dark:from-sky-500 dark:to-cyan-400",
              barHover: "hover:from-sky-500 hover:to-cyan-400 dark:hover:from-sky-400 dark:hover:to-cyan-300",
              Icon: MapPin,
              label: "Remota",
          };

    const Icon = theme.Icon;

    return (
        <div
            className={`rounded-2xl border ${theme.borderColor} ${theme.cardBg} p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 relative transition-all`}
        >
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className={`p-1.5 rounded-lg ${theme.badgeBg}`}>
                            <Icon className="w-4 h-4" aria-hidden />
                        </span>
                        <h3 className={`text-base font-black tracking-tight ${theme.titleColor}`}>
                            Distribución de uso de {theme.label} por hora de salida (ATD)
                        </h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Frecuencia acumulada y promedio diario por franja horaria en el período ({safeDays} día{safeDays !== 1 ? "s" : ""})
                    </p>
                </div>

                <button
                    onClick={onClose}
                    type="button"
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Cerrar gráfico"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Metrics overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60 shadow-xs">
                    <span className="text-slate-400 dark:text-slate-400 font-semibold block">Total con {theme.label}</span>
                    <span className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums">
                        {totalWithAtd}
                    </span>
                    <span className="text-[10px] text-slate-500 block">vuelos con ATD</span>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60 shadow-xs">
                    <span className="text-slate-400 dark:text-slate-400 font-semibold block">Promedio diario global</span>
                    <span className={`text-lg font-black ${theme.accentText} tabular-nums`}>
                        {overallDailyAvg}
                    </span>
                    <span className="text-[10px] text-slate-500 block">vuelos / día</span>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60 shadow-xs">
                    <span className="text-slate-400 dark:text-slate-400 font-semibold block flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                        Hora pico
                    </span>
                    <span className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums">
                        {peakHour != null && maxCount > 0 ? `${peakHour.toString().padStart(2, "0")}:00 hs` : "—"}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                        {peakHour != null && maxCount > 0 ? `${maxCount} vuelos (${(maxCount / safeDays).toFixed(1)}/día)` : "Sin datos"}
                    </span>
                </div>

                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60 shadow-xs">
                    <span className="text-slate-400 dark:text-slate-400 font-semibold block">Sin ATD cargado</span>
                    <span className="text-lg font-black text-slate-600 dark:text-slate-300 tabular-nums">
                        {totalWithoutAtd}
                    </span>
                    <span className="text-[10px] text-slate-500 block">vuelos sin hora ATD</span>
                </div>
            </div>

            {/* Bar Chart Container */}
            <div className="bg-white/90 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 pt-6 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    <span className="flex items-center gap-1">
                        <BarChart2 className="w-3.5 h-3.5" />
                        Cantidad promedio por día según hora de salida ATD
                    </span>
                    <span>Franja 00:00 a 23:59 hs</span>
                </div>

                {/* 24-Hour Bar Graph */}
                <div className="h-44 w-full flex items-end gap-1 sm:gap-1.5 pt-6 pb-2 px-1 relative border-b border-slate-200 dark:border-slate-800">
                    {slots.map((slot) => {
                        const heightPct = maxCount > 0 ? (slot.count / maxCount) * 100 : 0;
                        const displayAvg = slot.avgPerDay > 0 ? slot.avgPerDay.toFixed(1) : "";

                        return (
                            <div
                                key={slot.hour}
                                className="flex-1 flex flex-col items-center h-full justify-end group relative"
                            >
                                {/* Tooltip on hover */}
                                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30 min-w-[130px]">
                                    <div className="bg-slate-900/95 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg py-1.5 px-2.5 text-[11px] shadow-xl border border-slate-700/50 whitespace-nowrap space-y-0.5">
                                        <div className="font-black border-b border-slate-700/60 dark:border-slate-300/60 pb-0.5">
                                            {slot.hourLabel}
                                        </div>
                                        <div>
                                            <span className="opacity-70">Promedio: </span>
                                            <span className="font-bold">{slot.avgPerDay.toFixed(1)} / día</span>
                                        </div>
                                        <div>
                                            <span className="opacity-70">Acumulado: </span>
                                            <span className="font-bold">{slot.count} vuelos</span>
                                        </div>
                                        <div>
                                            <span className="opacity-70">% de {theme.label}: </span>
                                            <span className="font-bold">{slot.pctOfTotalPea.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="w-2 h-2 bg-slate-900 dark:bg-slate-100 rotate-45 -mt-1"></div>
                                </div>

                                {/* Label above bar */}
                                {slot.count > 0 && (
                                    <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 mb-1 tabular-nums transition-opacity">
                                        {displayAvg}
                                    </span>
                                )}

                                {/* Bar element */}
                                <div className="w-full flex-1 flex items-end justify-center">
                                    <div
                                        style={{ height: `${Math.max(slot.count > 0 ? 8 : 2, heightPct)}%` }}
                                        className={`w-full rounded-t-md transition-all duration-300 ${
                                            slot.count > 0
                                                ? `${theme.barGradient} ${theme.barHover} cursor-pointer shadow-xs`
                                                : "bg-slate-100 dark:bg-slate-800/50"
                                        }`}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* X-axis hour labels */}
                <div className="flex w-full justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1 px-0.5">
                    {slots.map((slot) => {
                        const showLabel = slot.hour % 2 === 0;
                        return (
                            <div key={slot.hour} className="flex-1 text-center">
                                {showLabel ? `${slot.hour.toString().padStart(2, "0")}h` : ""}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Note */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic text-center">
                * Los números sobre cada barra indican el promedio de vuelos por día desplegados en esa hora según su hora de salida real (ATD).
            </p>
        </div>
    );
};
