import { useState, useMemo, useEffect } from "react";
import type { Flight } from "../types";
import { Plus, Trash2, Calculator, CheckCircle2 } from "lucide-react";
import { parseTimeToMinutes, formatMinutesToHHMM } from "../lib/mvtTime";
import { DELAY_CODE_OPTIONS, formatDelayOption } from "../lib/delayCodes";
import { normalizeMvtData } from "../lib/flightDataNormalize";
import { getInitialMvtFormData, persistMvtDraft, clearMvtDraft } from "../lib/mvtDraftStorage";

interface Props {
    flight: Flight;
    readOnly?: boolean;
    onSave: (mvtData: Flight["mvtData"]) => void;
}

// Componentes extraídos para no perder foco
const NumberInput = ({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (val: string) => void; placeholder?: string }) => (
    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 transition-colors">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">{label}</label>
        <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                onChange(val);
            }}
            placeholder={placeholder}
            className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground transition-all"
        />
    </div>
);

const DelayCodeSelect = ({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
}) => {
    const known = DELAY_CODE_OPTIONS.some((o) => o.code === value);
    return (
        <div className="flex flex-col gap-1.5 focus-within:text-blue-600 transition-colors min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">{label}</label>
            <select
                value={known ? value : ""}
                onChange={(e) => onChange(e.target.value)}
                className="w-full min-w-0 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground text-sm transition-all"
            >
                <option value="">— Seleccionar código —</option>
                {!known && value ? (
                    <option value={value}>{value} (valor guardado)</option>
                ) : null}
                {DELAY_CODE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                        {formatDelayOption(o)}
                    </option>
                ))}
            </select>
        </div>
    );
};

const TextInput = ({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (val: string) => void; placeholder?: string }) => (
    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 transition-colors">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">{label}</label>
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground transition-all"
        />
    </div>
);

export function MVTForm({ flight, readOnly, onSave }: Props) {
    const [data, setData] = useState<NonNullable<Flight["mvtData"]>>(() => getInitialMvtFormData(flight));

    /** Borrador solo en el navegador (no sube a servidor hasta Enviar MVT) */
    useEffect(() => {
        if (readOnly) return;
        const t = window.setTimeout(() => {
            persistMvtDraft(flight.id, data);
        }, 400);
        return () => window.clearTimeout(t);
    }, [data, flight.id, readOnly]);

    const handleChange = (field: keyof typeof data, value: string) => {
        setData((prev) => ({ ...prev, [field]: value }));
    };

    const stdMinutes = useMemo(() => parseTimeToMinutes(flight.std), [flight.std]);
    const atdMinutes = useMemo(() => parseTimeToMinutes(data.atd), [data.atd]);

    const isDelayed = (data.atd ?? "").length >= 3 && atdMinutes > stdMinutes;
    const delayMinutes = isDelayed ? atdMinutes - stdMinutes : 0;

    const justifiedMinutes = useMemo(() => parseTimeToMinutes(data.dlyTime1) + parseTimeToMinutes(data.dlyTime2), [data.dlyTime1, data.dlyTime2]);
    const remDelay = delayMinutes - justifiedMinutes;

    const handleAddSSEE = () => {
        setData((prev) => ({
            ...prev,
            ssee: [...(prev.ssee ?? []), { id: Date.now().toString(), type: "", qty: "" }],
        }));
    };

    const handleUpdateSSEE = (id: string, field: "type" | "qty", value: string) => {
        setData((prev) => ({
            ...prev,
            ssee: (prev.ssee ?? []).map((s) => (s.id === id ? { ...s, [field]: value } : s)),
        }));
    };

    const handleRemoveSSEE = (id: string) => {
        setData((prev) => ({
            ...prev,
            ssee: (prev.ssee ?? []).filter((s) => s.id !== id),
        }));
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(data);
        clearMvtDraft(flight.id);
    };

    return (
        <form onSubmit={handleSave}>
          <fieldset disabled={readOnly} className="space-y-8 border-none p-0 m-0 pb-8">

            {/* Horarios Básicos */}
            <section className="bg-slate-50/50 p-5 rounded-xl border border-border">
                <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
                    Horarios
                    <span className="text-xs font-normal text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full">STD: {flight.std}</span>
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <NumberInput label="ATD" value={data.atd} onChange={(v) => handleChange("atd", v)} placeholder="Ej: 1430" />
                    <NumberInput label="OFF" value={data.off} onChange={(v) => handleChange("off", v)} placeholder="Ej: 1445" />
                    <NumberInput label="ETA" value={data.eta} onChange={(v) => handleChange("eta", v)} placeholder="Ej: 1620" />
                </div>
            </section>

            {/* Demoras Conditionales */}
            {isDelayed && (
                <section className={`bg-red-50 p-5 rounded-xl border ${remDelay <= 0 ? 'border-emerald-500/50' : 'border-red-200'} animate-in fade-in slide-in-from-top-4 duration-300`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${remDelay <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            <Calculator className="w-4 h-4" />
                            Códigos de Demora
                        </h3>
                        <span className={`font-bold px-3 py-1 rounded-full text-sm transition-colors ${remDelay <= 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-600'
                            }`}>
                            A Justificar: {formatMinutesToHHMM(remDelay)}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <DelayCodeSelect label="DLY COD 1" value={data.dlyCod1} onChange={(v) => handleChange("dlyCod1", v)} />
                        <NumberInput label="DLY TIME 1" value={data.dlyTime1} onChange={(v) => handleChange("dlyTime1", v)} />
                        <DelayCodeSelect label="DLY COD 2" value={data.dlyCod2} onChange={(v) => handleChange("dlyCod2", v)} />
                        <NumberInput label="DLY TIME 2" value={data.dlyTime2} onChange={(v) => handleChange("dlyTime2", v)} />
                    </div>
                    <div className="mt-4 flex flex-col gap-1.5 focus-within:text-red-600 transition-colors">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Observaciones (Demora)</label>
                        <textarea
                            value={data.observaciones}
                            onChange={(e) => handleChange("observaciones", e.target.value)}
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-foreground transition-all min-h-[60px] resize-y"
                        />
                    </div>
                </section>
            )}

            {/* Datos Pasajeros y Carga */}
            <section className="p-5 rounded-xl border border-border">
                <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Pasajeros & Carga</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <NumberInput label="PAX" value={data.paxActual} onChange={(v) => handleChange("paxActual", v)} />
                    <NumberInput label="INF" value={data.inf} onChange={(v) => handleChange("inf", v)} />
                    <NumberInput label="Total Bags" value={data.totalBags} onChange={(v) => handleChange("totalBags", v)} />
                    <NumberInput label="Total Carga" value={data.totalCarga} onChange={(v) => handleChange("totalCarga", v)} />
                </div>
                <div className="grid grid-cols-1 select-none md:grid-cols-2 gap-4">
                    <TextInput label="LOAD" value={data.load} onChange={(v) => handleChange("load", v)} />
                    <NumberInput label="FOB" value={data.fob} onChange={(v) => handleChange("fob", v)} />
                </div>
            </section>

            {/* SSEE */}
            <section className="p-5 rounded-xl border border-border bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Servicios Especiales (SSEE)</h3>
                    <button type="button" onClick={handleAddSSEE} className="flex items-center gap-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200:bg-blue-900/60 px-3 py-1.5 rounded-full transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Agregar SSEE
                    </button>
                </div>

                {(data.ssee ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4 bg-background rounded-lg border border-dashed mb-2">No hay servicios especiales registrados.</p>
                ) : (
                    <div className="space-y-3 mb-4">
                        {(data.ssee ?? []).map((s) => (
                            <div key={s.id} className="flex items-center gap-3 bg-background p-2 rounded-lg border border-border shadow-sm animate-in fade-in slide-in-from-left-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="Cant"
                                    value={s.qty}
                                    onChange={(e) => handleUpdateSSEE(s.id, "qty", e.target.value.replace(/[^0-9]/g, ""))}
                                    className="w-20 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <select
                                    value={s.type}
                                    onChange={(e) => handleUpdateSSEE(s.id, "type", e.target.value)}
                                    className="flex-1 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                >
                                    <option value="" disabled>Seleccionar Tipo</option>
                                    <option value="WCHS">WCHS</option>
                                    <option value="WCHC">WCHC</option>
                                    <option value="WCHR">WCHR</option>
                                    <option value="BLND">BLND</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveSSEE(s.id)}
                                    className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50:bg-red-950/50 rounded-md transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Info Extra */}
            <section className="p-5 rounded-xl border border-border">
                <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Información Suplementaria</label>
                        <textarea
                            value={data.infoSup}
                            onChange={(e) => handleChange("infoSup", e.target.value)}
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground transition-all min-h-[60px] resize-y"
                        />
                    </div>
                    <TextInput label="Supervisor a Cargo" value={data.supervisor} onChange={(v) => handleChange("supervisor", v)} />
                </div>
            </section>

            {!readOnly && (
                <div className="sticky bottom-4 z-10 flex justify-end">
                    <button type="submit" className={`px-8 py-3 rounded-xl font-bold tracking-wide shadow-lg hover:shadow-xl transition-all flex items-center gap-2 hover:-translate-y-0.5 ${flight.mvtData?.atd ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
                        {flight.mvtData?.atd ? <CheckCircle2 className="w-5 h-5" /> : null}
                        {flight.mvtData?.atd ? "Actualizar MVT" : "Enviar MVT"}
                    </button>
                </div>
            )}
          </fieldset>
        </form>
    );
}
