import { useState, useEffect } from "react";
import type { Flight } from "../types";
import { Clock, Save, AlertCircle } from "lucide-react";
import { getCrewTargetInfo, parseToMins } from "../lib/hitosReference";
import { useDebouncedFlightPersist } from "../lib/useDebouncedFlightPersist";

interface Props {
    flight: Flight;
    readOnly?: boolean;
    onSave: (data: Record<string, string>) => void;
    onPersistCrewHitos?: (data: Record<string, string>) => void;
}

const CREW_MILESTONES = [
    "Llegada crew",
    "Inicio embarque",
    "Fin embarque",
    "Cierre puertas"
];

export function HitosCrewTab({ flight, readOnly, onSave, onPersistCrewHitos }: Props) {
    const [data, setData] = useState<Record<string, string>>(flight.hitosCrewData || {});
    const [savedState, setSavedState] = useState(false);

    useEffect(() => {
        setData(flight.hitosCrewData || {});
    }, [flight.id]);

    useDebouncedFlightPersist(data, readOnly ? undefined : onPersistCrewHitos, {
        readOnly,
        flightId: flight.id,
    });

    const handleEntryChange = (name: string, value: string) => {
        // Enforce basic HHMM format natively like the other forms
        const numbersOnly = value.replace(/\D/g, '').slice(0, 4);
        setData(prev => ({ ...prev, [name]: numbersOnly }));
    };

    const handleSave = () => {
        onSave(data);
        setSavedState(true);
        setTimeout(() => setSavedState(false), 2000);
    };

    return (
        <fieldset disabled={readOnly} className="max-w-xl mx-auto flex flex-col gap-6 border-none m-0 p-0">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center mb-4">
                <Clock className="w-8 h-8 text-indigo-500 mb-2" />
                <h3 className="text-lg font-black uppercase tracking-wider text-slate-800 text-center">
                    Control de Hitos (Tripulación)
                </h3>
                <p className="text-sm font-semibold text-muted-foreground mt-1 text-center">Registra o actualiza los 4 hitos obligatorios de cabina.</p>
                {!flight.hitosData?.ganttChartName && (
                    <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 text-center">
                        Elegí carta Gantt en hitos operacionales para mostrar el mismo horario esperado (target) que en tierra.
                    </p>
                )}
            </div>

            <div className="space-y-4">
                {CREW_MILESTONES.map((name, idx) => {
                    const targetInfo = getCrewTargetInfo(flight, flight.hitosData, name);
                    const targetLabel = targetInfo?.esperado ?? "—";
                    const val = data[name] || "";
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
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:border-indigo-500/30 transition-colors shadow-sm">
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-lg">{name}</div>
                            {targetInfo && (
                                <div className="text-xs text-muted-foreground mt-0.5 font-bold">
                                    Mismo objetivo que en carta Gantt (hitos operacionales)
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
                                value={data[name] || ""}
                                onChange={(e) => handleEntryChange(name, e.target.value)}
                                className="w-20 sm:w-24 bg-white border-2 border-slate-200 p-2 sm:p-2.5 rounded-lg text-center font-mono text-lg font-bold focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:font-sans placeholder:text-sm placeholder:font-normal"
                            />
                            <div className={`flex-1 sm:flex-none min-w-[100px] w-full sm:w-28 text-center text-xs font-bold py-2 rounded-lg border ${statusColor}`}>
                                {statusText === "Retraso" ? <span className="inline-flex items-center justify-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{statusText}</span> : statusText}
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>

            {!readOnly && (
                <div className="pt-6 mt-4 border-t border-slate-200 flex flex-col items-end gap-2">
                    <p className="text-xs text-slate-500 w-full text-right">
                        Progreso guardado automáticamente; al actualizar la página no se pierde.
                    </p>
                    <button
                        onClick={handleSave}
                        className={`px-8 py-4 w-full sm:w-auto rounded-xl font-black shadow-md transition-all flex items-center justify-center gap-2 ${savedState
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white hover:-translate-y-0.5"
                            }`}
                    >
                        <Save className="w-5 h-5" />
                        {savedState ? "Hitos Enviados" : "Guardar Hitos CREW"}
                    </button>
                </div>
            )}
        </fieldset>
    );
}
