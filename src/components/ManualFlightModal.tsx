import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Flight } from "../types";
import { CirclePlus, X } from "lucide-react";

interface Props {
    onSubmit: (flight: Flight) => void;
    onClose: () => void;
    /** Fecha del tablero (YYYY-MM-DD) para prellenar */
    initialDateIso: string;
}

/** YYYY-MM-DD → DD-MM-YYYY (formato de vuelo en Firebase) */
function isoToFlightDate(iso: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
}

function defaultIso(iso: string): string {
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** HH:MM o HH:MM:SS → HH:MM (como en la programación pegada) */
function normalizeTime(t: string): string {
    const p = t.split(":").filter(Boolean);
    if (p.length < 2) return t.trim();
    return `${p[0].padStart(2, "0")}:${p[1].padStart(2, "0")}`;
}

export function ManualFlightModal({ onSubmit, onClose, initialDateIso }: Props) {
    const [dateIso, setDateIso] = useState(() => defaultIso(initialDateIso));
    const [route, setRoute] = useState("");
    const [flt, setFlt] = useState("");
    const [reg, setReg] = useState("");
    const [dep, setDep] = useState("");
    const [arr, setArr] = useState("");
    const [std, setStd] = useState("");
    const [sta, setSta] = useState("");
    const [pax, setPax] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        setDateIso(defaultIso(initialDateIso));
    }, [initialDateIso]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        if (
            !dateIso ||
            !route.trim() ||
            !flt.trim() ||
            !reg.trim() ||
            !dep.trim() ||
            !arr.trim() ||
            !std ||
            !sta ||
            !pax.trim()
        ) {
            setError("Completá todos los campos obligatorios.");
            return;
        }
        const dateStr = isoToFlightDate(dateIso);
        if (!dateStr) {
            setError("La fecha no es válida.");
            return;
        }
        onSubmit({
            id: uuidv4(),
            date: dateStr,
            route: route.trim(),
            flt: flt.trim(),
            reg: reg.trim().toUpperCase(),
            dep: dep.trim().toUpperCase().slice(0, 4),
            arr: arr.trim().toUpperCase().slice(0, 4),
            std: normalizeTime(std),
            sta: normalizeTime(sta),
            pax: pax.trim(),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white dark:bg-slate-950 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col relative animate-in zoom-in-95 duration-200 my-8">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold mb-1 text-card-foreground flex items-center gap-2 pr-10">
                    <CirclePlus className="w-6 h-6 text-cyan-500 shrink-0" />
                    Alta manual de vuelo
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                    Mismos datos que la programación pegada: fecha, ruta, vuelo, matrícula, aeropuertos, horarios y PAX.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                Fecha del vuelo
                            </label>
                            <input
                                type="date"
                                required
                                value={dateIso}
                                onChange={(e) => setDateIso(e.target.value)}
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-semibold [color-scheme:light]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                Ruta (código / descripción)
                            </label>
                            <input
                                type="text"
                                value={route}
                                onChange={(e) => setRoute(e.target.value)}
                                placeholder="Ej. 3832"
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                Número de vuelo
                            </label>
                            <input
                                type="text"
                                value={flt}
                                onChange={(e) => setFlt(e.target.value)}
                                placeholder="Ej. 3102"
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                Matrícula
                            </label>
                            <input
                                type="text"
                                value={reg}
                                onChange={(e) => setReg(e.target.value)}
                                placeholder="Ej. LV-JQE"
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono uppercase"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                PAX programados
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={pax}
                                onChange={(e) => setPax(e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="Ej. 161"
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                Origen (IATA)
                            </label>
                            <input
                                type="text"
                                value={dep}
                                onChange={(e) => setDep(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
                                placeholder="AEP"
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                Destino (IATA)
                            </label>
                            <input
                                type="text"
                                value={arr}
                                onChange={(e) => setArr(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
                                placeholder="COR"
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                STD
                            </label>
                            <input
                                type="time"
                                value={std}
                                onChange={(e) => setStd(e.target.value)}
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm [color-scheme:light]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                STA
                            </label>
                            <input
                                type="time"
                                value={sta}
                                onChange={(e) => setSta(e.target.value)}
                                className="w-full rounded-xl border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm [color-scheme:light]"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-3 justify-end pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-muted transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-8 py-2.5 rounded-xl font-black uppercase tracking-wide text-sm shadow-md transition-transform hover:-translate-y-0.5"
                        >
                            Guardar vuelo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
