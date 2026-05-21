import { useState, useMemo, useEffect } from "react";
import type { Flight } from "../types";
import { Plus, Trash2, Calculator, CheckCircle2, Lock } from "lucide-react";
import { hasMvtSent } from "../lib/controlHelpers";
import { formatMinutesToHHMM, computeMvtDelayStatus, validateMvtSendDelays } from "../lib/mvtTime";
import { getMvtMaxPax, getMvtMaxPaxLabel, validateMvtPax } from "../lib/mvtPaxLimits";
import { validateMvtSendRequired } from "../lib/mvtRequiredFields";
import { DELAY_CODE_OPTIONS, formatDelayOption } from "../lib/delayCodes";
import { getInitialMvtFormData, persistMvtDraft, clearMvtDraft } from "../lib/mvtDraftStorage";

interface Props {
    flight: Flight;
    readOnly?: boolean;
    /** MVT enviado: HCC puede editar solo códigos/tiempos de demora y observaciones. */
    canEditDelayFields?: boolean;
    onSave: (mvtData: Flight["mvtData"]) => void;
}

const NumberInput = ({
    label,
    value,
    onChange,
    placeholder = "",
    disabled = false,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
}) => (
    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 transition-colors">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">{label}</label>
        <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            disabled={disabled}
            onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                onChange(val);
            }}
            placeholder={placeholder}
            className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        />
    </div>
);

const DelayCodeSelect = ({
    label,
    value,
    onChange,
    disabled = false,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    disabled?: boolean;
}) => {
    const known = DELAY_CODE_OPTIONS.some((o) => o.code === value);
    return (
        <div className="flex flex-col gap-1.5 focus-within:text-blue-600 transition-colors min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">{label}</label>
            <select
                value={known ? value : ""}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className="w-full min-w-0 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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

const TextInput = ({
    label,
    value,
    onChange,
    placeholder = "",
    disabled = false,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
}) => (
    <div className="flex flex-col gap-1.5 focus-within:text-blue-600 transition-colors">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">{label}</label>
        <input
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        />
    </div>
);

export function MVTForm({ flight, readOnly, canEditDelayFields, onSave }: Props) {
    const [data, setData] = useState<NonNullable<Flight["mvtData"]>>(() => getInitialMvtFormData(flight));
    const mvtSent = hasMvtSent(flight);
    const delayOnlyMode = Boolean(canEditDelayFields && mvtSent);
    const fieldDisabled = (isDelayField: boolean) => Boolean(readOnly) || (delayOnlyMode && !isDelayField);

    useEffect(() => {
        if (readOnly && !delayOnlyMode) clearMvtDraft(flight.id);
    }, [readOnly, delayOnlyMode, flight.id]);

    useEffect(() => {
        if (readOnly || mvtSent) return;
        const t = window.setTimeout(() => {
            persistMvtDraft(flight.id, data);
        }, 400);
        return () => window.clearTimeout(t);
    }, [data, flight.id, readOnly, mvtSent]);

    const handleChange = (field: keyof typeof data, value: string) => {
        setData((prev) => ({ ...prev, [field]: value }));
    };

    const handlePaxActualChange = (value: string) => {
        const digits = value.replace(/[^0-9]/g, "");
        if (maxPax != null && digits !== "") {
            const n = parseInt(digits, 10);
            if (!Number.isNaN(n) && n > maxPax) {
                handleChange("paxActual", String(maxPax));
                return;
            }
        }
        handleChange("paxActual", digits);
    };

    const delayStatus = useMemo(
        () => computeMvtDelayStatus(flight.std, data.atd, data.dlyTime1, data.dlyTime2),
        [flight.std, data.atd, data.dlyTime1, data.dlyTime2],
    );
    const { isDelayed, remDelay } = delayStatus;
    const sendingNewMvt = !mvtSent && !delayOnlyMode;
    const sendDelayValidation = useMemo(
        () =>
            validateMvtSendDelays(
                flight.std,
                data.atd,
                data.dlyCod1,
                data.dlyTime1,
                data.dlyCod2,
                data.dlyTime2,
            ),
        [flight.std, data.atd, data.dlyCod1, data.dlyTime1, data.dlyCod2, data.dlyTime2],
    );
    const paxValidation = useMemo(
        () => validateMvtPax(data.paxActual, flight.reg),
        [data.paxActual, flight.reg],
    );
    const requiredValidation = useMemo(() => validateMvtSendRequired(data), [data]);
    const maxPax = useMemo(() => getMvtMaxPax(flight.reg), [flight.reg]);
    const maxPaxHint = useMemo(() => getMvtMaxPaxLabel(flight.reg), [flight.reg]);

    const cannotSendForDelays = sendingNewMvt && !sendDelayValidation.ok;
    const cannotSendForPax = !delayOnlyMode && !paxValidation.ok;
    const cannotSendForRequired = !delayOnlyMode && !requiredValidation.ok;
    const cannotSend = cannotSendForDelays || cannotSendForPax || cannotSendForRequired;
    const delaySendBlockMessage = sendingNewMvt && !sendDelayValidation.ok ? sendDelayValidation.message : null;
    const paxSendBlockMessage = !paxValidation.ok ? paxValidation.message : null;
    const requiredSendBlockMessage = !requiredValidation.ok ? requiredValidation.message : null;
    const sendBlockMessage = requiredSendBlockMessage ?? delaySendBlockMessage ?? paxSendBlockMessage;

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
        if (cannotSend) {
            window.alert(sendBlockMessage ?? "Revisá los datos del MVT antes de enviar.");
            return;
        }
        onSave(data);
        clearMvtDraft(flight.id);
    };

    const showSaveButton = !readOnly;

    return (
        <form onSubmit={handleSave}>
          <fieldset className="space-y-8 border-none p-0 m-0 pb-8">

            {mvtSent ? (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${delayOnlyMode ? "border-cyan-200 bg-cyan-50 text-cyan-950" : "border-slate-200 bg-slate-100 text-slate-800"}`}>
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    <p className="font-semibold leading-snug">
                        {delayOnlyMode
                            ? "MVT enviado. Solo podés modificar códigos de demora, tiempos y observaciones."
                            : "MVT enviado. El formulario no puede editarse."}
                    </p>
                </div>
            ) : null}

            <section className="bg-slate-50/50 p-5 rounded-xl border border-border">
                <h3
                    className={`text-sm font-bold text-foreground uppercase tracking-wider flex flex-wrap items-center gap-2 ${flight.etd?.trim() ? "mb-2" : "mb-4"}`}
                >
                    Horarios
                    <span className="text-xs font-normal text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full">STD: {flight.std}</span>
                    {flight.etd?.trim() ? (
                        <span className="text-xs font-normal text-amber-800 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-300/60">
                            ETD: {flight.etd}
                        </span>
                    ) : null}
                </h3>
                {flight.etd?.trim() ? (
                    <p className="text-xs text-muted-foreground mb-4 font-medium">
                        Demoras y comparación ATD vs referencia usan el <span className="font-bold">STD</span> de programación, no el ETD.
                    </p>
                ) : null}
                <div className="grid grid-cols-3 gap-4">
                    <NumberInput label="ATD" value={data.atd} onChange={(v) => handleChange("atd", v)} placeholder="Quite Frenos" disabled={fieldDisabled(false)} />
                    <NumberInput label="OFF" value={data.off} onChange={(v) => handleChange("off", v)} placeholder="Despegue" disabled={fieldDisabled(false)} />
                    <NumberInput label="ETA" value={data.eta} onChange={(v) => handleChange("eta", v)} placeholder="Estima Arribo" disabled={fieldDisabled(false)} />
                </div>
            </section>

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
                        <DelayCodeSelect label="DLY COD 1" value={data.dlyCod1} onChange={(v) => handleChange("dlyCod1", v)} disabled={fieldDisabled(true)} />
                        <NumberInput label="DLY TIME 1" value={data.dlyTime1} onChange={(v) => handleChange("dlyTime1", v)} disabled={fieldDisabled(true)} />
                        <DelayCodeSelect label="DLY COD 2" value={data.dlyCod2} onChange={(v) => handleChange("dlyCod2", v)} disabled={fieldDisabled(true)} />
                        <NumberInput label="DLY TIME 2" value={data.dlyTime2} onChange={(v) => handleChange("dlyTime2", v)} disabled={fieldDisabled(true)} />
                    </div>
                    <div className="mt-4 flex flex-col gap-1.5 focus-within:text-red-600 transition-colors">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Observaciones (Demora)</label>
                        <textarea
                            value={data.observaciones}
                            disabled={fieldDisabled(true)}
                            onChange={(e) => handleChange("observaciones", e.target.value)}
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-foreground transition-all min-h-[60px] resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>
                </section>
            )}

            <section className="p-5 rounded-xl border border-border">
                <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Pasajeros & Carga</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <NumberInput
                            label="PAX"
                            value={data.paxActual}
                            onChange={handlePaxActualChange}
                            disabled={fieldDisabled(false)}
                        />
                        {maxPaxHint && !fieldDisabled(false) ? (
                            <p className="text-[11px] font-semibold text-muted-foreground ml-1">{maxPaxHint}</p>
                        ) : null}
                    </div>
                    <NumberInput label="INF" value={data.inf} onChange={(v) => handleChange("inf", v)} disabled={fieldDisabled(false)} />
                    <NumberInput label="TOTAL BAGS (PCS)" value={data.totalBags} onChange={(v) => handleChange("totalBags", v)} disabled={fieldDisabled(false)} />
                    <NumberInput label="TOTAL CARGA (KG)" value={data.totalCarga} onChange={(v) => handleChange("totalCarga", v)} disabled={fieldDisabled(false)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <TextInput
                        label="LOAD"
                        value={data.load}
                        onChange={(v) => handleChange("load", v)}
                        placeholder="Texto libre (distribución de carga, posiciones, etc.)"
                        disabled={fieldDisabled(false)}
                    />
                    <NumberInput label="FOB (KG)" value={data.fob} onChange={(v) => handleChange("fob", v)} disabled={fieldDisabled(false)} />
                </div>
            </section>

            <section className="p-5 rounded-xl border border-border bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Servicios Especiales (SSEE)</h3>
                    <button type="button" disabled={fieldDisabled(false)} onClick={handleAddSSEE} className="flex items-center gap-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200:bg-blue-900/60 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
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
                                    disabled={fieldDisabled(false)}
                                    onChange={(e) => handleUpdateSSEE(s.id, "qty", e.target.value.replace(/[^0-9]/g, ""))}
                                    className="w-20 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                                <select
                                    value={s.type}
                                    disabled={fieldDisabled(false)}
                                    onChange={(e) => handleUpdateSSEE(s.id, "type", e.target.value)}
                                    className="flex-1 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    <option value="" disabled>Seleccionar Tipo</option>
                                    <option value="WCHS">WCHS</option>
                                    <option value="WCHC">WCHC</option>
                                    <option value="WCHR">WCHR</option>
                                    <option value="BLND">BLND</option>
                                    <option value="DEAF">DEAF</option>
                                </select>
                                <button
                                    type="button"
                                    disabled={fieldDisabled(false)}
                                    onClick={() => handleRemoveSSEE(s.id)}
                                    className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50:bg-red-950/50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="p-5 rounded-xl border border-border">
                <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Información Suplementaria</label>
                        <textarea
                            value={data.infoSup}
                            disabled={fieldDisabled(false)}
                            onChange={(e) => handleChange("infoSup", e.target.value)}
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-foreground transition-all min-h-[60px] resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>
                    <TextInput label="Supervisor a Cargo" value={data.supervisor} onChange={(v) => handleChange("supervisor", v)} disabled={fieldDisabled(false)} />
                </div>
            </section>

            {sendBlockMessage ? (
                <p
                    className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 leading-snug"
                    role="alert"
                >
                    {sendBlockMessage}
                </p>
            ) : null}

            {showSaveButton ? (
                <div className="sticky bottom-4 z-10 flex flex-col items-end gap-2">
                    <button
                        type="submit"
                        disabled={cannotSend}
                        title={cannotSend ? sendBlockMessage ?? undefined : undefined}
                        className={`px-8 py-3 rounded-xl font-bold tracking-wide shadow-lg transition-all flex items-center gap-2 ${cannotSend ? "bg-slate-300 text-slate-600 cursor-not-allowed shadow-none" : delayOnlyMode || flight.mvtData?.atd ? "bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-xl hover:-translate-y-0.5" : "bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-xl hover:-translate-y-0.5"}`}
                    >
                        {(delayOnlyMode || flight.mvtData?.atd) && !cannotSend ? (
                            <CheckCircle2 className="w-5 h-5" />
                        ) : null}
                        {delayOnlyMode ? "Guardar códigos de demora" : flight.mvtData?.atd ? "Actualizar MVT" : "Enviar MVT"}
                    </button>
                </div>
            ) : null}

            {flight.mvtData?.mvtSentAt ? (
                <p className="text-center text-xs font-semibold text-muted-foreground pt-6 mt-2 border-t border-border">
                    MVT enviado:{" "}
                    <span className="text-foreground tabular-nums">
                        {new Date(flight.mvtData.mvtSentAt).toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "medium",
                        })}
                    </span>
                </p>
            ) : null}
          </fieldset>
        </form>
    );
}
