import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";

interface Props {
    flt: string;
    reason: string;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
}

export function RemoveQrfConfirmModal({ flt, reason, onClose, onConfirm }: Props) {
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, busy]);

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
            aria-labelledby="remove-qrf-title"
            onClick={busy ? undefined : onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-800/60 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-blue-200/80 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 rounded-xl bg-blue-100 dark:bg-blue-900/50 p-2">
                            <RotateCcw className="w-5 h-5 text-blue-700 dark:text-blue-300" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2
                                id="remove-qrf-title"
                                className="text-lg font-black text-blue-950 dark:text-blue-50 tracking-tight"
                            >
                                Eliminar QRF
                            </h2>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate">
                                {flt}
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
                        className="text-sm font-semibold text-blue-950 dark:text-blue-100 leading-relaxed rounded-xl border border-blue-200 bg-blue-50/90 dark:bg-blue-950/30 dark:border-blue-700/50 px-4 py-3 flex items-start gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-700 dark:text-blue-300" aria-hidden />
                        ¿Desea eliminar el QRF?
                    </p>
                    {reason.trim() && reason !== "—" ? (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                            <span className="font-bold uppercase tracking-wide text-slate-500">Motivo: </span>
                            {reason}
                        </p>
                    ) : null}
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        El registro desaparecerá del status día y de las estadísticas. Si el QRF sigue activo, también se
                        quitará el estado operativo del vuelo.
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
                            className="px-5 py-2.5 rounded-xl font-black bg-red-700 hover:bg-red-600 text-white shadow-md transition-colors disabled:opacity-60"
                        >
                            {busy ? "Eliminando…" : "Sí, eliminar"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
