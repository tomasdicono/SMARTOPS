import { useState, useEffect, useRef } from "react";
import { GANTT_CHARTS } from "../lib/hitosData";
import { getAircraftInfo } from "../lib/fleetData";
import type { Flight, HitosData } from "../types";
import { Save, AlertCircle, Clock } from "lucide-react";

const emptyHitos = (): HitosData => ({
    ganttChartName: "",
    ata: "",
    entries: {}
});

interface Props {
    flight: Flight;
    readOnly?: boolean;
    onSave: (hitosData: HitosData) => void;
    /** Guardado automático en Firebase (sin validar) para no perder progreso al refrescar */
    onPersistHitos?: (hitosData: HitosData) => void;
}

export function HitosTab({ flight, readOnly, onSave, onPersistHitos }: Props) {
    const [errorMsg, setErrorMsg] = useState("");
    const [data, setData] = useState<HitosData>(flight.hitosData || emptyHitos());
    const skipNextPersist = useRef(true);
    const persistRef = useRef(onPersistHitos);
    persistRef.current = onPersistHitos;

    useEffect(() => {
        skipNextPersist.current = true;
        setData(flight.hitosData || emptyHitos());
    }, [flight.id]);

    useEffect(() => {
        if (readOnly || !persistRef.current) return;
        if (skipNextPersist.current) {
            skipNextPersist.current = false;
            return;
        }
        const t = window.setTimeout(() => {
            persistRef.current?.(data);
        }, 500);
        return () => window.clearTimeout(t);
    }, [data, readOnly]);

    const parseToMins = (time: string): number => {
        if (!time || time.length !== 4) return 0;
        const h = parseInt(time.slice(0, 2), 10);
        const m = parseInt(time.slice(2, 4), 10);
        return h * 60 + m;
    };

    const formatMins = (mins: number): string => {
        while (mins < 0) mins += 24 * 60;
        while (mins >= 24 * 60) mins -= 24 * 60;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const selectedChart = GANTT_CHARTS.find(c => c.name === data.ganttChartName);
    const is1stWave = selectedChart?.name.includes("1ST WAVE") || false;

    let refMinutes = parseToMins(flight.std.replace(":", ""));
    let etdMinutes: number | null = null;

    if (selectedChart && !is1stWave && data.ata.length >= 3) {
        const ataMins = parseToMins(data.ata.padStart(4, "0"));
        etdMinutes = ataMins + selectedChart.tatMinutes;
        if (etdMinutes > refMinutes) {
            refMinutes = etdMinutes;
        }
    }

    const handleChange = (field: string, val: string) => {
        const cln = val.replace(/[^0-9]/g, '').slice(0, 4);
        setData(p => ({ ...p, [field]: cln }));
    };

    const handleEntryChange = (name: string, val: string) => {
        const cln = val.replace(/[^0-9]/g, '').slice(0, 4);
        setData(p => ({ ...p, entries: { ...p.entries, [name]: cln } }));
    };

    const handleSave = () => {
        if (!selectedChart) {
            setErrorMsg("Selecciona una carta primero.");
            return;
        }

        const requiredMs = selectedChart.milestones.filter(m => m.offsetMinutes !== null && m.name !== "Inicio búsqueda de equipaje");
        for (const m of requiredMs) {
            const val = data.entries[m.name];
            if (!val || val.trim() === "") {
                setErrorMsg(`El hito "${m.name}" es obligatorio.`);
                return;
            }
        }

        if (!is1stWave && (!data.ata || data.ata.trim() === "")) {
            setErrorMsg("El campo ATA (Llegada) es obligatorio para esta carta.");
            return;
        }

        setErrorMsg("");
        onSave(data);
    };

    return (
        <fieldset disabled={readOnly} className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto custom-scrollbar border-none m-0">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Carta de Referencia</label>
                        <select
                            value={data.ganttChartName}
                            onChange={(e) => setData({ ganttChartName: e.target.value, ata: "", entries: {} })}
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
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                        <div>
                            <span className="text-muted-foreground font-bold mr-2">Referencia Base:</span>
                            <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded font-bold">{flight.std} STD</span>
                        </div>
                        {etdMinutes !== null && etdMinutes > parseToMins(flight.std.replace(":", "")) && (
                            <div className="flex items-center gap-1.5 text-orange-600 font-bold bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200">
                                <AlertCircle className="w-4 h-4" />
                                ETD Ajustado: {formatMins(etdMinutes)} LT
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

                    <div className="space-y-4 flex-1">
                        {selectedChart.milestones.filter(m => m.offsetMinutes !== null).map((m, idx) => {
                            const target = formatMins(refMinutes - m.offsetMinutes!);
                            const val = data.entries[m.name] || "";

                            let statusColor = "bg-slate-100 text-slate-400";
                            let statusText = "Pendiente";

                            if (val.length >= 3) {
                                const valMins = parseToMins(val.padStart(4, "0"));
                                const targetMins = refMinutes - m.offsetMinutes!;
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
                                        <div className="text-xs text-muted-foreground mt-0.5 font-bold">Límite: T-{m.offsetMinutes}m</div>
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
                            {errorMsg && (
                                <div className="text-red-600 font-bold text-sm flex items-center gap-1.5 animate-in slide-in-from-right-2">
                                    <AlertCircle className="w-4 h-4" /> {errorMsg}
                                </div>
                            )}
                            <button
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
