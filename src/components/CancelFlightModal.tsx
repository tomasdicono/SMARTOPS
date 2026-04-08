import { useState, useEffect } from "react";
import type { Flight } from "../types";
import { X, Ban } from "lucide-react";

interface Props {
    flight: Flight | null;
    onClose: () => void;
    onConfirm: (reason: string) => void;
}

export function CancelFlightModal({ flight, onClose, onConfirm }: Props) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (flight) {
            setReason("");
            setError("");
        }
    }, [flight?.id]);

    useEffect(() => {
        if (!flight) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [flight, onClose]);

    if (!flight) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const t = reason.trim();
        if (!t) {
            setError("Indicá el motivo de la cancelación.");
            return;
        }
        setError("");
        onConfirm(t);
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-flight-title"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-rose-50 dark:bg-rose-950/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 rounded-xl bg-rose-100 dark:bg-rose-900/50 p-2">
                            <Ban className="w-5 h-5 text-rose-700 dark:text-rose-300" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2 id="cancel-flight-title" className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                                Cancelar vuelo
                            </h2>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate">
                                {flight.flt} · {flight.dep} → {flight.arr}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 p-2 rounded-full hover:bg-white/80 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Esta acción marca el vuelo como cancelado para todo el equipo. Podés detallar el motivo (comercial, operativo, meteorológico, etc.).
                    </p>
                    <div>
                        <label htmlFor="cancel-reason" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Motivo de cancelación
                        </label>
                        <textarea
                            id="cancel-reason"
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            rows={4}
                            placeholder="Ej.: Cancelación comercial / restricción MET en destino /…"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 resize-y min-h-[100px]"
                        />
                        {error && <p className="mt-2 text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Volver
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2.5 rounded-xl font-black bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-colors"
                        >
                            Confirmar cancelación
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
