import { useState, useMemo } from "react";
import type { Flight, ClaimTicket, User } from "../types";
import { format } from "date-fns";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { updateFlight } from "../lib/flightsDb";
import { CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface Props {
    flights: Flight[];
    currentUser: User | null;
}

export function HccTicketsView({ flights, currentUser }: Props) {
    // Only keep flights that actually have tickets
    const flightsWithTickets = useMemo(() => {
        return flights
            .filter((f) => {
                if (!f.claimTickets) return false;
                return Object.keys(f.claimTickets).length > 0;
            })
            .sort((a, b) => {
                const aTime = a.etd?.trim() || a.std;
                const bTime = b.etd?.trim() || b.std;
                return aTime.localeCompare(bTime);
            });
    }, [flights]);

    const handleAcceptTicket = async (flightId: string, ticketId: string, ticket: ClaimTicket) => {
        if (!currentUser) return;
        const updatedTicket: ClaimTicket = {
            ...ticket,
            status: "accepted",
            acceptedAt: new Date().toISOString(),
            acceptedByUid: currentUser.id,
            acceptedByName: currentUser.name,
        };
        const flight = flights.find(f => f.id === flightId);
        if (!flight) return;

        const updatedTickets = { ...(flight.claimTickets || {}), [ticketId]: updatedTicket };
        try {
            await updateFlight(flightId, { claimTickets: updatedTickets });
        } catch (err) {
            console.error("Error accepting ticket", err);
        }
    };

    const getPriorityColorRow = (p: string) => {
        if (p === "1") return "bg-rose-50 hover:bg-rose-100 border-l-4 border-l-rose-500";
        if (p === "2") return "bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-500";
        return "bg-emerald-50 hover:bg-emerald-100 border-l-4 border-l-emerald-500";
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
        <div className="flex-1 p-6 overflow-y-auto bg-slate-100">
            <div className="max-w-[1600px] mx-auto space-y-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Tickets SC (HCC)</h1>
                        <p className="text-sm text-slate-500 mt-1">Gestión y recepción de tickets operativos de Station Control.</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Vuelo / Ruta</th>
                                    <th className="px-6 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-wider">STD / ETD</th>
                                    <th className="px-6 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Tickets Activos</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {flightsWithTickets.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                                            <div className="flex flex-col items-center justify-center">
                                                <CheckCircle className="w-10 h-10 text-emerald-400 mb-3" />
                                                <p className="text-base font-bold">No hay tickets activos en este momento.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    flightsWithTickets.map((f) => {
                                        const ticketsList = Object.values(f.claimTickets || {}).sort(
                                            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                                        );

                                        return (
                                            <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-base font-black text-slate-900">
                                                            {getAirlinePrefix(f.flt)} {f.flt}
                                                        </span>
                                                        <span className="text-sm text-slate-500 font-medium">
                                                            {f.dep} - {f.arr}
                                                        </span>
                                                        <span className="text-xs text-slate-400 font-mono mt-0.5">{f.reg}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-700">{f.std}</span>
                                                        {f.etd?.trim() && (
                                                            <span className="text-sm font-bold text-amber-700 mt-0.5">ETD {f.etd}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-3">
                                                        {ticketsList.map((t) => (
                                                            <div key={t.id} className={`p-3 rounded-lg border shadow-sm ${getPriorityColorRow(t.priority)}`}>
                                                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded text-white ${
                                                                                t.priority === "1" ? "bg-rose-600" : t.priority === "2" ? "bg-amber-500" : "bg-emerald-600"
                                                                            }`}>
                                                                                P{t.priority}
                                                                            </span>
                                                                            <span className="text-xs font-semibold text-slate-600 opacity-80">
                                                                                {formatDate(t.createdAt)} - {t.createdByName}
                                                                            </span>
                                                                        </div>
                                                                        <p className="font-bold text-sm text-slate-900">{t.text}</p>
                                                                    </div>
                                                                    
                                                                    <div className="flex items-center gap-2">
                                                                        {t.status === "pending" && (
                                                                            <button
                                                                                onClick={() => handleAcceptTicket(f.id, t.id, t)}
                                                                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors whitespace-nowrap"
                                                                            >
                                                                                Aceptar Ticket
                                                                            </button>
                                                                        )}
                                                                        {t.status === "accepted" && (
                                                                            <span className="px-3 py-1.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg border border-blue-200 flex items-center gap-1">
                                                                                <Clock className="w-3.5 h-3.5" /> Aceptado ({formatDate(t.acceptedAt)})
                                                                            </span>
                                                                        )}
                                                                        {t.status === "closed" && (
                                                                            <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                                                                                <CheckCircle className="w-3.5 h-3.5" /> Cerrado ({formatDate(t.closedAt)})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
