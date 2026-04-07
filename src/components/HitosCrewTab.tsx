import { useState } from "react";
import type { Flight } from "../types";
import { Clock, Save } from "lucide-react";

interface Props {
    flight: Flight;
    readOnly?: boolean;
    onSave: (data: Record<string, string>) => void;
}

const CREW_MILESTONES = [
    "Llegada crew",
    "Inicio embarque",
    "Fin embarque",
    "Cierre puertas"
];

export function HitosCrewTab({ flight, readOnly, onSave }: Props) {
    const [data, setData] = useState<Record<string, string>>(flight.hitosCrewData || {});
    const [savedState, setSavedState] = useState(false);

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
            </div>

            <div className="space-y-4">
                {CREW_MILESTONES.map((name, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 bg-white hover:border-indigo-500/30 transition-colors shadow-sm">
                        <div className="flex-1">
                            <div className="font-bold text-slate-800 text-lg">{name}</div>
                        </div>

                        <div className="flex items-center shrink-0">
                            <input
                                type="text"
                                placeholder="----"
                                value={data[name] || ""}
                                onChange={(e) => handleEntryChange(name, e.target.value)}
                                className="w-28 bg-slate-50 border-2 border-slate-200 p-3 rounded-xl text-center font-mono text-xl font-black focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:font-sans placeholder:text-base placeholder:font-normal"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {!readOnly && (
                <div className="pt-6 mt-4 border-t border-slate-200 flex justify-end">
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
