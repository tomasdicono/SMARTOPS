import { useMemo, useState } from "react";
import type { Flight, HitosData } from "../types";
import { GANTT_CHARTS } from "../lib/hitosData";
import { refMinutesForHitos, formatMins } from "../lib/hitosReference";
import { ArrowLeft, Calculator } from "lucide-react";

interface Props {
    onBack: () => void;
}

function digitsToHHMM(d: string): string {
    const raw = d.replace(/\D/g, "").slice(0, 4).padStart(4, "0");
    if (raw.length < 4) return raw;
    return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

export function GanttCalculatorView({ onBack }: Props) {
    const [chartName, setChartName] = useState(GANTT_CHARTS[0]?.name ?? "");
    const [stdDigits, setStdDigits] = useState(""); // HHmm
    const [ataDigits, setAtaDigits] = useState("");

    const chart = GANTT_CHARTS.find((c) => c.name === chartName) ?? GANTT_CHARTS[0];
    const is1stWave = chart?.name.includes("1ST WAVE") ?? false;

    const rows = useMemo(() => {
        if (!chart) return [];
        const std = stdDigits.replace(/\D/g, "").padStart(4, "0").slice(-4);
        if (std.length < 4 || !/^\d{4}$/.test(std)) return [];

        const ata = ataDigits.replace(/\D/g, "").slice(0, 4);
        const hitosData: HitosData = {
            ganttChartName: chart.name,
            ata: !is1stWave ? ata.padStart(4, "0").slice(-4) : "",
            entries: {},
        };
        const fakeFlight: Flight = {
            id: "calc",
            date: "01-01-2026",
            route: "CALC",
            flt: "3000",
            reg: "",
            dep: "XXX",
            arr: "YYY",
            std,
            sta: "0000",
            pax: "0",
        };

        const refM = refMinutesForHitos(fakeFlight, hitosData, chart);
        return chart.milestones
            .filter((m) => m.offsetMinutes !== null)
            .map((m) => ({
                name: m.name,
                esperado: formatMins(refM - m.offsetMinutes!),
            }));
    }, [chart, stdDigits, ataDigits, is1stWave]);

    const stdOk = stdDigits.replace(/\D/g, "").length >= 3;
    const ataOk = is1stWave || ataDigits.replace(/\D/g, "").length >= 3;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al inicio de sesión
                </button>

                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30">
                        <Calculator className="w-8 h-8 text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white">Calculadora Gantt</h1>
                        <p className="text-sm text-slate-400 font-semibold mt-1">
                            Referencia de horarios teóricos (misma lógica que hitos operacionales). Sin conexión a vuelos
                            reales.
                        </p>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:p-6 space-y-5 shadow-xl">
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                            Carta Gantt
                        </label>
                        <select
                            value={chartName}
                            onChange={(e) => {
                                setChartName(e.target.value);
                                setAtaDigits("");
                            }}
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                            {GANTT_CHARTS.map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name} (TAT {c.tatMinutes} min)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                                Horario de salida (referencia)
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Ej: 1430"
                                value={stdDigits}
                                onChange={(e) => setStdDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono font-bold tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                                STD/ETD en 24 h (4 dígitos). Se usa como referencia T−.
                            </p>
                        </div>
                        {!is1stWave && (
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                                    ATA (llegada)
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Ej: 1215"
                                    value={ataDigits}
                                    onChange={(e) => setAtaDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono font-bold tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                                <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                                    Obligatorio para esta carta si aplica regla ATA+TAT &gt; salida.
                                </p>
                            </div>
                        )}
                    </div>

                    {!stdOk ? (
                        <p className="text-sm text-amber-400 font-semibold">Ingresá al menos 3 dígitos del horario de salida.</p>
                    ) : !ataOk ? (
                        <p className="text-sm text-amber-400 font-semibold">Ingresá el ATA (3–4 dígitos) para esta carta.</p>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-slate-500">No hay hitos con offset en esta carta.</p>
                    ) : (
                        <div className="rounded-xl border border-slate-800 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-800/80 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">
                                        <th className="px-4 py-3">Hito</th>
                                        <th className="px-4 py-3 text-right">Hora esperada</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    <tr className="bg-slate-800/30">
                                        <td className="px-4 py-2 text-xs font-bold text-slate-500" colSpan={2}>
                                            Referencia salida: {digitsToHHMM(stdDigits.replace(/\D/g, "").padStart(4, "0"))}
                                            {!is1stWave && ataDigits.replace(/\D/g, "").length >= 3
                                                ? ` · ATA ${digitsToHHMM(ataDigits.replace(/\D/g, "").padStart(4, "0"))}`
                                                : ""}
                                        </td>
                                    </tr>
                                    {rows.map((r) => (
                                        <tr key={r.name} className="hover:bg-slate-800/40">
                                            <td className="px-4 py-2.5 font-semibold text-slate-200">{r.name}</td>
                                            <td className="px-4 py-2.5 text-right font-mono font-black tabular-nums text-cyan-300">
                                                {r.esperado}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
