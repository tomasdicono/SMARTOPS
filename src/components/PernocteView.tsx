import type { PernocteRowState } from "../types";
import { coercePernocteRow, defaultPernocteRow, type PernocteTableRow } from "../lib/pernocteHelpers";
import { Moon } from "lucide-react";

interface Props {
    selectedDate: string;
    rows: PernocteTableRow[];
    pernocteByReg: Record<string, PernocteRowState>;
    onPatchRow: (reg: string, patch: Partial<PernocteRowState>) => void;
}

function avionListoLabel(limpieza: boolean, precarga: boolean): { ok: boolean; text: string } {
    if (limpieza && precarga) return { ok: true, text: "Sí" };
    const missL = !limpieza;
    const missP = !precarga;
    if (missL && missP) return { ok: false, text: "Pendiente Limpieza/Precarga" };
    if (missL) return { ok: false, text: "Pendiente Limpieza" };
    return { ok: false, text: "Pendiente Precarga" };
}

export function PernocteView({ selectedDate, rows, pernocteByReg, onPatchRow }: Props) {
    return (
        <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center gap-3 text-slate-700">
                <Moon className="w-8 h-8 text-indigo-600 shrink-0" aria-hidden />
                <div>
                    <p className="text-lg font-black uppercase tracking-wide text-slate-900">Pernocte</p>
                    <p className="text-sm font-semibold text-slate-600 max-w-3xl">
                        Matrículas de la programación del{" "}
                        <span className="font-black text-slate-900 tabular-nums">{selectedDate}</span> asignadas a vuelos{" "}
                        <span className="font-black text-slate-800">JES</span> (3000–3999), sin repetir.{" "}
                        <span className="font-black text-slate-800">ATO</span>: último aeropuerto de llegada del último
                        JES de esa matrícula (donde quedó el avión).
                    </p>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-12 text-center text-slate-600 font-semibold">
                    No hay matrículas JES en la programación de esta fecha. Cargá la programación o elegí otro día.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-md ring-1 ring-slate-200/80">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead>
                            <tr className="bg-slate-900 text-left text-[11px] font-black uppercase tracking-wider text-white">
                                <th className="px-4 py-3 whitespace-nowrap">Matrícula</th>
                                <th className="px-4 py-3 whitespace-nowrap">ATO</th>
                                <th className="px-4 py-3 text-center whitespace-nowrap">Limpieza</th>
                                <th className="px-4 py-3 whitespace-nowrap min-w-[8rem]">Precarga Q</th>
                                <th className="px-4 py-3 text-center whitespace-nowrap">Precarga</th>
                                <th className="px-4 py-3 whitespace-nowrap min-w-[14rem]">Avión listo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(({ reg, ato }) => {
                                const row = coercePernocteRow(pernocteByReg[reg] ?? defaultPernocteRow());
                                const status = avionListoLabel(row.limpieza, row.precarga);
                                return (
                                    <tr key={reg} className="hover:bg-slate-50/80">
                                        <td className="px-4 py-3 font-mono font-black text-slate-900 tabular-nums">
                                            {reg}
                                        </td>
                                        <td className="px-4 py-3 font-black text-slate-800 tabular-nums">{ato}</td>
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={row.limpieza}
                                                onChange={(e) => onPatchRow(reg, { limpieza: e.target.checked })}
                                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                aria-label={`Limpieza ${reg}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={row.precargaQ}
                                                onChange={(e) =>
                                                    onPatchRow(reg, { precargaQ: e.target.value.replace(/\D/g, "") })
                                                }
                                                placeholder="—"
                                                className="w-full max-w-[10rem] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-bold tabular-nums text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                aria-label={`Precarga Q ${reg}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={row.precarga}
                                                onChange={(e) => onPatchRow(reg, { precarga: e.target.checked })}
                                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                aria-label={`Precarga ${reg}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            {status.ok ? (
                                                <span className="inline-flex items-center justify-center rounded-lg border border-emerald-400 bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-900">
                                                    {status.text}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center font-bold text-red-600">
                                                    {status.text}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
