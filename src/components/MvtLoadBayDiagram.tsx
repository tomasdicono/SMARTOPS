import type { LoadBayFamily } from "../lib/a321LoadBays";

/** Posición horizontal (0–100), vista superior, morro izquierda. */
const SLOT_X_PCT: Record<LoadBayFamily, Record<string, number>> = {
    A320: {
        /** Izquierda → derecha (morro a la izquierda): 11 / 12 / 13, luego trasera y bulk. */
        "11": 14,
        "12": 24,
        "13": 34,
        "31": 46,
        "32": 54,
        "41": 64,
        "42": 72,
        "51": 81,
        "52": 86,
        "53": 91,
    },
    A321: {
        "11": 11,
        "12": 18,
        "21": 25,
        "22": 32,
        "23": 39,
        "31": 48,
        "32": 54,
        "33": 60,
        "41": 67,
        "42": 73,
        "51": 81,
        "52": 86,
        "53": 91,
    },
};

const ZONE_LABELS = {
    del: "Delantera",
    tra: "Trasera",
    bulk: "Bulk",
} as const;

interface Props {
    family: LoadBayFamily;
    values: Record<string, string>;
    onBayChange: (code: string, value: string) => void;
    /** Solo dígitos (PCS vs TOTAL BAGS). Si es false (p. ej. hay TOTAL CARGA KG), se admite texto libre por posición. */
    numericOnly?: boolean;
    disabled?: boolean;
    className?: string;
}

/**
 * Vista superior del fuselaje: cada posición LDM se completa en el propio gráfico.
 */
export function MvtLoadBayDiagram({
    family,
    values,
    onBayChange,
    numericOnly = true,
    disabled,
    className = "",
}: Props) {
    const xs = SLOT_X_PCT[family];
    const codes = Object.keys(xs);

    return (
        <div
            className={`rounded-xl border border-border bg-slate-50 dark:bg-slate-950/50 ${className}`}
        >
            <p className="text-[10px] sm:text-xs text-muted-foreground px-3 sm:px-4 pt-3 font-medium leading-snug">
                {numericOnly
                    ? "Tocá cada bodega en el avión · PCS · morro ← izquierda"
                    : "Tocá cada posición · texto libre (carga) · morro ← izquierda"}
            </p>
            <div className="overflow-x-auto px-2 pb-3 sm:px-3 sm:pb-4">
                <div className="relative mx-auto min-w-[min(100%,480px)] max-w-3xl aspect-[100/38] min-h-[168px]">
                    <svg
                        viewBox="0 0 100 34"
                        className="absolute inset-0 h-full w-full select-none text-foreground pointer-events-none"
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden
                    >
                        <rect x="9" y="14" width="33" height="9" rx="1.5" className="fill-sky-500/15 dark:fill-sky-400/20" />
                        <rect x="44" y="14" width="31" height="9" rx="1.5" className="fill-amber-500/15 dark:fill-amber-400/20" />
                        <rect x="77" y="14" width="17" height="9" rx="1.5" className="fill-slate-500/15 dark:fill-slate-400/25" />
                        <path
                            d="M 3 17 L 9 11 L 88 11 Q 96 11 97 17 Q 96 23 88 23 L 9 23 Z"
                            className="fill-white dark:fill-slate-900 stroke-slate-400 dark:stroke-slate-500"
                            strokeWidth="0.45"
                        />
                        <path d="M 3 17 L 9 12 L 9 22 Z" className="fill-slate-200 dark:fill-slate-700 stroke-slate-400 dark:stroke-slate-500" strokeWidth="0.35" />
                        <text x="25.5" y="8.5" className="fill-slate-500 dark:fill-slate-400" textAnchor="middle" fontSize="3.4" fontWeight="700">
                            {ZONE_LABELS.del}
                        </text>
                        <text x="59.5" y="8.5" className="fill-slate-500 dark:fill-slate-400" textAnchor="middle" fontSize="3.4" fontWeight="700">
                            {ZONE_LABELS.tra}
                        </text>
                        <text x="85.5" y="8.5" className="fill-slate-500 dark:fill-slate-400" textAnchor="middle" fontSize="3.4" fontWeight="700">
                            {ZONE_LABELS.bulk}
                        </text>
                    </svg>

                    {codes.map((code) => {
                        const x = xs[code]!;
                        return (
                            <div
                                key={code}
                                className="absolute z-10 flex flex-col items-center gap-0.5"
                                style={{
                                    left: `${x}%`,
                                    top: "52%",
                                    transform: "translate(-50%, -50%)",
                                    width: "clamp(2.25rem, 11vw, 3.25rem)",
                                }}
                            >
                                <span className="text-[9px] sm:text-[10px] font-black tabular-nums text-primary leading-none">{code}</span>
                                <label htmlFor={`mvt-load-bay-${family}-${code}`} className="sr-only">
                                    Posición {code} {numericOnly ? "PCS" : "carga o texto"}
                                </label>
                                <input
                                    id={`mvt-load-bay-${family}-${code}`}
                                    type="text"
                                    inputMode={numericOnly ? "numeric" : "text"}
                                    pattern={numericOnly ? "[0-9]*" : undefined}
                                    autoComplete="off"
                                    disabled={disabled}
                                    value={values[code] ?? ""}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        onBayChange(code, numericOnly ? v.replace(/[^0-9]/g, "") : v);
                                    }}
                                    placeholder="—"
                                    className={`h-7 w-full min-w-0 rounded-md border border-input bg-background px-0.5 text-center text-[11px] font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 sm:h-8 sm:text-xs ${
                                        numericOnly ? "tabular-nums" : ""
                                    }`}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
