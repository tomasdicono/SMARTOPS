import { useMemo, useState } from "react";
import { Calculator, Battery } from "lucide-react";

function parseNum(raw: string): number | null {
    const t = raw.trim().replace(",", ".");
    if (t === "" || t === ".") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatNum(n: number, decimals = 4): string {
    const s = n.toFixed(decimals);
    return s.replace(/\.?0+$/, "") || "0";
}

interface WhCalculatorProps {
    /** Si se define, colorea el resultado y muestra leyenda de aptitud para volar (≤ umbral = verde). */
    flightEligibilityThreshold?: number;
    className?: string;
}

export function WhCalculator({ flightEligibilityThreshold, className }: WhCalculatorProps = {}) {
    const [ahText, setAhText] = useState("");
    const [vText, setVText] = useState("");
    const [mahText, setMahText] = useState("");

    const ah = parseNum(ahText);
    const volts = parseNum(vText);
    const mah = parseNum(mahText);

    const wh = useMemo(() => {
        if (ah == null || volts == null) return null;
        return ah * volts;
    }, [ah, volts]);

    const handleAhChange = (value: string) => {
        setAhText(value);
        const n = parseNum(value);
        if (n == null) {
            if (value.trim() === "") setMahText("");
            return;
        }
        setMahText(formatNum(n * 1000, 2));
    };

    const handleMahChange = (value: string) => {
        setMahText(value);
        const n = parseNum(value);
        if (n == null) {
            if (value.trim() === "") setAhText("");
            return;
        }
        setAhText(formatNum(n / 1000, 6));
    };

    const flightEligibility =
        flightEligibilityThreshold != null && wh != null
            ? wh <= flightEligibilityThreshold
                ? "apta"
                : "no-apta"
            : null;

    const resultBoxClass =
        flightEligibility === "apta"
            ? "rounded-xl bg-emerald-50 border border-emerald-300 px-4 py-4 text-center"
            : flightEligibility === "no-apta"
              ? "rounded-xl bg-red-50 border border-red-300 px-4 py-4 text-center"
              : "rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-4 text-center";

    const resultLabelClass =
        flightEligibility === "apta"
            ? "text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1"
            : flightEligibility === "no-apta"
              ? "text-[10px] font-black text-red-800 uppercase tracking-widest mb-1"
              : "text-[10px] font-black text-cyan-800 uppercase tracking-widest mb-1";

    const resultValueClass =
        flightEligibility === "apta"
            ? "text-3xl font-black text-emerald-700 tabular-nums"
            : flightEligibility === "no-apta"
              ? "text-3xl font-black text-red-700 tabular-nums"
              : "text-3xl font-black text-secondary tabular-nums";

    const resultUnitClass =
        flightEligibility === "apta"
            ? "text-lg text-emerald-600 ml-1"
            : flightEligibility === "no-apta"
              ? "text-lg text-red-600 ml-1"
              : "text-lg text-cyan-700 ml-1";

    return (
        <aside
            className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden w-full ${flightEligibilityThreshold == null ? "lg:sticky lg:top-24" : ""} ${className ?? ""}`}
        >
            <header className="bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center gap-3">
                <Calculator className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden />
                <div>
                    <h3 className="text-lg font-black text-white leading-tight">Calculadora Wh</h3>
                    <p className="text-xs font-semibold text-slate-300 mt-0.5">Capacidad (Wh) = Ah × V</p>
                </div>
            </header>

            <div className="p-5 flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5 text-left">
                        <span className="text-xs font-black text-secondary uppercase tracking-wider">Ah</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={ahText}
                            onChange={(e) => handleAhChange(e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-lg font-bold text-secondary focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        />
                    </label>
                    <label className="flex flex-col gap-1.5 text-left">
                        <span className="text-xs font-black text-secondary uppercase tracking-wider">V</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={vText}
                            onChange={(e) => setVText(e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-lg font-bold text-secondary focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        />
                    </label>
                </div>

                <div className={resultBoxClass}>
                    <p className={resultLabelClass}>Resultado</p>
                    <p className={resultValueClass}>
                        {wh != null ? (
                            <>
                                {formatNum(wh, 2)}
                                <span className={resultUnitClass}>Wh</span>
                            </>
                        ) : (
                            <span className="text-slate-400 text-xl">—</span>
                        )}
                    </p>
                    {ah != null && volts != null && (
                        <p className="text-xs text-slate-500 font-semibold mt-2">
                            {formatNum(ah, 4)} Ah × {formatNum(volts, 2)} V
                        </p>
                    )}
                    {flightEligibility === "apta" && (
                        <p className="text-sm font-black text-emerald-700 mt-3 uppercase tracking-wide">
                            Apta para volar
                        </p>
                    )}
                    {flightEligibility === "no-apta" && (
                        <p className="text-sm font-black text-red-700 mt-3 uppercase tracking-wide">
                            No apta para volar
                        </p>
                    )}
                </div>

                <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 text-left">
                    <div className="flex items-start gap-2 mb-3">
                        <Battery className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                        <p className="text-sm font-bold text-secondary leading-snug">¿Tu batería indica mAh?</p>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mb-3 leading-relaxed">
                        Escribí los mAh y el valor en <strong>Ah</strong> se actualiza arriba al instante (mAh ÷ 1000).
                    </p>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-wider">mAh</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={mahText}
                            onChange={(e) => handleMahChange(e.target.value)}
                            placeholder="Ej. 5000"
                            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-lg font-bold text-secondary focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                        />
                    </label>
                    {mah != null && ah != null && (
                        <p className="text-xs text-slate-500 font-mono mt-2 tabular-nums">
                            {formatNum(mah, 2)} mAh → {formatNum(ah, 6)} Ah
                        </p>
                    )}
                </section>
            </div>
        </aside>
    );
}
