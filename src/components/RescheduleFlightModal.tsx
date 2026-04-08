import { useState, useEffect } from "react";
import type { Flight } from "../types";
import { X, CalendarClock } from "lucide-react";

interface Props {
    flight: Flight | null;
    onClose: () => void;
    onConfirm: (etd: string, reason: string) => void;
}

/** STD en DB → valor para input type="time" */
function toTimeInputValue(std: string): string {
    const s = String(std ?? "").trim();
    if (/^\d{2}:\d{2}$/.test(s)) return s;
    const digits = s.replace(/\D/g, "");
    if (digits.length >= 4) {
        return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    }
    return "";
}

/** Normaliza a HH:mm */
function normalizeTimeInput(raw: string): string {
    const t = raw.trim().replace(/\s/g, "");
    if (!t) return "";
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return "";
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function RescheduleFlightModal({ flight, onClose, onConfirm }: Props) {
    const [etd, setEtd] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (flight) {
            setEtd(toTimeInputValue(flight.etd || flight.std));
            setReason(flight.rescheduleReason?.trim() ? flight.rescheduleReason : "");
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
        const norm = normalizeTimeInput(etd);
        if (!norm) {
            setError("Indicá la ETD en formato HH:mm (hora estimada de salida).");
            return;
        }
        const r = reason.trim();
        if (!r) {
            setError("Indicá el motivo de la reprogramación.");
            return;
        }
        setError("");
        onConfirm(norm, r);
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-flight-title"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-950/30">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 rounded-xl bg-amber-100 dark:bg-amber-900/50 p-2">
                            <CalendarClock className="w-5 h-5 text-amber-800 dark:text-amber-200" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2 id="reschedule-flight-title" className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                                Reprogramar vuelo
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
                        El <span className="font-bold">STD</span> de programación no cambia. Se guarda un{" "}
                        <span className="font-bold">ETD</span> para hitos y tablero; el MVT sigue comparando demoras contra el STD.
                    </p>
                    <div>
                        <label htmlFor="reschedule-etd" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            ETD — hora estimada de salida
                        </label>
                        <input
                            id="reschedule-etd"
                            type="time"
                            value={etd}
                            onChange={(e) => {
                                setEtd(e.target.value);
                                if (error) setError("");
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">STD programación (fijo):</span>{" "}
                            {flight.std || "—"}
                            {flight.etd?.trim() ? (
                                <>
                                    {" "}
                                    · <span className="font-semibold">ETD vigente:</span> {flight.etd}
                                </>
                            ) : null}
                        </p>
                    </div>
                    <div>
                        <label htmlFor="reschedule-reason" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Motivo
                        </label>
                        <textarea
                            id="reschedule-reason"
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            rows={3}
                            placeholder="Ej.: Restricción en pista / conexión de tripulación /…"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 resize-y min-h-[88px]"
                        />
                    </div>
                    {error && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
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
                            className="px-5 py-2.5 rounded-xl font-black bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-colors"
                        >
                            Guardar reprogramación
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
