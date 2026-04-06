import { useState } from "react";
import { Copy, CheckCircle2, X, MessageSquareText } from "lucide-react";
import type { Flight } from "../types";
import { getAirlinePrefix, formatTimeInUTC } from "../lib/flightHelpers";

interface Props {
    flights: Flight[];
    onClose: () => void;
}

export function OperationsMenu({ flights, onClose }: Props) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Filter flights that have MVT loaded
    const completedFlights = flights.filter(f => !!f.mvtData);

    const generateMessage = (f: Flight) => {
        const day = f.date.split("-")[0]; // "01-04-2026" -> "01"
        const m = f.mvtData!;

        let msg = `${getAirlinePrefix(f.flt)}${f.flt}/${day}.${f.reg}/${f.dep}-${f.arr}\n`;
        msg += `MVT AD (ZZ)\n`;
        const utcATD = formatTimeInUTC(m.atd, f.dep);
        const utcOFF = formatTimeInUTC(m.off, f.dep);
        const utcETA = formatTimeInUTC(m.eta, f.arr);
        msg += `AD: ${utcATD}/${utcOFF} EA:${utcETA}\n`;

        if (m.dlyCod1) {
            msg += `DL: ${m.dlyCod1} ${m.dlyTime1}\n`;
        }
        if (m.dlyCod2) {
            msg += `DL: ${m.dlyCod2} ${m.dlyTime2}\n`;
        }

        msg += `PAX: ${m.paxActual || "0"}/${m.inf || "0"}\n`;
        msg += `LDM\n`;
        msg += `TOTAL${m.totalBags || "0"}B\n`;
        msg += `CARGO ${m.totalCarga || "0"}\n`;
        if (m.load) msg += `LOAD: ${m.load}\n`;
        if (m.fob) msg += `FOB: ${m.fob}\n`;

        if (m.ssee && m.ssee.length > 0) {
            const sseeStr = m.ssee.filter(s => s.type && s.qty).map(s => `${s.qty} ${s.type}`).join(" ");
            if (sseeStr) msg += `SSEE: ${sseeStr}\n`;
        }

        if (m.infoSup) msg += `SI: ${m.infoSup}\n`;
        if (m.supervisor) msg += `COT: ${m.supervisor}\n`;

        return msg.trim();
    };

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-950 w-full max-w-5xl h-[90vh] md:h-auto md:max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                        <MessageSquareText className="w-6 h-6" />
                        Mensajes Operacionales MVT
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/30">
                    {completedFlights.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <MessageSquareText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="text-lg">No hay vuelos con datos MVT completados.</p>
                            <p className="text-sm">Completa el MVT de algún vuelo para generar su mensaje operacional.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {completedFlights.map(flight => {
                                const messageText = generateMessage(flight);
                                const isCopied = copiedId === flight.id;

                                return (
                                    <div key={flight.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                                        <div className="bg-slate-100 dark:bg-slate-900 px-4 py-3 border-b border-border flex justify-between items-center">
                                            <span className="font-bold text-primary flex items-center gap-1.5">
                                                {getAirlinePrefix(flight.flt)} {flight.flt}
                                                <span className="text-xs font-normal text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full">{flight.date}</span>
                                            </span>
                                            <button
                                                onClick={() => handleCopy(flight.id, messageText)}
                                                className={`p-1.5 rounded-md transition-all ${isCopied
                                                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                                                    : "bg-white dark:bg-slate-800 border border-border text-muted-foreground hover:text-primary hover:border-primary/50 shadow-sm"
                                                    }`}
                                                title="Copiar mensaje"
                                            >
                                                {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <div className="p-4 flex-1">
                                            <pre className="text-xs font-mono whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
                                                {messageText}
                                            </pre>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
