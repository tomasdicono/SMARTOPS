import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Flight } from "../types";
import { ClipboardPaste, CheckCircle2, X } from "lucide-react";

interface Props {
    onLoadFlights: (flights: Flight[]) => void;
    onClose: () => void;
}

export function ScheduleParser({ onLoadFlights, onClose }: Props) {
    const [text, setText] = useState("");
    const [parsedCount, setParsedCount] = useState<number | null>(null);

    const handleParse = () => {
        const lines = text.split("\n");
        const newFlights: Flight[] = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            const dateRegex = /^\d{2}-\d{2}-\d{4}/;
            if (!dateRegex.test(line.trim())) continue;

            const parts = line.split(/\t+/);

            if (parts.length >= 9) {
                newFlights.push({
                    id: uuidv4(),
                    date: parts[0].trim(),
                    route: parts[1].trim(),
                    flt: parts[2].trim(),
                    reg: parts[3].trim(),
                    dep: parts[4].trim(),
                    arr: parts[5].trim(),
                    std: parts[6].trim(),
                    sta: parts[7].trim(),
                    pax: parts[8].trim(),
                });
            }
        }

        setParsedCount(newFlights.length);
        if (newFlights.length > 0) {
            onLoadFlights(newFlights);
            setTimeout(() => {
                setParsedCount(null);
                onClose();
            }, 1500);
            setText("");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-950 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold mb-4 text-card-foreground flex items-center gap-2">
                    <ClipboardPaste className="w-6 h-6 text-primary" />
                    Cargar Programación de Vuelos
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Copia y pega aquí la tabla de vuelos tal cual como viene en tu formato de texto.
                </p>

                <textarea
                    className="w-full h-48 p-4 bg-slate-50 dark:bg-slate-900 border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none text-sm font-mono whitespace-pre"
                    placeholder="Ej: 01-04-2026   3832    3832   LV-JQE  AEP  NAT   04:10  09:45  161"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />

                <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm font-medium">
                        {parsedCount !== null && (
                            <span className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                                <CheckCircle2 className="w-4 h-4" />
                                ¡{parsedCount} vuelos cargados! Volviendo al tablero...
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleParse}
                        disabled={!text.trim()}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-bold transition-transform hover:-translate-y-0.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        Procesar Vuelos
                    </button>
                </div>
            </div>
        </div>
    );
}
