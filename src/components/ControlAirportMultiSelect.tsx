import { useId, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

interface Props {
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    label?: string;
    emptyHint?: string;
    className?: string;
}

export function ControlAirportMultiSelect({
    options,
    selected,
    onChange,
    label = "Aeropuertos",
    emptyHint = "Todos los aeropuertos",
    className = "",
}: Props) {
    const listId = useId();
    const [open, setOpen] = useState(false);

    const selectedSet = useMemo(() => new Set(selected), [selected]);

    const toggle = (code: string) => {
        if (selectedSet.has(code)) {
            onChange(selected.filter((c) => c !== code));
        } else {
            onChange([...selected, code].sort((a, b) => a.localeCompare(b)));
        }
    };

    const summary =
        selected.length === 0
            ? emptyHint
            : selected.length <= 2
              ? selected.join(", ")
              : `${selected.length} aeropuertos`;

    return (
        <div className={`relative shrink-0 min-w-[11rem] max-w-[16rem] ${className}`}>
            <label htmlFor={listId} className="block text-xs font-black uppercase text-slate-500 mb-1">
                {label}
            </label>
            <button
                id={listId}
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white hover:border-slate-300 transition-colors"
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <span className="truncate text-left">{summary}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {selected.length > 0 ? (
                <button
                    type="button"
                    onClick={() => onChange([])}
                    className="absolute -top-0.5 -right-0.5 p-0.5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700"
                    title="Quitar filtro de aeropuertos"
                    aria-label="Quitar filtro de aeropuertos"
                >
                    <X className="w-3 h-3" />
                </button>
            ) : null}
            {open ? (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-30 cursor-default"
                        aria-label="Cerrar selector de aeropuertos"
                        onClick={() => setOpen(false)}
                    />
                    <div
                        role="listbox"
                        aria-multiselectable
                        className="absolute z-40 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1 [scrollbar-width:thin]"
                    >
                        {options.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-500">Sin aeropuertos en el período</p>
                        ) : (
                            options.map((code) => (
                                <label
                                    key={code}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedSet.has(code)}
                                        onChange={() => toggle(code)}
                                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    {code}
                                </label>
                            ))
                        )}
                    </div>
                </>
            ) : null}
        </div>
    );
}
