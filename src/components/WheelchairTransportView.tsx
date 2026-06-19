import { useEffect, useMemo, useRef, useState } from "react";
import { Accessibility, AlertTriangle, Ban, CheckCircle2, FileDown } from "lucide-react";
import { SC_USEFUL_DOCUMENTS } from "../lib/scUsefulDocuments";
import { WhCalculator } from "./WhCalculator";

type BatteryType = "derramable" | "no-derramable" | "litio";

const NOTOC_NO_DERRAMABLE = SC_USEFUL_DOCUMENTS.find((d) => d.id === "notoc-silla-no-derramable");

const CHECKLIST_ITEMS = [
    "La ayuda motriz está preparada para el transporte para prevenir activación accidental y no contiene ningún líquido libre o no absorbido.",
    "La ayuda motriz, la(s) batería(s), el cableado eléctrico y los controles están protegidos de daños, incluyendo el movimiento de equipaje, correo o carga.",
    "Los terminales de la batería están protegidos contra cortocircuitos, p. ej., están dentro de un contenedor para baterías.",
    "La silla será transportada junto a sus baterías en bodega.",
] as const;

function downloadDocument(href: string, fileName: string) {
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function WheelchairTransportView() {
    const [batteryType, setBatteryType] = useState<BatteryType | null>(null);
    const [checkedItems, setCheckedItems] = useState<boolean[]>(() => CHECKLIST_ITEMS.map(() => false));
    const [downloadNotice, setDownloadNotice] = useState(false);
    const hasAutoDownloadedRef = useRef(false);

    const allChecked = useMemo(() => checkedItems.every(Boolean), [checkedItems]);

    useEffect(() => {
        setCheckedItems(CHECKLIST_ITEMS.map(() => false));
        setDownloadNotice(false);
        hasAutoDownloadedRef.current = false;
    }, [batteryType]);

    useEffect(() => {
        if (batteryType !== "no-derramable" || !allChecked || hasAutoDownloadedRef.current || !NOTOC_NO_DERRAMABLE) {
            return;
        }

        hasAutoDownloadedRef.current = true;
        downloadDocument(NOTOC_NO_DERRAMABLE.href, NOTOC_NO_DERRAMABLE.fileName);
        setDownloadNotice(true);
    }, [batteryType, allChecked]);

    const toggleItem = (index: number) => {
        setCheckedItems((prev) => prev.map((value, i) => (i === index ? !value : value)));
    };

    const batteryOptions: { id: BatteryType; label: string }[] = [
        { id: "derramable", label: "Derramable" },
        { id: "no-derramable", label: "No derramable" },
        { id: "litio", label: "Litio" },
    ];

    return (
        <div className="w-full max-w-3xl text-left animate-in fade-in duration-200">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-5 py-4 mb-8 flex gap-3 items-start">
                <Accessibility className="w-6 h-6 text-cyan-700 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-slate-800 font-semibold leading-relaxed">
                    Guía para el despacho de sillas de rueda según el tipo de batería. Seleccioná una opción para
                    continuar.
                </p>
            </div>

            <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <header className="bg-slate-900 border-b border-slate-800 px-5 py-4">
                    <h3 className="text-lg font-black text-white leading-tight">¿Qué tipo de batería tiene la silla?</h3>
                </header>

                <div className="p-5 flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {batteryOptions.map((option) => {
                            const selected = batteryType === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setBatteryType(option.id)}
                                    className={`rounded-xl border px-4 py-3 text-sm font-black uppercase tracking-wide transition-all ${
                                        selected
                                            ? "border-cyan-500 bg-cyan-500 text-slate-900 shadow-md"
                                            : "border-border bg-slate-50 text-secondary hover:border-cyan-300 hover:bg-cyan-50/60"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    {batteryType === "derramable" && (
                        <div
                            role="alert"
                            className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 flex items-start gap-3 animate-in fade-in duration-200"
                        >
                            <Ban className="w-6 h-6 text-red-600 shrink-0 mt-0.5" aria-hidden />
                            <div>
                                <p className="text-base font-black text-red-800">No permitido para el transporte</p>
                                <p className="text-sm text-red-700 font-medium mt-1 leading-relaxed">
                                    Las baterías derramables no pueden transportarse en este servicio.
                                </p>
                            </div>
                        </div>
                    )}

                    {batteryType === "no-derramable" && (
                        <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden />
                                <p className="text-sm font-semibold text-amber-900 leading-relaxed">
                                    Verificá cada ítem antes del despacho. Al completar la checklist se descargará el
                                    NOTOC de batería no derramable.
                                </p>
                            </div>

                            <ul className="flex flex-col gap-3">
                                {CHECKLIST_ITEMS.map((item, index) => {
                                    const checked = checkedItems[index];
                                    return (
                                        <li key={item}>
                                            <label
                                                className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                                                    checked
                                                        ? "border-emerald-300 bg-emerald-50/70"
                                                        : "border-border bg-slate-50/80 hover:border-cyan-200"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleItem(index)}
                                                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                                />
                                                <span className="text-sm font-medium text-secondary leading-relaxed">
                                                    {item}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>

                            {allChecked && NOTOC_NO_DERRAMABLE && (
                                <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in duration-200">
                                    <div className="flex items-start gap-3 flex-1">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" aria-hidden />
                                        <div>
                                            <p className="text-sm font-black text-emerald-800">
                                                Checklist completa
                                                {downloadNotice ? " — NOTOC descargado" : ""}
                                            </p>
                                            <p className="text-xs text-emerald-700 font-medium mt-0.5">
                                                Podés volver a descargar el documento si lo necesitás.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            downloadDocument(
                                                NOTOC_NO_DERRAMABLE.href,
                                                NOTOC_NO_DERRAMABLE.fileName,
                                            )
                                        }
                                        className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wide text-xs px-4 py-2.5 shadow-md transition-colors"
                                    >
                                        <FileDown className="w-4 h-4" aria-hidden />
                                        Descargar NOTOC
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {batteryType === "litio" && (
                        <div className="animate-in fade-in duration-200">
                            <WhCalculator flightEligibilityThreshold={300} />
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
