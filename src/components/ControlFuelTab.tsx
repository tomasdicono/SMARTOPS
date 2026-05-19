import { useEffect, useMemo, useState } from "react";
import type { Flight } from "../types";
import {
    addDaysIso,
    computeAverageFobByDestination,
    countDaysInclusiveIso,
    filterFlightsForStats,
    filterFlightsForStatsDepartureOnly,
    normalizeIsoDateRange,
    startOfMonthIso,
} from "../lib/controlHelpers";
import type { AverageFobByDestinationRow } from "../lib/controlHelpers";
import {
    computeFuelDelayRateTotals,
    computeFuelDelaysByDestination,
    formatFuelDelayRate,
    fuelDelayRateTitle,
    fuelSupplierCellClass,
    fuelSupplierLabel,
    fuelSupplierRowClass,
    getFuelSupplier,
    type FuelDelayRateCell,
    type FuelSupplier,
} from "../lib/fuelSupplier";
import { Clock, Flame } from "lucide-react";
import { ControlAirportMultiSelect } from "./ControlAirportMultiSelect";

function resolveFuelRowSupplier(
    row: AverageFobByDestinationRow,
    fuelAirport: string,
): { supplier: FuelSupplier | null; mixed: boolean } {
    const hub = fuelAirport.trim().toUpperCase();
    if (hub === "AEP" || hub === "EZE") {
        return { supplier: getFuelSupplier(hub, row.destination), mixed: false };
    }
    if (hub === "COR") {
        return { supplier: row.supplier, mixed: row.supplierMixed };
    }
    if (hub) {
        return { supplier: "ypf", mixed: false };
    }
    return { supplier: row.supplier, mixed: row.supplierMixed };
}

type FuelRangePreset = "day" | "week" | "month" | "30" | null;

interface Props {
    flights: Flight[];
    /** Fecha del header (ancla para presets «Hoy», 7 días, etc.) */
    selectedDate: string;
    selectedAirports: string[];
    onAirportsChange: (airports: string[]) => void;
    airportOptions: string[];
}

export function ControlFuelTab({ flights, selectedDate, selectedAirports, onAirportsChange, airportOptions }: Props) {
    const [fuelDateFrom, setFuelDateFrom] = useState(selectedDate);
    const [fuelDateTo, setFuelDateTo] = useState(selectedDate);
    const [fuelRangePreset, setFuelRangePreset] = useState<FuelRangePreset>("day");
    useEffect(() => {
        setFuelDateFrom(selectedDate);
        setFuelDateTo(selectedDate);
        setFuelRangePreset("day");
    }, [selectedDate]);

    const applyFuelRangePreset = (preset: Exclude<FuelRangePreset, null>) => {
        const anchor = selectedDate;
        if (!anchor) return;
        setFuelRangePreset(preset);
        if (preset === "day") {
            setFuelDateFrom(anchor);
            setFuelDateTo(anchor);
        } else if (preset === "week") {
            setFuelDateFrom(addDaysIso(anchor, -6));
            setFuelDateTo(anchor);
        } else if (preset === "30") {
            setFuelDateFrom(addDaysIso(anchor, -29));
            setFuelDateTo(anchor);
        } else if (preset === "month") {
            setFuelDateFrom(startOfMonthIso(anchor));
            setFuelDateTo(anchor);
        }
    };

    const fuelScopeFlights = useMemo(() => {
        const inRange =
            selectedAirports.length > 0
                ? filterFlightsForStatsDepartureOnly(flights, fuelDateFrom, fuelDateTo, selectedAirports)
                : filterFlightsForStats(flights, fuelDateFrom, fuelDateTo, "");
        return inRange.filter((f) => !f.cancelled);
    }, [flights, fuelDateFrom, fuelDateTo, selectedAirports]);

    const fuelByDestination = useMemo(
        () => computeAverageFobByDestination(fuelScopeFlights),
        [fuelScopeFlights]
    );

    const fuelDelaysByDestination = useMemo(
        () => computeFuelDelaysByDestination(fuelScopeFlights),
        [fuelScopeFlights]
    );

    const fuelDelayTotals = useMemo(
        () => computeFuelDelayRateTotals(fuelScopeFlights),
        [fuelScopeFlights]
    );

    const hasFuelDelayOperatedFlights = useMemo(
        () =>
            fuelDelayTotals.axion.operated + fuelDelayTotals.shell.operated + fuelDelayTotals.ypf.operated >
            0,
        [fuelDelayTotals]
    );

    const fuelFlightsWithFob = useMemo(
        () => fuelByDestination.reduce((s, r) => s + r.flightCount, 0),
        [fuelByDestination]
    );

    const fuelOverallAvgKg = useMemo(() => {
        if (fuelFlightsWithFob === 0) return null;
        const total = fuelByDestination.reduce((s, r) => s + r.totalKg, 0);
        return total / fuelFlightsWithFob;
    }, [fuelByDestination, fuelFlightsWithFob]);

    const fuelRangeLabel = useMemo(() => {
        const { lo, hi } = normalizeIsoDateRange(fuelDateFrom, fuelDateTo);
        if (!lo || !hi) return "";
        const d0 = new Date(`${lo}T12:00:00`);
        const d1 = new Date(`${hi}T12:00:00`);
        const f0 = d0.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
        const f1 = d1.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
        const days = countDaysInclusiveIso(lo, hi);
        if (lo === hi) return f0;
        return `${f0} – ${f1} · ${days} día${days !== 1 ? "s" : ""}`;
    }, [fuelDateFrom, fuelDateTo]);

    const fuelHubForSupplier = selectedAirports.length === 1 ? selectedAirports[0] : "";
    const fuelAirportsLabel = selectedAirports.length > 0 ? selectedAirports.join(", ") : "";

    return (
        <div className="animate-in fade-in duration-200">
            <div className="p-5 space-y-5">
                <div className="flex flex-wrap gap-2">
                    {(
                        [
                            { id: "day" as const, label: "Hoy" },
                            { id: "week" as const, label: "7 días" },
                            { id: "30" as const, label: "30 días" },
                            { id: "month" as const, label: "Mes en curso" },
                        ] as const
                    ).map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => applyFuelRangePreset(id)}
                            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-all border ${
                                fuelRangePreset === id
                                    ? "bg-orange-600 text-white border-orange-600 shadow-md"
                                    : "bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:bg-orange-50"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <div className="shrink-0">
                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Desde</label>
                        <input
                            type="date"
                            value={fuelDateFrom}
                            onChange={(e) => {
                                setFuelRangePreset(null);
                                setFuelDateFrom(e.target.value);
                            }}
                            max={fuelDateTo || undefined}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                        />
                    </div>
                    <div className="shrink-0">
                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Hasta</label>
                        <input
                            type="date"
                            value={fuelDateTo}
                            onChange={(e) => {
                                setFuelRangePreset(null);
                                setFuelDateTo(e.target.value);
                            }}
                            min={fuelDateFrom || undefined}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 [color-scheme:light] w-[min(100%,11rem)]"
                        />
                    </div>
                    <ControlAirportMultiSelect
                        options={airportOptions}
                        selected={selectedAirports}
                        onChange={onAirportsChange}
                        label="Aeropuertos"
                        emptyHint="Todas las escalas (salida)"
                    />
                </div>

                <p className="text-[11px] text-slate-500 max-w-2xl leading-snug">
                    Promedio de <span className="font-bold text-slate-700">FOB (kg)</span> del MVT por aeropuerto de
                    destino. Solo vuelos operativos con FOB informado en el período
                    {fuelAirportsLabel ? " (solo vuelos con salida desde el/los aeropuerto(s) elegidos)" : ""}.
                </p>
                {fuelRangeLabel || fuelAirportsLabel ? (
                    <p className="text-xs font-semibold text-slate-600">
                        {fuelRangeLabel ? (
                            <>
                                Período:{" "}
                                <span className="font-black text-slate-800 tabular-nums">{fuelRangeLabel}</span>
                            </>
                        ) : null}
                        {fuelRangeLabel && fuelAirportsLabel ? " · " : null}
                        {fuelAirportsLabel ? (
                            <>
                                Aeropuerto(s): <span className="font-black text-slate-800">{fuelAirportsLabel}</span>
                            </>
                        ) : null}
                    </p>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                    <div className="rounded-xl border border-orange-200 p-4 bg-gradient-to-br from-orange-50/80 to-white">
                        <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-orange-600" aria-hidden />
                            FOB promedio general
                        </p>
                        <p className="text-3xl font-black text-orange-950 mt-2 tabular-nums">
                            {fuelOverallAvgKg != null
                                ? `${Math.round(fuelOverallAvgKg).toLocaleString("es-AR")} kg`
                                : "—"}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                            {fuelFlightsWithFob > 0
                                ? `${fuelFlightsWithFob} vuelo${fuelFlightsWithFob !== 1 ? "s" : ""} con FOB en el filtro`
                                : "Sin FOB en el período"}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/80 flex items-center">
                        <p className="text-xs font-semibold text-slate-600 leading-snug">
                            {fuelByDestination.length > 0
                                ? `${fuelByDestination.length} destino${fuelByDestination.length !== 1 ? "s" : ""} con al menos un vuelo con FOB cargado.`
                                : "Ajustá el rango de fechas o completá el FOB en los MVT."}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-wide text-slate-600">
                    <span className="text-slate-500">Proveedor:</span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-100 px-2 py-1 text-violet-900 border border-violet-300">
                        <span className="w-2 h-2 rounded-sm bg-violet-500" aria-hidden />
                        Axion
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-amber-900 border border-amber-300">
                        <span className="w-2 h-2 rounded-sm bg-amber-400" aria-hidden />
                        Shell
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2 py-1 text-sky-900 border border-sky-400">
                        <span className="w-2 h-2 rounded-sm bg-sky-600" aria-hidden />
                        YPF
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-slate-700 border border-slate-300">
                        <span className="w-2 h-2 rounded-sm bg-slate-400" aria-hidden />
                        Mixto / sin regla
                    </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                    <div className="min-w-0 space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-wide text-orange-900 flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5" aria-hidden />
                            Promedio FOB por destino
                        </h4>
                {fuelByDestination.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-inner">
                        <table className="w-full text-sm min-w-[280px]">
                            <thead>
                                <tr className="bg-orange-50/90 text-left text-[10px] font-black uppercase tracking-wider text-orange-950 border-b border-orange-100">
                                    <th className="px-4 py-3">Destino</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">Promedio FOB (kg)</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">Vuelos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/80">
                                {fuelByDestination.map((row) => {
                                    const { supplier, mixed } = resolveFuelRowSupplier(row, fuelHubForSupplier);
                                    const rowClass = fuelSupplierRowClass(supplier, mixed);
                                    const title = mixed
                                        ? "Varios proveedores según STD / escala de salida"
                                        : supplier
                                          ? fuelSupplierLabel(supplier)
                                          : undefined;
                                    return (
                                        <tr key={row.destination} className={rowClass} title={title}>
                                            <td className="px-4 py-2.5 font-black">
                                                {row.destination}
                                                {supplier && !mixed ? (
                                                    <span className="ml-2 text-[9px] font-black uppercase opacity-80">
                                                        {fuelSupplierLabel(supplier)}
                                                    </span>
                                                ) : mixed ? (
                                                    <span className="ml-2 text-[9px] font-black uppercase opacity-70">
                                                        Mixto
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-black tabular-nums">
                                                {Math.round(row.avgKg).toLocaleString("es-AR")}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums opacity-90">
                                                {row.flightCount}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-slate-500 py-6 text-sm leading-relaxed rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                        {fuelScopeFlights.length === 0
                            ? fuelAirportsLabel
                                ? "Sin vuelos con salida desde el/los aeropuerto(s) elegidos."
                                : "Sin vuelos en el período."
                            : "Sin FOB cargado en el MVT."}
                    </p>
                )}
                    </div>

                    <div className="min-w-0 space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-600" aria-hidden />
                            Demoras combustible (36 / 38)
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-snug -mt-1">
                            % vuelos con demora 36/38 sobre vuelos operados por proveedor (asignación según
                            escala de salida)
                        </p>
                        {hasFuelDelayOperatedFlights ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-inner">
                                <table className="w-full text-sm min-w-[320px]">
                                    <thead>
                                        <tr className="bg-slate-100 text-left text-[10px] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200">
                                            <th className="px-3 py-2.5">Destino</th>
                                            <th className="px-3 py-2.5 text-right whitespace-nowrap text-violet-800">Axion</th>
                                            <th className="px-3 py-2.5 text-right whitespace-nowrap text-amber-800">Shell</th>
                                            <th className="px-3 py-2.5 text-right whitespace-nowrap text-sky-800">YPF</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {fuelDelaysByDestination.map((row) => (
                                            <tr key={row.destination} className="hover:bg-slate-50/80">
                                                <td className="px-3 py-2 font-black text-xs text-slate-900">{row.destination}</td>
                                                {(["axion", "shell", "ypf"] as const).map((sup) => {
                                                    const cell: FuelDelayRateCell = row[sup];
                                                    return (
                                                        <td
                                                            key={sup}
                                                            className={`px-3 py-2 text-right text-xs ${fuelSupplierCellClass(sup, cell.operated > 0 && (cell.delayed > 0 || cell.ratePct === 0))}`}
                                                            title={fuelDelayRateTitle(cell)}
                                                        >
                                                            {formatFuelDelayRate(cell)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200 text-[10px] font-black uppercase">
                                            <td className="px-3 py-2 text-slate-700">Total</td>
                                            {(["axion", "shell", "ypf"] as const).map((sup) => {
                                                const cell = fuelDelayTotals[sup];
                                                return (
                                                    <td
                                                        key={sup}
                                                        className={`px-3 py-2 text-right ${fuelSupplierCellClass(sup, cell.operated > 0)}`}
                                                        title={fuelDelayRateTitle(cell)}
                                                    >
                                                        {formatFuelDelayRate(cell)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (
                            <p className="text-center text-slate-500 py-6 text-sm leading-relaxed rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                                {fuelScopeFlights.length === 0
                                    ? fuelAirportsLabel
                                        ? "Sin vuelos con salida desde el/los aeropuerto(s) elegidos."
                                        : "Sin vuelos en el período."
                                    : "Sin vuelos operados asignables a proveedor en el filtro."}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
