import { useState, useEffect, type FormEvent } from "react";
import type { Flight } from "../types";
import { normalizeAirportCode } from "../lib/routeAfectaciones";
import { X } from "lucide-react";

interface Props {
    flight: Flight;
    onClose: () => void;
    /** Puede ser async; los errores se muestran en el modal */
    onConfirm: (newDep: string, newArr: string) => void | Promise<void>;
}

export function RouteChangeModal({ flight, onClose, onConfirm }: Props) {
    const [dep, setDep] = useState(normalizeAirportCode(flight.dep));
    const [arr, setArr] = useState(normalizeAirportCode(flight.arr));
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDep(normalizeAirportCode(flight.dep));
        setArr(normalizeAirportCode(flight.arr));
        setError(null);
        setSaving(false);
    }, [flight]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        const d = normalizeAirportCode(dep);
        const a = normalizeAirportCode(arr);
        if (d.length < 3) {
            setError("El origen debe tener al menos 3 caracteres (código IATA).");
            return;
        }
        if (a.length < 3) {
            setError("El destino debe tener al menos 3 caracteres (código IATA).");
            return;
        }
        const prevD = normalizeAirportCode(flight.dep);
        const prevA = normalizeAirportCode(flight.arr);
        if (d === prevD && a === prevA) {
            setError("No hay cambios respecto de la ruta actual.");
            return;
        }
        setSaving(true);
        try {
            await Promise.resolve(onConfirm(d, a));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-change-title"
        >
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    <h2 id="route-change-title" className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                        Cambio de ruta
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">
                        Vuelo <span className="font-black text-slate-900 dark:text-white">{flight.flt}</span>
                        {" · "}
                        Actual:{" "}
                        <span className="font-mono font-bold">
                            {normalizeAirportCode(flight.dep)} → {normalizeAirportCode(flight.arr)}
                        </span>
                    </p>

                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                            Nuevo origen (IATA)
                        </label>
                        <input
                            type="text"
                            value={dep}
                            onChange={(e) => setDep(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                            disabled={saving}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-4 py-3 font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-60"
                            autoComplete="off"
                            maxLength={4}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                            Nuevo destino (IATA)
                        </label>
                        <input
                            type="text"
                            value={arr}
                            onChange={(e) => setArr(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                            disabled={saving}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-4 py-3 font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-60"
                            autoComplete="off"
                            maxLength={4}
                        />
                    </div>

                    {error && (
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="flex-1 py-3 rounded-xl font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-3 rounded-xl font-black bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition-colors disabled:opacity-60 disabled:cursor-wait"
                        >
                            {saving ? "Guardando…" : "Guardar ruta"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
