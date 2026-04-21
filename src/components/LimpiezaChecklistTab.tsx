import { ClipboardCheck } from "lucide-react";

/** Placeholder: la lista de ítems se cargará más adelante. */
export function LimpiezaChecklistTab() {
    return (
        <div className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700">
                    <ClipboardCheck className="h-6 w-6 shrink-0" aria-hidden />
                </div>
                <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-black uppercase tracking-wide text-slate-900">Verificación de limpieza</h3>
                    <p className="text-sm font-semibold leading-relaxed text-slate-600">
                        Aquí se mostrará la lista de verificación de limpieza para este vuelo. El contenido se definirá en una
                        próxima actualización.
                    </p>
                </div>
            </div>
        </div>
    );
}
