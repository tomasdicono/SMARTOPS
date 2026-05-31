import { useState, useEffect, useMemo } from "react";
import { GANTT_CHARTS } from "../lib/hitosData";
import { getAircraftInfo } from "../lib/fleetData";
import type { Flight, HitosData } from "../types";
import { normalizeHitosData } from "../lib/flightDataNormalize";
import { getHitosDepartureTime } from "../lib/flightHelpers";
import {
    HITO_MILESTONE_HINTS,
    formatMins,
    getEmbarqueTimesFromHitosEntries,
    getMilestoneLimitLabel,
    getMilestoneTargetMinutes,
    hitosRevisarWarning,
    isActiveMilestone,
    parseToMins,
} from "../lib/hitosReference";
import {
    hhmmDurationMinutes,
    MAX_BOARDING_DURATION_MINUTES,
    MAX_GPU_DURATION_MINUTES,
    parseHHmmToMinutes,
    validateHhmmEndNotBeforeStart,
} from "../lib/controlHelpers";
import { formatMinutesToHHMM } from "../lib/mvtTime";
import { useDebouncedFlightPersist } from "../lib/useDebouncedFlightPersist";
import { Save, AlertCircle, AlertTriangle, Clock, Zap, Lock } from "lucide-react";

interface Props {
    flight: Flight;
    readOnly?: boolean;
    /** HCC / AJS: permitir correcciones aunque hitosSentAt ya esté cargado */
    canEditAfterSent?: boolean;
    onSave: (hitosData: HitosData) => void;
    /** Guardado automático en Firebase (sin validar) para no perder progreso al refrescar */
    onPersistHitos?: (hitosData: HitosData) => void;
}

export function HitosTab({ flight, readOnly, canEditAfterSent, onSave, onPersistHitos }: Props) {
    const [revisarMsg, setRevisarMsg] = useState("");
    const [data, setData] = useState<HitosData>(() => normalizeHitosData(flight.hitosData));
    const hitosSent =
        flight.hitosData?.hitosSentAt != null && String(flight.hitosData.hitosSentAt).trim() !== "";
    const lockedAfterSend = hitosSent && !canEditAfterSent;
    const canPersist = !readOnly && (!hitosSent || !!canEditAfterSent);

    useEffect(() => {
        setData(normalizeHitosData(flight.hitosData));
    }, [flight.id]);

    useEffect(() => {
        if (!readOnly && !lockedAfterSend) return;
        setData(normalizeHitosData(flight.hitosData));
    }, [flight.hitosData, readOnly, lockedAfterSend, flight.id]);

    useDebouncedFlightPersist(data, canPersist ? onPersistHitos : undefined, {
        readOnly: !canPersist,
        flightId: flight.id,
    });

    const selectedChart = GANTT_CHARTS.find(c => c.name === data.ganttChartName);
    const is1stWave = selectedChart?.name.includes("1ST WAVE") || false;

    const hitosRefTime = getHitosDepartureTime(flight);
    const stdProg = String(flight.std ?? "");
    let refMinutes = parseToMins(hitosRefTime);
    let etdFromAtaMinutes: number | null = null;

    if (selectedChart && !is1stWave && (data.ata ?? "").length >= 3) {
        const ataMins = parseToMins(data.ata.padStart(4, "0"));
        etdFromAtaMinutes = ataMins + selectedChart.tatMinutes;
        if (etdFromAtaMinutes > refMinutes) {
            refMinutes = etdFromAtaMinutes;
        }
    }

    const handleChange = (field: string, val: string) => {
        const cln = val.replace(/[^0-9]/g, '').slice(0, 4);
        setData(p => ({ ...p, [field]: cln }));
    };

    const handleGpuField = (field: "gpuStart" | "gpuEnd", val: string) => {
        const cln = val.replace(/[^0-9]/g, "").slice(0, 4);
        setData((p) => {
            const nextStart = field === "gpuStart" ? cln : (p.gpuStart ?? "");
            const nextEnd = field === "gpuEnd" ? cln : (p.gpuEnd ?? "");
            const hasAny =
                Boolean(nextStart.replace(/\D/g, "")) || Boolean(nextEnd.replace(/\D/g, ""));
            return { ...p, [field]: cln, gpuNotUsed: hasAny ? false : p.gpuNotUsed };
        });
    };

    const handleGpuNotUsed = (checked: boolean) => {
        setData((p) => ({
            ...p,
            gpuNotUsed: checked,
            ...(checked ? { gpuStart: "", gpuEnd: "" } : {}),
        }));
    };

    const handleEntryChange = (name: string, val: string) => {
        const cln = val.replace(/[^0-9]/g, '').slice(0, 4);
        setData(p => ({ ...p, entries: { ...p.entries, [name]: cln } }));
    };

    const handleSave = () => {
        if (!selectedChart) {
            setRevisarMsg(hitosRevisarWarning("Carta de referencia"));
            return;
        }

        const requiredMs = selectedChart.milestones.filter(m => isActiveMilestone(m) && m.name !== "Inicio búsqueda de equipaje");
        for (const m of requiredMs) {
            const val = data.entries[m.name];
            if (!val || val.trim() === "") {
                setRevisarMsg(hitosRevisarWarning(m.name));
                return;
            }
        }

        if (!is1stWave && (!data.ata || data.ata.trim() === "")) {
            setRevisarMsg(hitosRevisarWarning("ATA (Llegada)"));
            return;
        }

        if (!data.gpuNotUsed) {
            const gpuWarn = validateHhmmEndNotBeforeStart(data.gpuStart, data.gpuEnd, {
                hitoLabel: "Control de GPU",
                maxMinutes: MAX_GPU_DURATION_MINUTES,
            });
            if (gpuWarn) {
                setRevisarMsg(gpuWarn);
                return;
            }
        }

        const { start: embStart, end: embEnd } = getEmbarqueTimesFromHitosEntries(data.entries);
        const embWarn = validateHhmmEndNotBeforeStart(embStart, embEnd, {
            hitoLabel: "Fin embarque",
            maxMinutes: MAX_BOARDING_DURATION_MINUTES,
        });
        if (embWarn) {
            setRevisarMsg(embWarn);
            return;
        }

        setRevisarMsg("");
        onSave(data);
    };

    const gpuDurationPreview = useMemo(() => {
        if (data.gpuNotUsed) return null;
        return hhmmDurationMinutes(data.gpuStart, data.gpuEnd, { maxMinutes: MAX_GPU_DURATION_MINUTES });
    }, [data.gpuStart, data.gpuEnd, data.gpuNotUsed]);

    const embarqueDurationPreview = useMemo(() => {
        const { start, end } = getEmbarqueTimesFromHitosEntries(data.entries);
        return hhmmDurationMinutes(start, end, { maxMinutes: MAX_BOARDING_DURATION_MINUTES });
    }, [data.entries]);

    return (
        <fieldset disabled={readOnly} className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto custom-scrollbar border-none m-0">
            {hitosSent ? (
                <div
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm mb-4 ${canEditAfterSent ? "border-cyan-200 bg-cyan-50 text-cyan-950" : "border-slate-200 bg-slate-100 text-slate-800"}`}
                >
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    <p className="font-semibold leading-snug">
                        {canEditAfterSent
                            ? "Hitos enviados. Podés corregir cualquier dato y guardar con «Guardar Hitos»."
                            : "Hitos enviados. El formulario no puede editarse."}
                    </p>
                </div>
            ) : null}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
                <div className="space-y-4 mb-6 pb-6 border-b border-slate-100">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden />
                            Control de GPU
                        </p>
                        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                            <div className="min-w-[7rem]">
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Inicio uso</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={data.gpuStart ?? ""}
                                    onChange={(e) => handleGpuField("gpuStart", e.target.value)}
                                    placeholder="Ej: 1430"
                                    disabled={!!data.gpuNotUsed}
                                    className="w-full bg-slate-50 border border-input p-2.5 rounded-xl focus:ring-2 focus:ring-primary focus:outline-none font-mono text-base font-bold placeholder:font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="min-w-[7rem]">
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Fin uso</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={data.gpuEnd ?? ""}
                                    onChange={(e) => handleGpuField("gpuEnd", e.target.value)}
                                    placeholder="Ej: 1515"
                                    disabled={!!data.gpuNotUsed}
                                    className="w-full bg-slate-50 border border-input p-2.5 rounded-xl focus:ring-2 focus:ring-primary focus:outline-none font-mono text-base font-bold placeholder:font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-bold text-slate-800 cursor-pointer hover:bg-slate-100 transition-colors mb-0.5">
                                <input
                                    type="checkbox"
                                    checked={!!data.gpuNotUsed}
                                    onChange={(e) => handleGpuNotUsed(e.target.checked)}
                                    className="rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                No se utilizó GPU
                            </label>
                        </div>
                        {gpuDurationPreview != null ? (
                            <p className="text-[11px] font-semibold text-amber-800/90 mt-1">
                                Duración GPU:{" "}
                                <span className="font-black tabular-nums">
                                    {formatMinutesToHHMM(gpuDurationPreview)}
                                </span>
                                {parseHHmmToMinutes(data.gpuEnd) < parseHHmmToMinutes(data.gpuStart) ? (
                                    <span className="text-amber-700/80"> (cruce de medianoche)</span>
                                ) : null}
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                            PEA{" "}
                            <span className="normal-case font-semibold text-slate-500 font-normal">
                                (posición de estacionamiento de aeronaves)
                            </span>
                        </p>
                        <div className="flex flex-wrap gap-4 sm:gap-6" role="radiogroup" aria-label="PEA">
                            <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`pea-${flight.id}`}
                                    checked={(data.peaPosition ?? "") === "remota"}
                                    onChange={() => setData((p) => ({ ...p, peaPosition: "remota" }))}
                                    className="border-slate-300 text-primary focus:ring-primary"
                                />
                                Remota
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`pea-${flight.id}`}
                                    checked={(data.peaPosition ?? "") === "manga"}
                                    onChange={() => setData((p) => ({ ...p, peaPosition: "manga" }))}
                                    className="border-slate-300 text-primary focus:ring-primary"
                                />
                                Manga
                            </label>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Carta de Referencia</label>
                        <select
                            value={data.ganttChartName}
                            onChange={(e) =>
                                setData((p) => ({
                                    ...p,
                                    ganttChartName: e.target.value,
                                    ata: "",
                                    entries: {},
                                }))
                            }
                            className="w-full bg-slate-50 border border-input p-3 rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all font-bold"
                        >
                            <option value="">Selecciona Carta...</option>
                            {GANTT_CHARTS.filter(c => {
                                const acInfo = getAircraftInfo(flight.reg);
                                const is321 = acInfo?.model.includes("321");
                                return is321 ? c.name.includes("A321") : c.name.includes("A320");
                            }).map(c => <option key={c.name} value={c.name}>{c.name} ({c.tatMinutes}m)</option>)}
                        </select>
                    </div>

                    {selectedChart && !is1stWave && (
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">ATA (Llegada)</label>
                            <input
                                type="text"
                                value={data.ata}
                                onChange={(e) => handleChange('ata', e.target.value)}
                                placeholder="Ej: 1430"
                                className="w-full bg-slate-50 border border-input p-3 rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all font-mono text-lg font-bold placeholder:font-sans"
                            />
                        </div>
                    )}
                </div>

                {selectedChart && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                        <div className="flex flex-col gap-1">
                            <div>
                                <span className="text-muted-foreground font-bold mr-2">Referencia hitos (ETD o STD):</span>
                                <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded font-bold">
                                    {hitosRefTime || "—"}{flight.etd?.trim() ? " ETD" : " STD"}
                                </span>
                            </div>
                            {flight.etd?.trim() ? (
                                <p className="text-xs text-slate-500 font-semibold">
                                    STD programación (MVT): <span className="font-mono text-slate-700">{stdProg || "—"}</span>
                                </p>
                            ) : null}
                        </div>
                        {etdFromAtaMinutes !== null && etdFromAtaMinutes > parseToMins(hitosRefTime) && (
                            <div className="flex items-center gap-1.5 text-orange-600 font-bold bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 shrink-0">
                                <AlertCircle className="w-4 h-4" />
                                ETD desde ATA+TAT: {formatMins(etdFromAtaMinutes)} LT
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedChart ? (
                <div className="flex-1 min-h-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-6">
                        <Clock className="w-5 h-5 text-primary" />
                        Control de Hitos ({selectedChart.name})
                    </h3>

                    {embarqueDurationPreview != null ? (
                        <p className="text-[11px] font-semibold text-slate-600 mb-4 -mt-2">
                            Duración de embarque:{" "}
                            <span className="font-black text-slate-800 tabular-nums">
                                {formatMinutesToHHMM(embarqueDurationPreview)}
                            </span>
                        </p>
                    ) : null}
                    <div className="space-y-4 flex-1">
                        {selectedChart.milestones.filter(m => isActiveMilestone(m)).map((m, idx) => {
                            const targetMins = getMilestoneTargetMinutes(flight, data, selectedChart, m);
                            const target = targetMins != null ? formatMins(targetMins) : "—";
                            const val = data.entries[m.name] || "";

                            let statusColor = "bg-slate-100 text-slate-400";
                            let statusText = "Pendiente";

                            if (val.length >= 3 && targetMins != null) {
                                const valMins = parseToMins(val.padStart(4, "0"));
                                if (valMins > targetMins && valMins - targetMins < 600) {
                                    statusColor = "bg-red-50 text-red-600 border-red-200";
                                    statusText = "Retraso";
                                } else {
                                    statusColor = "bg-emerald-50 text-emerald-600 border-emerald-200";
                                    statusText = "A Tiempo";
                                }
                            }

                            return (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:border-primary/30 transition-colors">
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800">{m.name}</div>
                                        {HITO_MILESTONE_HINTS[m.name] ? (
                                            <p className="text-[11px] text-slate-500 font-medium mt-0.5 normal-case">
                                                {HITO_MILESTONE_HINTS[m.name]}
                                            </p>
                                        ) : null}
                                        <div className="text-xs text-muted-foreground mt-0.5 font-bold">{getMilestoneLimitLabel(m)}</div>
                                    </div>

                                    <div className="flex flex-wrap justify-start sm:justify-end items-center gap-3 sm:gap-4 w-full sm:w-auto mt-3 sm:mt-0">
                                        <div className="flex flex-col items-center bg-white px-3 sm:px-4 py-2 rounded-lg border border-slate-200 shadow-sm min-w-[70px] sm:min-w-[80px]">
                                            <span className="text-[10px] font-black text-primary uppercase">Target</span>
                                            <span className="font-mono text-lg font-bold">{target}</span>
                                        </div>

                                        <input
                                            type="text"
                                            placeholder="Real"
                                            value={val}
                                            onChange={(e) => handleEntryChange(m.name, e.target.value)}
                                            className="w-20 sm:w-24 bg-white border-2 border-slate-200 p-2 sm:p-2.5 rounded-lg text-center font-mono text-lg font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:font-sans placeholder:text-sm placeholder:font-normal"
                                        />

                                        <div className={`flex-1 sm:flex-none min-w-[100px] w-full sm:w-28 text-center text-xs font-bold py-2 rounded-lg border ${statusColor}`}>
                                            {statusText}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!readOnly && (
                        <div className="pt-6 mt-4 border-t border-slate-100 flex flex-col items-end gap-3">
                            <p className="text-xs text-slate-500 w-full text-right">
                                Progreso guardado automáticamente; al actualizar la página no se pierde.
                            </p>
                            {revisarMsg && (
                                <div
                                    role="alert"
                                    className="w-full text-amber-900 font-bold text-sm flex items-center gap-2 animate-in slide-in-from-right-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
                                >
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" aria-hidden />
                                    {revisarMsg}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={handleSave}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-black shadow-md transition-all flex items-center gap-2 hover:-translate-y-0.5"
                            >
                                <Save className="w-5 h-5" />
                                Guardar Hitos
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center flex-1 min-h-0 text-muted-foreground p-8 opacity-60">
                    <Clock className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg font-bold">Sin carta seleccionada</p>
                    <p className="text-sm">Selecciona una Carta Gantt desde arriba para iniciar el control de hitos.</p>
                </div>
            )}
        </fieldset>
    );
}
