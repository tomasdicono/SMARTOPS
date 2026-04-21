import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ref, onValue, set, get } from "firebase/database";
import type { Flight, LimpiezaChecklistState, User } from "../types";
import { db } from "../lib/firebase";
import { forFirebaseDb } from "../lib/forFirebaseDb";
import {
    areAllLimpiezaChecklistItemsDone,
    getLimpiezaChecklistMode,
    getTasksForLimpiezaMode,
    mergeChecklistItems,
    type LimpiezaChecklistMode,
} from "../lib/limpiezaChecklistHelpers";
import { coercePernocteRow } from "../lib/pernocteHelpers";
import { ClipboardCheck, Loader2 } from "lucide-react";

interface Props {
    flight: Flight;
    dayFlights: Flight[];
    selectedIso: string;
    currentUser: User | null;
    readOnly?: boolean;
}

export function LimpiezaChecklistTab({ flight, dayFlights, selectedIso, currentUser, readOnly }: Props) {
    const mode = useMemo(
        () => getLimpiezaChecklistMode(flight, dayFlights, selectedIso),
        [flight, dayFlights, selectedIso]
    );
    const tasks = useMemo(() => (mode ? getTasksForLimpiezaMode(mode) : []), [mode]);

    const [items, setItems] = useState<Record<string, boolean>>({});
    const [observaciones, setObservaciones] = useState("");
    const [meta, setMeta] = useState<{ updatedAt?: string; updatedByName?: string }>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const obsFocusedRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const observacionesRef = useRef(observaciones);
    observacionesRef.current = observaciones;

    /** Casilla Pernocte `limpieza` en Firebase alineada al checklist (solo modo pernocte). */
    const syncPernocteLimpiezaFlag = useCallback(
        async (merged: Record<string, boolean>) => {
            if (mode !== "pernocte") return;
            const reg = String(flight.reg ?? "").trim();
            if (!reg || !String(selectedIso).trim()) return;
            const allDone = areAllLimpiezaChecklistItemsDone(merged, "pernocte");
            const r = ref(db, `pernocte/${selectedIso}/${reg}`);
            try {
                const snap = await get(r);
                const prev = coercePernocteRow(snap.val());
                if (prev.limpieza === allDone) return;
                await set(r, forFirebaseDb({ ...prev, limpieza: allDone }));
            } catch (e) {
                console.error(e);
            }
        },
        [mode, flight.reg, selectedIso]
    );

    const persist = useCallback(
        (nextItems: Record<string, boolean>, nextObs: string, m: LimpiezaChecklistMode) => {
            if (readOnly || !flight.id) return;
            setSaving(true);
            const payload: LimpiezaChecklistState = {
                mode: m,
                items: nextItems,
                observaciones: nextObs,
                updatedAt: new Date().toISOString(),
                updatedByUid: currentUser?.id ?? "",
                updatedByName: currentUser?.name?.trim() || currentUser?.email || "",
            };
            set(ref(db, `limpiezaChecklist/${flight.id}`), forFirebaseDb(payload))
                .then(() => {
                    if (m === "pernocte") return syncPernocteLimpiezaFlag(nextItems);
                })
                .catch((e) => {
                    console.error(e);
                    alert(e instanceof Error ? e.message : "No se pudo guardar el checklist.");
                })
                .finally(() => setSaving(false));
        },
        [flight.id, currentUser, readOnly, syncPernocteLimpiezaFlag]
    );

    useEffect(() => {
        if (!mode || !flight.id) {
            setLoading(false);
            return;
        }
        const r = ref(db, `limpiezaChecklist/${flight.id}`);
        const unsub = onValue(
            r,
            (snap) => {
                const raw = snap.val() as Partial<LimpiezaChecklistState> | null;
                const merged = mergeChecklistItems(mode, raw?.items);
                setItems(merged);
                if (!obsFocusedRef.current) {
                    setObservaciones(typeof raw?.observaciones === "string" ? raw.observaciones : "");
                }
                setMeta({
                    updatedAt: raw?.updatedAt,
                    updatedByName: raw?.updatedByName,
                });
                setLoading(false);
                /** Solo si ya hay checklist guardado: evita pisar «Limpieza» manual en Pernocte antes de abrir ANEXO A. */
                if (mode === "pernocte" && raw != null) {
                    void syncPernocteLimpiezaFlag(merged);
                }
            },
            () => setLoading(false)
        );
        return () => unsub();
    }, [flight.id, mode, syncPernocteLimpiezaFlag]);

    const grouped = useMemo(() => {
        const map = new Map<string, typeof tasks>();
        for (const t of tasks) {
            if (!map.has(t.section)) map.set(t.section, []);
            map.get(t.section)!.push(t);
        }
        return [...map.entries()];
    }, [tasks]);

    const onToggle = (id: string, checked: boolean) => {
        if (readOnly || !mode) return;
        const next = { ...items, [id]: checked };
        setItems(next);
        persist(next, observacionesRef.current, mode);
    };

    const scheduleObsSave = (text: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (readOnly || !mode) return;
            persist(itemsRef.current, text, mode);
        }, 500);
    };

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    if (!mode) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">
                Este vuelo no aplica checklist ANEXO A (tránsito &gt;3:30 h o pernocte).
            </div>
        );
    }

    const title =
        mode === "pernocte"
            ? "Pernocte / escala larga — ANEXO A"
            : "Tránsito & escala (&gt;03:30 h bloque) — ANEXO A";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-4 shadow-sm">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700 shrink-0">
                        <ClipboardCheck className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">{title}</h3>
                        <p className="text-xs font-semibold text-slate-500 mt-1">
                            Los datos se guardan en la nube y los ve el mismo equipo HCC / Limpieza.
                            {mode === "pernocte" ? (
                                <span className="block mt-1 text-violet-800">
                                    Con checklist pernocte completo se marca automáticamente la casilla Limpieza en la vista Pernocte
                                    (y se desmarca si falta algún ítem).
                                </span>
                            ) : null}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 shrink-0">
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cargando…
                        </>
                    ) : saving ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                            Guardando…
                        </>
                    ) : null}
                </div>
            </div>

            {meta.updatedAt ? (
                <p className="text-[11px] font-semibold text-slate-500">
                    Última actualización:{" "}
                    {new Date(meta.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    {meta.updatedByName ? ` · ${meta.updatedByName}` : ""}
                </p>
            ) : null}

            <div className="space-y-8">
                {grouped.map(([section, list]) => (
                    <section key={section} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h4 className="text-xs font-black uppercase tracking-wider text-violet-800 border-b border-slate-100 pb-2 mb-3">
                            {section}
                        </h4>
                        <ul className="space-y-3">
                            {list.map((task) => (
                                <li key={task.id} className="flex gap-3 items-start">
                                    <input
                                        type="checkbox"
                                        id={`lc-${flight.id}-${task.id}`}
                                        checked={!!items[task.id]}
                                        disabled={readOnly || loading}
                                        onChange={(e) => onToggle(task.id, e.target.checked)}
                                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
                                    />
                                    <label
                                        htmlFor={`lc-${flight.id}-${task.id}`}
                                        className={`text-sm font-semibold leading-snug text-slate-800 ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                                    >
                                        {task.label}
                                        {mode === "transito" && task.transito === "foco" ? (
                                            <span className="block text-xs font-bold text-amber-800 mt-1">
                                                Criterio tránsito: foco visible de suciedad
                                            </span>
                                        ) : null}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-amber-50/50 p-4">
                <label htmlFor={`lc-obs-${flight.id}`} className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                    Observaciones (tareas no realizadas, incidencias)
                </label>
                <textarea
                    id={`lc-obs-${flight.id}`}
                    value={observaciones}
                    disabled={readOnly || loading}
                    onChange={(e) => {
                        const v = e.target.value;
                        setObservaciones(v);
                        scheduleObsSave(v);
                    }}
                    onFocus={() => {
                        obsFocusedRef.current = true;
                    }}
                    onBlur={(e) => {
                        obsFocusedRef.current = false;
                        if (mode) persist(itemsRef.current, e.target.value, mode);
                    }}
                    rows={4}
                    placeholder="Ej.: Baño 3L con mancha persistente; falta repuesto de bolsas en galley…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
                />
            </div>

            <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
                * Validar materiales con Tabla 01 por AOC del documento ANEXO A, donde corresponda a bolsas de basura y similares.
            </p>
        </div>
    );
}
