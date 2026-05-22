import { useMemo, useState, type FormEvent } from "react";
import {
    listFleetAircraftSorted,
    normalizeFleetReg,
    FLEET_MODEL_OPTIONS,
    fleetFamilyLabel,
    type FleetModelOption,
} from "../lib/fleetData";
import { Plane, Plus, Search, Loader2 } from "lucide-react";

interface MatriculasViewProps {
    canEdit: boolean;
    fleetVersion: number;
    onSaveModel: (reg: string, model: FleetModelOption) => Promise<void>;
    onAdd: (reg: string, model: FleetModelOption) => Promise<void>;
}

export function MatriculasView({ canEdit, fleetVersion, onSaveModel, onAdd }: MatriculasViewProps) {
    const [search, setSearch] = useState("");
    const [newReg, setNewReg] = useState("");
    const [newModel, setNewModel] = useState<FleetModelOption>("A320-271");
    const [savingReg, setSavingReg] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const aircraft = useMemo(() => {
        void fleetVersion;
        return listFleetAircraftSorted();
    }, [fleetVersion]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return aircraft;
        return aircraft.filter(
            (a) =>
                a.registration.toLowerCase().includes(q) ||
                a.model.toLowerCase().includes(q) ||
                fleetFamilyLabel(a.model).toLowerCase().includes(q),
        );
    }, [aircraft, search]);

    const counts = useMemo(() => {
        let a320 = 0;
        let a321 = 0;
        for (const a of aircraft) {
            if (fleetFamilyLabel(a.model) === "A321") a321 += 1;
            else a320 += 1;
        }
        return { total: aircraft.length, a320, a321 };
    }, [aircraft]);

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        const reg = normalizeFleetReg(newReg);
        if (!reg) {
            setError("Ingresá una matrícula.");
            return;
        }
        if (aircraft.some((a) => a.registration === reg)) {
            setError(`La matrícula ${reg} ya está en el sistema. Cambiá el tipo en la tabla.`);
            return;
        }
        setAdding(true);
        try {
            await onAdd(reg, newModel);
            setNewReg("");
            setNewModel("A320-271");
        } catch {
            setError("No se pudo guardar la matrícula. Revisá la conexión y los permisos.");
        } finally {
            setAdding(false);
        }
    };

    const handleModelChange = async (reg: string, model: FleetModelOption) => {
        setError(null);
        setSavingReg(reg);
        try {
            await onSaveModel(reg, model);
        } catch {
            setError(`No se pudo actualizar ${reg}.`);
        } finally {
            setSavingReg(null);
        }
    };

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in duration-200 pb-12">
            <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/50 px-5 py-4 mb-6">
                <div className="flex gap-3 items-start">
                    <Plane className="w-6 h-6 text-cyan-700 shrink-0 mt-0.5" />
                    <p className="text-sm text-cyan-950/90 font-semibold leading-relaxed">
                        Flota maestra de Smartops: independiente de la programación del día. Los cambios se aplican a
                        PAX máximo, OTP, Pernocte, diagramas de carga y el resto de la app.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-6 text-sm font-bold text-slate-600">
                <span className="bg-slate-100 px-3 py-1.5 rounded-full">
                    Total: <span className="text-slate-900 tabular-nums">{counts.total}</span>
                </span>
                <span className="bg-blue-50 text-blue-900 px-3 py-1.5 rounded-full">
                    A320: <span className="tabular-nums">{counts.a320}</span>
                </span>
                <span className="bg-indigo-50 text-indigo-900 px-3 py-1.5 rounded-full">
                    A321: <span className="tabular-nums">{counts.a321}</span>
                </span>
            </div>

            {canEdit && (
                <form
                    onSubmit={(e) => void handleAdd(e)}
                    className="rounded-2xl border border-slate-200 bg-white p-5 mb-6 shadow-sm flex flex-col sm:flex-row flex-wrap gap-4 items-end"
                >
                    <div className="flex-1 min-w-[10rem]">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                            Nueva matrícula
                        </label>
                        <input
                            type="text"
                            value={newReg}
                            onChange={(e) => setNewReg(e.target.value.toUpperCase())}
                            placeholder="Ej. CC-ABC"
                            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-mono font-bold text-slate-900 uppercase focus:outline-none focus:border-cyan-500"
                        />
                    </div>
                    <div className="min-w-[10rem]">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                            Tipo (A320 / A321)
                        </label>
                        <select
                            value={newModel}
                            onChange={(e) => setNewModel(e.target.value as FleetModelOption)}
                            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-slate-900 focus:outline-none focus:border-cyan-500"
                        >
                            {FLEET_MODEL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={adding}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black uppercase tracking-wide bg-cyan-500 hover:bg-cyan-400 text-slate-900 disabled:opacity-60"
                    >
                        {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        Agregar
                    </button>
                </form>
            )}

            {error && (
                <p className="mb-4 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    {error}
                </p>
            )}

            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar matrícula o tipo…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold focus:outline-none focus:border-cyan-500"
                />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[min(70vh,640px)] overflow-y-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                            <tr className="text-xs font-black uppercase tracking-wider text-slate-500">
                                <th className="px-4 py-3">Matrícula</th>
                                <th className="px-4 py-3">Familia</th>
                                <th className="px-4 py-3">Modelo</th>
                                <th className="px-4 py-3 text-right">MAP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-12 text-center text-slate-500 font-semibold">
                                        Sin resultados
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((ac) => (
                                    <tr
                                        key={ac.registration}
                                        className="border-b border-slate-100 hover:bg-slate-50/80"
                                    >
                                        <td className="px-4 py-3 font-mono font-black text-slate-900">
                                            {ac.registration}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`text-xs font-black px-2 py-0.5 rounded-md ${
                                                    fleetFamilyLabel(ac.model) === "A321"
                                                        ? "bg-indigo-100 text-indigo-800"
                                                        : "bg-blue-100 text-blue-800"
                                                }`}
                                            >
                                                {fleetFamilyLabel(ac.model)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {canEdit ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={ac.model}
                                                        disabled={savingReg === ac.registration}
                                                        onChange={(e) =>
                                                            void handleModelChange(
                                                                ac.registration,
                                                                e.target.value as FleetModelOption,
                                                            )
                                                        }
                                                        className="min-w-[8.5rem] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-semibold text-slate-800 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                                                    >
                                                        {FLEET_MODEL_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {savingReg === ac.registration ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-cyan-600" />
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <span className="font-semibold text-slate-700">{ac.model}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-700">
                                            {ac.capacity}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {!canEdit ? (
                <p className="mt-4 text-xs text-slate-500 font-semibold text-center">
                    Solo lectura para tu rol. Pedí a HCC, AJS o ADMIN para modificar la flota.
                </p>
            ) : null}
        </div>
    );
}
