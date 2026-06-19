import type { Flight } from "../types";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { getBags, getMvtPaxOnly, getTotalCargaKg } from "../lib/controlHelpers";
import { formatTimelineDlySummary } from "../lib/timelineHelpers";
import { formatMvtSseeSummary, formatMvtTimeDisplay } from "../lib/mvtTime";
import { X } from "lucide-react";

interface Props {
    flight: Flight;
    onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 py-2 border-b border-slate-100 last:border-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 shrink-0">{label}</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums text-left sm:text-right break-words">{value}</span>
        </div>
    );
}

export function ControlTimelineFlightDetailModal({ flight, onClose }: Props) {
    const m = flight.mvtData;
    const label = `${getAirlinePrefix(flight.flt)}${flight.flt}`;
    const cargaKg = getTotalCargaKg(flight);
    const pax = getMvtPaxOnly(flight);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-flight-detail-title"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/40">
                    <div className="min-w-0">
                        <p id="timeline-flight-detail-title" className="text-lg font-black text-slate-900 tabular-nums">
                            {label}
                        </p>
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                            {flight.dep} → {flight.arr}
                            {flight.reg ? ` · ${flight.reg}` : ""}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-5 py-3">
                    <InfoRow label="STD" value={flight.std?.trim() || "—"} />
                    <InfoRow label="STA" value={flight.sta?.trim() || "—"} />
                    <InfoRow label="ATD" value={formatMvtTimeDisplay(m?.atd)} />
                    <InfoRow label="DLY" value={formatTimelineDlySummary(flight)} />
                    <InfoRow label="PAX" value={pax > 0 ? pax.toLocaleString("es-AR") : "—"} />
                    <InfoRow
                        label="CARGA"
                        value={cargaKg > 0 ? `${cargaKg.toLocaleString("es-AR")} kg` : "—"}
                    />
                    <InfoRow label="BAGS" value={getBags(flight) > 0 ? String(getBags(flight)) : "—"} />
                    <InfoRow label="SSEE" value={formatMvtSseeSummary(m?.ssee)} />
                </div>
            </div>
        </div>
    );
}
