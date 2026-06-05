import { useState, useEffect } from "react";
import type { Flight } from "../types";
import { normalizeAirportCode } from "../lib/routeAfectaciones";
import { X } from "lucide-react";
import { AlternoIcon } from "./AlternoIcon";

interface Props {
    flight: Flight | null;
    onClose: () => void;
    onConfirm: (ato: string, reason: string) => void | Promise<void>;
    onClear?: () => void | Promise<void>;
}

export function AlternoModal({ flight, onClose, onConfirm, onClear }: Props) {
    const [ato, setAto] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (flight) {
            setAto(flight.alternoArr?.trim() ? normalizeAirportCode(flight.alternoArr) : "");
            setReason(flight.alternoReason?.trim() ?? "");
            setError("");
            setBusy(false);
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

    const hasExistingAlterno = !!flight.alternoArr?.trim();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const atoNorm = normalizeAirportCode(ato);
        const reasonTrim = reason.trim();
        if (atoNorm.length < 3) {
            setError("Indicá el ATO (código IATA, mínimo 3 caracteres).");
            return;
        }
        if (!reasonTrim) {
            setError("Indicá el motivo del alterno.");
            return;
        }
        const programmedArr = normalizeAirportCode(flight.arr);
        if (atoNorm === programmedArr) {
            setError("El ATO debe ser distinto del destino programado.");
            return;
        }
        setError("");
        setBusy(true);
        try {
            await Promise.resolve(onConfirm(atoNorm, reasonTrim));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const handleClear = async () => {
        if (!onClear || !hasExistingAlterno) return;
        if (!window.confirm("¿Quitar el alterno de este vuelo?")) return;
        setBusy(true);
        setError("");
        try {
            await Promise.resolve(onClear());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alterno-flight-title"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-950/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 rounded-xl bg-amber-100 dark:bg-amber-900/50 p-2">
                            <AlternoIcon className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                        </div>
                        <div className="min-w-0">
                            <h2 id="alterno-flight-title" className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                                Alterno
                            </h2>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate">
                                {flight.flt} · {flight.dep} → {flight.arr} · STD {flight.std}
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

                <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        El destino programado ({normalizeAirportCode(flight.arr)}) se mantiene en la programación.
                        En la tarjeta se mostrará tachado y el ATO debajo.
                    </p>
                    <div>
                        <label htmlFor="alterno-ato" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            ATO (alterno)
                        </label>
                        <input
                            id="alterno-ato"
                            type="text"
                            value={ato}
                            onChange={(e) => {
                                setAto(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4));
                                if (error) setError("");
                            }}
                            disabled={busy}
                            placeholder="Ej.: COR, MDZ, SLA"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                            autoComplete="off"
                            maxLength={4}
                        />
                    </div>
                    <div>
                        <label htmlFor="alterno-reason" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Motivo del alterno
                        </label>
                        <textarea
                            id="alterno-reason"
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError("");
                            }}
                            disabled={busy}
                            rows={4}
                            placeholder="Ej.: MET en destino / baja visibilidad / falla en pista /…"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 resize-y min-h-[100px]"
                        />
                    </div>
                    {error && <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{error}</p>}
                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
                        {hasExistingAlterno && onClear ? (
                            <button
                                type="button"
                                onClick={() => void handleClear()}
                                disabled={busy}
                                className="px-4 py-2.5 rounded-xl font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                            >
                                Quitar alterno
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            Volver
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="px-5 py-2.5 rounded-xl font-black bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-colors disabled:opacity-60"
                        >
                            {busy ? "Guardando…" : "Confirmar alterno"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
