import { useState, useEffect, useMemo } from "react";
import type { Flight } from "../types";
import type { HitosData } from "../types";
import { GANTT_CHARTS } from "../lib/hitosData";
import { getAircraftInfo } from "../lib/fleetData";
import { normalizeHitosData } from "../lib/flightDataNormalize";
import { Clock, Save, AlertCircle } from "lucide-react";
import { getCrewTargetInfo, parseToMins, CREW_STORAGE_KEYS } from "../lib/hitosReference";
import { useDebouncedFlightPersist } from "../lib/useDebouncedFlightPersist";

interface Props {
    flight: Flight;
    readOnly?: boolean;
    onSave: (data: Record<string, string>) => void;
    onPersistCrewHitos?: (data: Record<string, string>) => void;
}

const CREW_MILESTONES = ["Llegada crew", "Inicio embarque", "Fin embarque", "Cierre puertas"];

function splitCrewStorage(raw: Record<string, string> | undefined): {
    ganttChartName: string;
    ata: string;
    entries: Record<string, string>;
} {
    const r = raw || {};
    const ganttChartName = r[CREW_STORAGE_KEYS.gantt] ?? "";
    const ata = r[CREW_STORAGE_KEYS.ata] ?? "";
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
        if (k === CREW_STORAGE_KEYS.gantt || k === CREW_STORAGE_KEYS.ata) continue;
        entries[k] = v;
    }
    return { ganttChartName, ata, entries };
}

function mergeCrewStorage(ganttChartName: string, ata: string, entries: Record<string, string>): Record<string, string> {
    return {
        ...entries,
        [CREW_STORAGE_KEYS.gantt]: ganttChartName,
        [CREW_STORAGE_KEYS.ata]: ata,
    };
}

export function HitosCrewTab({ flight, readOnly, onSave, onPersistCrewHitos }: Props) {
    const [ganttChartName, setGanttChartName] = useState("");
    const [ata, setAta] = useState("");
    const [entries, setEntries] = useState<Record<string, string>>({});
    const [savedState, setSavedState] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        const s = splitCrewStorage(flight.hitosCrewData);
        setGanttChartName(s.ganttChartName);
        setAta(s.ata);
        setEntries(s.entries);
        setErrorMsg("");
    }, [flight.id]);

    const persistPayload = useMemo(
        () => mergeCrewStorage(ganttChartName, ata, entries),
        [ganttChartName, ata, entries]
    );

    useDebouncedFlightPersist(persistPayload, readOnly ? undefined : onPersistCrewHitos, {
        readOnly: !!readOnly,
        flightId: flight.id,
    });

    const crewHitosData: HitosData = useMemo(
        () => normalizeHitosData({ ganttChartName, ata, entries }),
        [ganttChartName, ata, entries]
    );

    const selectedChart = GANTT_CHARTS.find((c) => c.name === ganttChartName);
    const is1stWave = selectedChart?.name.includes("1ST WAVE") || false;

    const handleEntryChange = (name: string, value: string) => {
        const numbersOnly = value.replace(/\D/g, "").slice(0, 4);
        setEntries((prev) => ({ ...prev, [name]: numbersOnly }));
    };

    const handleAtaChange = (val: string) => {
        setAta(val.replace(/[^0-9]/g, "").slice(0, 4));
    };

    const handleSave = () => {
        setErrorMsg("");
        if (!selectedChart) {
            setErrorMsg("Seleccioná una carta Gantt.");
            return;
        }
        if (!is1stWave && (!ata || ata.trim() === "")) {
            setErrorMsg("El ATA (llegada) es obligatorio para esta carta.");
            return;
        }
        for (const name of CREW_MILESTONES) {
            const val = entries[name];
            if (!val || val.trim() === "") {
                setErrorMsg(`Completá el hito "${name}".`);
                return;
            }
        }
        onSave(persistPayload);
        setSavedState(true);
        setTimeout(() => setSavedState(false), 2000);
    };

    return (
        <fieldset disabled={readOnly} className="max-w-3xl mx-auto flex flex-col gap-6 border-none m-0 p-0">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col mb-4">
                <div className="flex items-center gap-3 mb-4">
                    <Clock className="w-8 h-8 text-indigo-500 shrink-0" />
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider text-slate-800">Hitos tripulación</h3>
                        <p className="text-sm font-semibold text-muted-foreground mt-0.5">
                            Elegí la carta y el ATA; los horarios esperados se calculan igual que en operacionales.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                            Carta de referencia
                        </label>
                        <select
                            value={ganttChartName}
                            onChange={(e) => {
                                setGanttChartName(e.target.value);
                                setAta("");
                                setEntries({});
                            }}
                            className="w-full bg-slate-50 border border-input p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-bold"
                        >
                            <option value="">Selecciona carta...</option>
                            {GANTT_CHARTS.filter((c) => {
                                const acInfo = getAircraftInfo(flight.reg);
                                const is321 = acInfo?.model.includes("321");
                                return is321 ? c.name.includes("A321") : c.name.includes("A320");
                            }).map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name} ({c.tatMinutes}m)
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedChart && !is1stWave && (
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                ATA (llegada)
                            </label>
                            <input
                                type="text"
                                value={ata}
                                onChange={(e) => handleAtaChange(e.target.value)}
                                placeholder="Ej: 1430"
                                className="w-full bg-slate-50 border border-input p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono text-lg font-bold placeholder:font-sans"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                {CREW_MILESTONES.map((name, idx) => {
                    const targetInfo = getCrewTargetInfo(flight, crewHitosData, name);
                    const targetLabel = targetInfo?.esperado ?? "—";
                    const val = entries[name] || "";
                    let statusColor = "bg-slate-100 text-slate-400 border-transparent";
                    let statusText = "Pendiente";
                    if (val.length >= 3 && targetInfo) {
                        const valMins = parseToMins(val.padStart(4, "0"));
                        const targetMins = targetInfo.targetMins;
                        if (valMins > targetMins && valMins - targetMins < 600) {
                            statusColor = "bg-red-50 text-red-600 border-red-200";
                            statusText = "Retraso";
                        } else {
                            statusColor = "bg-emerald-50 text-emerald-600 border-emerald-200";
                            statusText = "A Tiempo";
                        }
                    } else if (val.length >= 3 && !targetInfo) {
                        statusColor = "bg-slate-100 text-slate-500 border-slate-200";
                        statusText = "Sin referencia";
                    }

                    return (
                        <div
                            key={idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:border-indigo-500/30 transition-colors shadow-sm"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 text-lg">{name}</div>
                                {targetInfo && (
                                    <div className="text-xs text-muted-foreground mt-0.5 font-bold">
                                        Objetivo según carta tripulación
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap justify-start sm:justify-end items-center gap-3 sm:gap-4 w-full sm:w-auto mt-3 sm:mt-0">
                                <div className="flex flex-col items-center bg-slate-50 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 shadow-sm min-w-[70px] sm:min-w-[80px]">
                                    <span className="text-[10px] font-black text-indigo-600 uppercase">Esperado</span>
                                    <span className="font-mono text-lg font-bold text-slate-900">{targetLabel}</span>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Real"
                                    value={val}
                                    onChange={(e) => handleEntryChange(name, e.target.value)}
                                    className="w-20 sm:w-24 bg-white border-2 border-slate-200 p-2 sm:p-2.5 rounded-lg text-center font-mono text-lg font-bold focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:font-sans placeholder:text-sm placeholder:font-normal"
                                />
                                <div
                                    className={`flex-1 sm:flex-none min-w-[100px] w-full sm:w-28 text-center text-xs font-bold py-2 rounded-lg border ${statusColor}`}
                                >
                                    {statusText === "Retraso" ? (
                                        <span className="inline-flex items-center justify-center gap-1">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                            {statusText}
                                        </span>
                                    ) : (
                                        statusText
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!readOnly && (
                <div className="pt-6 mt-4 border-t border-slate-200 flex flex-col items-end gap-2">
                    {errorMsg && (
                        <div className="text-red-600 font-bold text-sm flex items-center gap-1.5 w-full justify-end">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                        </div>
                    )}
                    <p className="text-xs text-slate-500 w-full text-right">
                        Progreso guardado automáticamente; al actualizar la página no se pierde.
                    </p>
                    <button
                        type="button"
                        onClick={handleSave}
                        className={`px-8 py-4 w-full sm:w-auto rounded-xl font-black shadow-md transition-all flex items-center justify-center gap-2 ${
                            savedState
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white hover:-translate-y-0.5"
                        }`}
                    >
                        <Save className="w-5 h-5" />
                        {savedState ? "Hitos enviados" : "Guardar hitos tripulación"}
                    </button>
                </div>
            )}
        </fieldset>
    );
}
