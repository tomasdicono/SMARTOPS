import { useEffect, useState } from "react";
import type { Flight } from "../types";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface Props {
    flight: Flight | null;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
}

export function DeleteFlightConfirmModal({ flight, onClose, onConfirm }: Props) {
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!flight) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [flight, onClose, busy]);

    if (!flight) return null;

    const handleConfirm = async () => {
        setBusy(true);
        try {
            await onConfirm();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-flight-title"
            onClick={busy ? undefined : onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-800/60 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200/80 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 rounded-xl bg-amber-100 dark:bg-amber-900/50 p-2">
                            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2
                                id="delete-flight-title"
                                className="text-lg font-black text-amber-950 dark:text-amber-50 tracking-tight"
                            >
                                Borrar vuelo
                            </h2>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate">
                                {getAirlinePrefix(flight.flt)}
                                {flight.flt} · {flight.dep} → {flight.arr}
                                {flight.date ? ` · ${flight.date}` : ""}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="shrink-0 p-2 rounded-full hover:bg-white/80 dark:hover:bg-slate-800 text-slate-500 transition-colors disabled:opacity-50"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p
                        role="alert"
                        className="text-sm font-semibold text-amber-950 dark:text-amber-100 leading-relaxed rounded-xl border border-amber-200 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-700/50 px-4 py-3"
                    >
                        El vuelo se eliminará y no podrá ser recuperado. ¿Desea continuar?
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        Se borrarán de la base de datos el vuelo, MVT, hitos y demás datos asociados a esta tarjeta.
                    </p>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleConfirm()}
                            disabled={busy}
                            className="px-5 py-2.5 rounded-xl font-black bg-red-700 hover:bg-red-600 text-white shadow-md transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                            {busy ? "Eliminando…" : "Sí, continuar"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
