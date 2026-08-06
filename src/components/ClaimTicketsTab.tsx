import { useState } from "react";
import type { Flight, ClaimTicket, User } from "../types";
import { format } from "date-fns";
import { Send, CheckCircle, Clock } from "lucide-react";
import { push, child, ref } from "firebase/database";
import { db } from "../lib/firebase";

interface Props {
    flight: Flight;
    currentUser: User | null;
    onSaveTickets: (tickets: Record<string, ClaimTicket>) => void;
    readOnly?: boolean;
}

const COMMON_REASONS = [
    "Falta ITC",
    "Falta Fuel",
    "Falta puerta de embarque",
    "Manto Activado",
    "Falta limpieza",
    "Falta tripulación",
];

export function ClaimTicketsTab({ flight, currentUser, onSaveTickets, readOnly }: Props) {
    const [reason, setReason] = useState("");
    const [priority, setPriority] = useState<"1" | "2" | "3">("3");

    const isSc = currentUser?.role === "SC";
    const ticketLabel = isSc ? "Ticket" : "Reclamo";
    const ticketsLabel = isSc ? "Tickets" : "Reclamos";

    const tickets = Object.values(flight.claimTickets || {}).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const handleCreateTicket = () => {
        if (!reason.trim() || !currentUser || readOnly) return;

        const newId = push(child(ref(db), "claimTickets")).key;
        if (!newId) return;

        const ticket: ClaimTicket = {
            id: newId,
            text: reason.trim(),
            priority,
            status: "pending",
            createdAt: new Date().toISOString(),
            createdByUid: currentUser.id,
            createdByName: currentUser.name,
        };

        const updated = { ...(flight.claimTickets || {}), [newId]: ticket };
        onSaveTickets(updated);
        setReason("");
        setPriority("3");
    };

    const handleCloseTicket = (ticketId: string) => {
        if (!currentUser || readOnly) return;
        const ticket = flight.claimTickets?.[ticketId];
        if (!ticket) return;

        const updatedTicket: ClaimTicket = {
            ...ticket,
            status: "closed",
            closedAt: new Date().toISOString(),
            closedByUid: currentUser.id,
            closedByName: currentUser.name,
        };

        const updated = { ...(flight.claimTickets || {}), [ticketId]: updatedTicket };
        onSaveTickets(updated);
    };

    const getPriorityColor = (p: string) => {
        if (p === "1") return "bg-rose-50 text-rose-900 border-rose-200";
        if (p === "2") return "bg-amber-50 text-amber-900 border-amber-200";
        return "bg-emerald-50 text-emerald-900 border-emerald-200";
    };

    const getPriorityBadge = (p: string) => {
        if (p === "1") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-600 text-white shadow-sm">P1 ALTA</span>;
        if (p === "2") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500 text-white shadow-sm">P2 MEDIA</span>;
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white shadow-sm">P3 NORMAL</span>;
    };

    const formatDate = (iso?: string) => {
        if (!iso) return "";
        try {
            return format(new Date(iso), "HH:mm");
        } catch {
            return "";
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-8">
            {!readOnly && (
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <Send className="w-4 h-4 text-blue-600" />
                        Nuevo {ticketLabel} a HCC
                    </h3>
                    
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2 mb-2">
                            {COMMON_REASONS.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReason(r)}
                                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4">
                            <input
                                type="text"
                                placeholder={`Escribe el ${ticketLabel.toLowerCase()} (ej. Falta ITC)...`}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="flex-1 rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                            />
                            
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as "1" | "2" | "3")}
                                className="w-full sm:w-40 rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border font-medium"
                            >
                                <option value="3">🟢 Prioridad 3</option>
                                <option value="2">🟡 Prioridad 2</option>
                                <option value="1">🔴 Prioridad 1</option>
                            </select>
                            
                            <button
                                onClick={handleCreateTicket}
                                disabled={!reason.trim()}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                            >
                                Enviar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    Historial de {ticketsLabel}
                </h3>
                
                {tickets.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
                        <p className="text-slate-500 text-sm font-medium">No hay {ticketsLabel.toLowerCase()} para este vuelo.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tickets.map((t) => (
                            <div key={t.id} className={`p-4 rounded-xl border ${getPriorityColor(t.priority)} shadow-sm`}>
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            {getPriorityBadge(t.priority)}
                                            <span className="text-xs font-semibold opacity-75">
                                                Enviado {formatDate(t.createdAt)} por {t.createdByName}
                                            </span>
                                        </div>
                                        <p className="font-bold text-sm md:text-base leading-snug">{t.text}</p>
                                        
                                        <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium">
                                            {t.status === "pending" && (
                                                <span className="flex items-center gap-1 opacity-75 text-amber-800">
                                                    <Clock size={14} /> Esperando recepción por HCC...
                                                </span>
                                            )}
                                            {t.status === "accepted" && (
                                                <span className="flex items-center gap-1 text-blue-800 bg-blue-100/50 px-2 py-1 rounded">
                                                    <CheckCircle size={14} /> Recibido por HCC ({formatDate(t.acceptedAt)})
                                                </span>
                                            )}
                                            {t.status === "closed" && (
                                                <span className="flex items-center gap-1 text-emerald-800 bg-emerald-100/50 px-2 py-1 rounded">
                                                    <CheckCircle size={14} /> Solucionado y cerrado ({formatDate(t.closedAt)})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {!readOnly && t.status !== "closed" && (
                                        <button
                                            onClick={() => handleCloseTicket(t.id)}
                                            className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold rounded-lg shadow-sm transition-colors text-xs"
                                        >
                                            Marcar como resuelto
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
