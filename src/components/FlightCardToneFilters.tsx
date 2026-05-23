import type { FlightCardTone } from "../lib/flightHelpers";

const TONE_OPTIONS: {
    tone: FlightCardTone;
    label: string;
    active: string;
    idle: string;
}[] = [
    {
        tone: "green",
        label: "Tarjetas verdes",
        active: "bg-emerald-600 border-emerald-700 text-white shadow-md ring-2 ring-emerald-400/50",
        idle: "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:border-emerald-600 dark:text-emerald-100",
    },
    {
        tone: "yellow",
        label: "Tarjetas amarillas",
        active: "bg-yellow-500 border-yellow-600 text-yellow-950 shadow-md ring-2 ring-yellow-400/50",
        idle: "bg-yellow-50 border-yellow-300 text-yellow-950 hover:bg-yellow-100 dark:bg-[#422006] dark:border-yellow-600 dark:text-yellow-50",
    },
    {
        tone: "red",
        label: "Tarjetas rojas",
        active: "bg-red-600 border-red-700 text-white shadow-md ring-2 ring-red-400/50",
        idle: "bg-red-50 border-red-300 text-red-900 hover:bg-red-100 dark:bg-[#450a0a] dark:border-red-600 dark:text-red-100",
    },
    {
        tone: "grey",
        label: "Tarjetas grises",
        active: "bg-slate-600 border-slate-700 text-white shadow-md ring-2 ring-slate-400/50",
        idle: "bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200",
    },
];

interface Props {
    active: ReadonlySet<FlightCardTone>;
    onToggle: (tone: FlightCardTone) => void;
}

export function FlightCardToneFilters({ active, onToggle }: Props) {
    const anyActive = active.size > 0;

    return (
        <div className="mb-5 flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Filtrar por estado de tarjeta
                {anyActive ? (
                    <span className="ml-2 font-semibold normal-case text-foreground">
                        · {active.size} activo{active.size !== 1 ? "s" : ""}
                    </span>
                ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(({ tone, label, active: activeCls, idle }) => {
                    const isOn = active.has(tone);
                    return (
                        <button
                            key={tone}
                            type="button"
                            aria-pressed={isOn}
                            onClick={() => onToggle(tone)}
                            className={`rounded-full border-2 px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${isOn ? activeCls : idle}`}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
