import { useState, useMemo, type FormEvent } from "react";
import type { DiferidoEntry } from "../types";
import { FLEET_DATA } from "../lib/fleetData";
import { normalizeRegDiferido } from "../lib/diferidosHelpers";
import { Trash2, Plus, FileWarning } from "lucide-react";

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

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const reg = editingReg ?? effectiveReg();
        const t = text.trim();
        if (!reg || !t) return;
        onSave(reg, t);
        setText("");
        setPickReg("");
        setCustomReg("");
        setEditingReg(null);
    };

    const startEdit = (reg: string) => {
        setEditingReg(reg);
        setPickReg(reg);
        setCustomReg("");
        setText(diferidos[reg]?.text ?? "");
    };

    const cancelEdit = () => {
        setEditingReg(null);
        setText("");
        setPickReg("");
        setCustomReg("");
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-200">
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 px-5 py-4">
                <div className="flex gap-3 items-start">
                    <FileWarning className="w-6 h-6 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-wide text-amber-950 dark:text-amber-100">Diferidos por matrícula</h3>
                        <p className="text-sm text-amber-900/90 dark:text-amber-200/90 font-semibold mt-1 leading-relaxed">
                            Lo que cargues aquí se muestra en el tablero en <strong>todos los días</strong> en que esa matrícula figure en la programación, hasta que lo quites.
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-card p-6 shadow-sm space-y-4">
                <h4 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    {editingReg ? `Editar diferido · ${editingReg}` : "Nuevo diferido"}
                </h4>
                {!editingReg && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">Matrícula (flota)</label>
                            <select
                                value={pickReg}
                                onChange={(e) => {
                                    setPickReg(e.target.value);
                                    if (e.target.value) setCustomReg("");
                                }}
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-background px-3 py-2.5 text-sm font-bold"
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
                            <label className="block text-xs font-black uppercase text-slate-500 mb-1">Otra matrícula (texto libre)</label>
                            <input
                                type="text"
                                value={customReg}
                                onChange={(e) => {
                                    setCustomReg(e.target.value.toUpperCase());
                                    if (e.target.value.trim()) setPickReg("");
                                }}
                                placeholder="Ej. LV-XXX"
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-background px-3 py-2.5 text-sm font-mono font-bold uppercase"
                                maxLength={12}
                            />
                        </div>
                    </div>
                )}
                <div>
                    <label className="block text-xs font-black uppercase text-slate-500 mb-1">Texto del diferido</label>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={4}
                        required
                        placeholder="Ej. Equipo en mantenimiento programado hasta… / Limitación operativa…"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-background px-4 py-3 text-sm font-semibold resize-y min-h-[100px]"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="submit"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm uppercase tracking-wide shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                        {editingReg ? "Guardar cambios" : "Guardar diferido"}
                    </button>
                    {editingReg && (
                        <button type="button" onClick={cancelEdit} className="px-5 py-2.5 rounded-xl font-bold border border-slate-300 text-slate-700 text-sm">
                            Cancelar edición
                        </button>
                    )}
                </div>
            </form>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-600">
                    <h4 className="text-sm font-black uppercase tracking-wide text-slate-800 dark:text-slate-100">Activos ({rows.length})</h4>
                </div>
                {rows.length === 0 ? (
                    <p className="p-8 text-center text-slate-500 font-semibold text-sm">No hay diferidos cargados.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map(([reg, d]) => (
                            <li key={reg} className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                                <span className="font-mono font-black text-slate-900 dark:text-white shrink-0">{reg}</span>
                                <p className="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-0 whitespace-pre-wrap break-words">{d.text}</p>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => startEdit(reg)}
                                        className="text-xs font-black uppercase text-cyan-700 dark:text-cyan-400 hover:underline"
                                    >
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (confirm(`¿Quitar el diferido de ${reg}?`)) onRemove(reg);
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-black uppercase text-rose-700 dark:text-rose-400 hover:underline"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Quitar
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
