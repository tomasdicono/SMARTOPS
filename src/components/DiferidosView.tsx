import { useState, useMemo, type FormEvent } from "react";
import type { DiferidoEntry } from "../types";
import { FLEET_DATA } from "../lib/fleetData";
import { normalizeRegDiferido } from "../lib/diferidosHelpers";
import { Trash2, Plus, FileWarning, X, Pencil } from "lucide-react";

interface Props {
    diferidos: Record<string, DiferidoEntry>;
    onSave: (reg: string, text: string) => void;
    onRemove: (reg: string) => void;
}

const fleetRegsSorted = Object.keys(FLEET_DATA).sort((a, b) => a.localeCompare(b));

export function DiferidosView({ diferidos, onSave, onRemove }: Props) {
    const [pickReg, setPickReg] = useState("");
    const [customReg, setCustomReg] = useState("");
    const [text, setText] = useState("");
    const [editingReg, setEditingReg] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);

    const rows = useMemo(() => {
        return Object.entries(diferidos)
            .filter(([, v]) => v.text.trim())
            .sort(([a], [b]) => a.localeCompare(b));
    }, [diferidos]);

    const effectiveReg = (): string => {
        const fromPick = pickReg.trim();
        if (fromPick) return normalizeRegDiferido(fromPick);
        return normalizeRegDiferido(customReg);
    };

    const resetFormFields = () => {
        setText("");
        setPickReg("");
        setCustomReg("");
        setEditingReg(null);
    };

    const openNew = () => {
        resetFormFields();
        setFormOpen(true);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const reg = editingReg ?? effectiveReg();
        const t = text.trim();
        if (!reg || !t) return;
        onSave(reg, t);
        resetFormFields();
        setFormOpen(false);
    };

    const startEdit = (reg: string) => {
        setEditingReg(reg);
        setPickReg(reg);
        setCustomReg("");
        setText(diferidos[reg]?.text ?? "");
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        resetFormFields();
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in duration-200 pb-12">
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 px-5 py-4 mb-8">
                <div className="flex gap-3 items-start">
                    <FileWarning className="w-6 h-6 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-900/90 dark:text-amber-200/90 font-semibold leading-relaxed">
                        Se muestra en el tablero en <strong>todos los días</strong> en que esa matrícula salga en la programación,
                        hasta que lo quites.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                    Activos
                    <span className="ml-3 text-lg font-bold tabular-nums text-slate-500 dark:text-slate-400">({rows.length})</span>
                </h3>
                <button
                    type="button"
                    onClick={openNew}
                    className="inline-flex items-center justify-center w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-900/20 transition-transform hover:scale-105 active:scale-95"
                    title="Agregar diferido"
                    aria-label="Agregar diferido"
                >
                    <Plus className="w-10 h-10 sm:w-11 sm:h-11" strokeWidth={2.5} />
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/30 py-24 px-6 text-center">
                    <p className="text-xl font-bold text-slate-500 dark:text-slate-400 mb-6">No hay diferidos cargados</p>
                    <button
                        type="button"
                        onClick={openNew}
                        className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black bg-amber-500 hover:bg-amber-400 text-slate-900 text-lg uppercase tracking-wide shadow-md"
                    >
                        <Plus className="w-6 h-6" />
                        Agregar
                    </button>
                </div>
            ) : (
                <ul className="space-y-6">
                    {rows.map(([reg, d]) => (
                        <li
                            key={reg}
                            className="rounded-3xl border-2 border-slate-200 dark:border-slate-600 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 p-8 sm:p-10 shadow-md"
                        >
                            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1 space-y-4">
                                    <p className="font-mono font-black text-5xl sm:text-6xl lg:text-7xl tracking-tight text-slate-900 dark:text-white break-all leading-none">
                                        {reg}
                                    </p>
                                    <p className="text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 leading-snug whitespace-pre-wrap break-words">
                                        {d.text}
                                    </p>
                                </div>
                                <div className="flex sm:flex-col gap-3 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => startEdit(reg)}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black uppercase text-sm bg-cyan-100 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-100 hover:bg-cyan-200 dark:hover:bg-cyan-900 transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (confirm(`¿Quitar el diferido de ${reg}?`)) onRemove(reg);
                                        }}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black uppercase text-sm bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-100 hover:bg-rose-200 dark:hover:bg-rose-900 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Quitar
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {formOpen && (
                <div
                    className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="diferido-form-title"
                >
                    <div
                        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 z-10">
                            <h4 id="diferido-form-title" className="text-lg font-black text-slate-900 dark:text-white">
                                {editingReg ? `Editar · ${editingReg}` : "Nuevo diferido"}
                            </h4>
                            <button
                                type="button"
                                onClick={closeForm}
                                className="p-2 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                                aria-label="Cerrar"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {!editingReg && (
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Matrícula (flota)</label>
                                        <select
                                            value={pickReg}
                                            onChange={(e) => {
                                                setPickReg(e.target.value);
                                                if (e.target.value) setCustomReg("");
                                            }}
                                            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-background px-3 py-3 text-base font-bold"
                                        >
                                            <option value="">Elegir…</option>
                                            {fleetRegsSorted.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black uppercase text-slate-500 mb-1">Otra matrícula</label>
                                        <input
                                            type="text"
                                            value={customReg}
                                            onChange={(e) => {
                                                setCustomReg(e.target.value.toUpperCase());
                                                if (e.target.value.trim()) setPickReg("");
                                            }}
                                            placeholder="Ej. LV-XXX"
                                            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-background px-3 py-3 text-base font-mono font-bold uppercase"
                                            maxLength={12}
                                        />
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-black uppercase text-slate-500 mb-1">Texto</label>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    rows={5}
                                    required
                                    placeholder="Motivo del diferido…"
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-background px-4 py-3 text-base font-semibold resize-y min-h-[120px]"
                                />
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <button
                                    type="submit"
                                    className="flex-1 min-w-[8rem] inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-black bg-amber-500 hover:bg-amber-400 text-slate-900 uppercase tracking-wide shadow-md"
                                >
                                    {editingReg ? "Guardar" : "Agregar"}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="px-5 py-3.5 rounded-xl font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
