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

export function WhCalculator() {
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

    return (
        <aside className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden lg:sticky lg:top-24 w-full">
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

                <div className="rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-4 text-center">
                    <p className="text-[10px] font-black text-cyan-800 uppercase tracking-widest mb-1">Resultado</p>
                    <p className="text-3xl font-black text-secondary tabular-nums">
                        {wh != null ? (
                            <>
                                {formatNum(wh, 2)}
                                <span className="text-lg text-cyan-700 ml-1">Wh</span>
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
