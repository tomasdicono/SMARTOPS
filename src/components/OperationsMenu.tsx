import { useMemo, useState } from "react";
import { Copy, CheckCircle2, X, MessageSquareText, Search } from "lucide-react";
import type { Flight } from "../types";
import { getAirlinePrefix, formatTimeInUTC, buildMvtOutListTitle } from "../lib/flightHelpers";
import { mvtLoadLineForMessage } from "../lib/a321LoadBays";

interface Props {
    flights: Flight[];
    onClose: () => void;
}

export function OperationsMenu({ flights, onClose }: Props) {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const completedFlights = flights.filter((f) => !!f.mvtData);

    const filteredFlights = useMemo(() => {
        const raw = searchQuery.trim().toUpperCase();
        if (!raw) return completedFlights;
        const tokens = raw.split(/\s+/).filter(Boolean);
        return completedFlights.filter((f) => {
            const hay = [
                buildMvtOutListTitle(f),
                f.flt,
                f.dep,
                f.arr,
                f.date,
                f.reg,
                `${f.dep}-${f.arr}`,
                getAirlinePrefix(f.flt),
            ]
                .join(" ")
                .toUpperCase();
            return tokens.every((t) => hay.includes(t));
        });
    }, [completedFlights, searchQuery]);

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
        const loadLine = mvtLoadLineForMessage(m, f.reg);
        if (loadLine) msg += `LOAD: ${loadLine}\n`;
        if (m.fob) msg += `FOB: ${m.fob}\n`;

        if (m.ssee && m.ssee.length > 0) {
            const sseeStr = m.ssee.filter((s) => s.type && s.qty).map((s) => `${s.qty} ${s.type}`).join(" ");
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
            <div className="bg-white w-full max-w-5xl h-[90vh] md:h-auto md:max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">

                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
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

                {completedFlights.length > 0 && (
                    <div className="px-6 py-3 border-b border-slate-200 bg-white shrink-0">
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 max-w-xl">
                            <Search className="w-4 h-4 text-slate-500 shrink-0" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar por vuelo, ruta, fecha, matrícula…"
                                className="w-full bg-transparent text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none min-w-0"
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50 min-h-0">
                    {completedFlights.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <MessageSquareText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="text-lg">No hay vuelos con datos MVT completados.</p>
                            <p className="text-sm">Completa el MVT de algún vuelo para generar su mensaje operacional.</p>
                        </div>
                    ) : filteredFlights.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-semibold">No hay resultados para &quot;{searchQuery.trim()}&quot;</p>
                            <p className="text-sm">Probá con otro número de vuelo, aeropuerto o fecha.</p>
                        </div>
                    ) : (
                        <ul className="max-w-4xl mx-auto flex flex-col gap-3 list-none p-0 m-0">
                            {filteredFlights.map((flight) => {
                                const messageText = generateMessage(flight);
                                const isCopied = copiedId === flight.id;
                                const listTitle = buildMvtOutListTitle(flight);

                                return (
                                    <li key={flight.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                                        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-slate-100 border-b border-slate-200">
                                            <span className="font-bold text-slate-900 text-sm sm:text-base leading-snug tracking-tight pr-2">
                                                {listTitle}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(flight.id, messageText)}
                                                className={`shrink-0 p-2 rounded-lg transition-all ${
                                                    isCopied
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/50 shadow-sm"
                                                }`}
                                                title="Copiar mensaje"
                                            >
                                                {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <div className="p-4">
                                            <pre className="text-xs font-mono whitespace-pre-wrap break-words text-slate-700">
                                                {messageText}
                                            </pre>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
