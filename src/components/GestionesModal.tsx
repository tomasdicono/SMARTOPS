import { useState, useMemo } from "react";
import type { Flight } from "../types";
import {
    parseGestionesTable,
    findFlightForGestiones,
    applyGestionesRowToFlight,
    parseDateToIso,
    type ParseGestionesResult,
} from "../lib/gestionesTableParse";
import { X, Table2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
    flights: Flight[];
    onClose: () => void;
    onApply: (parsed: ParseGestionesResult, opts: { syncStdSta: boolean; defaultRescheduleReason: string }) => Promise<void>;
}

/** Solo si el usuario no escribe motivo en el modal */
const FALLBACK_REASON = "Gestión masiva (pegado tabla)";

export function GestionesModal({ flights, onClose, onApply }: Props) {
    const [text, setText] = useState("");
    const [motivoOperativo, setMotivoOperativo] = useState("");
    const [syncStdSta, setSyncStdSta] = useState(false);
    const [busy, setBusy] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);

    const reasonEfectivo = motivoOperativo.trim() || FALLBACK_REASON;

    const parsed = useMemo(() => {
        if (!text.trim()) return null;
        return parseGestionesTable(text);
    }, [text]);

    const preview = useMemo(() => {
        if (!parsed || parsed.rows.length === 0) return [];
        return parsed.rows.map((row) => {
            const flight = findFlightForGestiones(flights, row);
            const iso = row.raw.fecha ? parseDateToIso(row.raw.fecha) : null;
            let note: string | null = null;
            if (flight && row.raw.original?.trim()) {
                const expect = row.raw.original.trim().toUpperCase();
                if (flight.reg.toUpperCase() !== expect) {
                    note = `Matrícula en sistema (${flight.reg}) ≠ ORIGINAL del pegado (${expect})`;
                }
            }
            const previewFlight = flight
                ? applyGestionesRowToFlight(flight, row, {
                      syncStdSta,
                      defaultRescheduleReason: reasonEfectivo,
                  })
                : null;
            return { row, flight, iso, note, previewFlight };
        });
    }, [parsed, flights, syncStdSta, reasonEfectivo]);

    const stats = useMemo(() => {
        const ok = preview.filter((p) => p.flight).length;
        const miss = preview.length - ok;
        return { ok, miss, total: preview.length };
    }, [preview]);

    const handleApply = async () => {
        if (!parsed || parsed.rows.length === 0) return;
        setApplyError(null);
        setBusy(true);
        try {
            await onApply(parsed, {
                syncStdSta,
                defaultRescheduleReason: motivoOperativo.trim() || FALLBACK_REASON,
            });
            setText("");
            setMotivoOperativo("");
            onClose();
        } catch (e) {
            setApplyError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gestiones-title"
        >
            <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    <h2 id="gestiones-title" className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <Table2 className="w-5 h-5 text-cyan-500" />
                        Gestiones (pegar tabla)
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

                <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold leading-relaxed">
                        Pegá la tabla tal como sale del mensaje (fechas, vuelos, matrículas ORIGINAL/CAMBIO, horarios STD/STA/ETD/ETA).
                        Se reconoce una fila de encabezados o el orden fijo de 10 columnas; también un bloque con una etiqueta por línea
                        (FECHA, VUELO, …) y debajo los valores en el mismo orden.
                    </p>

                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={syncStdSta}
                            onChange={(e) => setSyncStdSta(e.target.checked)}
                            className="mt-1 rounded border-slate-300"
                        />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Actualizar también STD y STA según la tabla (por defecto solo se aplican matrícula CAMBIO, ETD y ETA).
                        </span>
                    </label>

                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                            Motivo operativo
                        </label>
                        <textarea
                            className="w-full min-h-[72px] p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y placeholder:text-slate-400"
                            placeholder="Ej.: Coordinación OCC · cambio de equipo por mantenimiento · demora ATC…"
                            value={motivoOperativo}
                            onChange={(e) => setMotivoOperativo(e.target.value)}
                            rows={2}
                        />
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1.5">
                            Se guarda como motivo de reprogramación (ETD) y, en cancelaciones, si la fila no trae columna MOTIVO.{" "}
                            {motivoOperativo.trim() ? (
                                <span className="text-slate-700 dark:text-slate-300">Vista previa del texto: «{reasonEfectivo.slice(0, 120)}
                                {reasonEfectivo.length > 120 ? "…" : ""}»</span>
                            ) : (
                                <span className="text-amber-700 dark:text-amber-300">Vacío: se usará «{FALLBACK_REASON}».</span>
                            )}
                        </p>
                    </div>

                    <textarea
                        className="w-full min-h-[140px] p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-mono focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y"
                        placeholder={`FECHA\tVUELO\tDEP\tARR\tORIGINAL\tCAMBIO\tSTD\tSTA\tETD\tETA\n2026-04-08\tWJ3234\tEZE\tTUC\t...\t...\t19:45LT\t...\t23:00LT\t01:00LT`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck={false}
                    />

                    {parsed && parsed.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 space-y-1">
                            {parsed.warnings.map((w, i) => (
                                <p key={i}>{w}</p>
                            ))}
                        </div>
                    )}

                    {preview.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
                                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Coincidencias: {stats.ok}/{stats.total}
                                </span>
                                {stats.miss > 0 && (
                                    <span className="text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4" />
                                        Sin vuelo en sistema: {stats.miss}
                                    </span>
                                )}
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600 max-h-[240px] overflow-y-auto">
                                <table className="w-full text-xs min-w-[640px]">
                                    <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                                        <tr className="text-left font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                            <th className="px-2 py-2">#</th>
                                            <th className="px-2 py-2">Vuelo</th>
                                            <th className="px-2 py-2">Estado</th>
                                            <th className="px-2 py-2">Cambios previstos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {preview.map((p, i) => (
                                            <tr key={i} className={p.flight ? "" : "bg-amber-50/50 dark:bg-amber-950/20"}>
                                                <td className="px-2 py-2 tabular-nums">{p.row.rowIndex}</td>
                                                <td className="px-2 py-2 font-mono font-bold">
                                                    {p.row.raw.vuelo ?? "—"}{" "}
                                                    <span className="text-slate-500 font-normal">{p.iso ?? ""}</span>
                                                </td>
                                                <td className="px-2 py-2">
                                                    {p.flight ? (
                                                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Encontrado</span>
                                                    ) : (
                                                        <span className="text-amber-800 dark:text-amber-200 font-semibold">No encontrado</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                                                    {p.previewFlight ? (
                                                        <span className="break-words">
                                                            {p.row.raw.cambio ? `Reg → ${p.previewFlight.reg}` : ""}
                                                            {p.row.raw.etd ? ` · ETD ${p.previewFlight.etd}` : ""}
                                                            {p.row.raw.eta ? ` · ETA MVT ${p.previewFlight.mvtData?.eta}` : ""}
                                                            {syncStdSta && p.row.raw.std ? ` · STD ${p.previewFlight.std}` : ""}
                                                            {syncStdSta && p.row.raw.sta ? ` · STA ${p.previewFlight.sta}` : ""}
                                                            {p.previewFlight.cancelled ? " · CANCELADO" : ""}
                                                        </span>
                                                    ) : (
                                                        "—"
                                                    )}
                                                    {p.note && (
                                                        <span className="block text-amber-700 dark:text-amber-300 mt-0.5">{p.note}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {applyError && (
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                            {applyError}
                        </p>
                    )}
                </div>

                <div className="flex gap-3 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="flex-1 py-3 rounded-xl font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                        Cerrar
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleApply()}
                        disabled={busy || !parsed || parsed.rows.length === 0 || stats.ok === 0}
                        className="flex-1 py-3 rounded-xl font-black bg-cyan-600 hover:bg-cyan-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? "Aplicando…" : "Aplicar a vuelos"}
                    </button>
                </div>
            </div>
        </div>
    );
}
