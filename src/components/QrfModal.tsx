import { useState, useEffect } from "react";
import type { Flight } from "../types";
import { X, RotateCcw } from "lucide-react";

interface Props {
    flight: Flight | null;
    onClose: () => void;
    onConfirm: (reason: string) => void;
}

export function QrfModal({ flight, onClose, onConfirm }: Props) {
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
            setError("Indicá el motivo del QRF.");
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
            aria-labelledby="qrf-flight-title"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-950/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 rounded-xl bg-blue-100 dark:bg-blue-900/50 p-2">
                            <RotateCcw className="w-5 h-5 text-blue-700 dark:text-blue-300" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2 id="qrf-flight-title" className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                                Activar QRF
                            </h2>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate">
                                {flight.flt} · {flight.dep} → {flight.arr} · STD {flight.std}
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
                        El avión regresó a posición. La tarjeta quedará en azul y SC podrá cargar o reenviar el MVT.
                        El STD de programación no se modifica.
                    </p>
                    <div>
                        <label htmlFor="qrf-reason" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Motivo del QRF
                        </label>
                        <textarea
                            id="qrf-reason"
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            rows={4}
                            placeholder="Ej.: Regreso por falla técnica / MET / solicitud torre /…"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y min-h-[100px]"
                        />
                        {error && <p className="mt-2 text-sm font-semibold text-blue-700 dark:text-blue-400">{error}</p>}
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
                            className="px-5 py-2.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-colors"
                        >
                            Confirmar QRF
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
