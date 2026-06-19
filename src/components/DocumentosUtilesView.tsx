import { useState } from "react";
import { Accessibility, FileDown, FileText, FolderOpen } from "lucide-react";
import { SC_USEFUL_DOCUMENTS } from "../lib/scUsefulDocuments";
import { WhCalculator } from "./WhCalculator";
import { WheelchairTransportView } from "./WheelchairTransportView";

type UsefulToolsTab = "documentos" | "transporte-silla";

export function DocumentosUtilesView() {
    const docs = SC_USEFUL_DOCUMENTS;
    const [activeTab, setActiveTab] = useState<UsefulToolsTab>("documentos");

    return (
        <div className="w-full max-w-6xl pb-12 animate-in fade-in duration-200">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-5 py-4 mb-6 flex gap-3 items-start text-left">
                <FolderOpen className="w-6 h-6 text-cyan-700 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-slate-800 font-semibold leading-relaxed">
                    Herramientas de apoyo para <strong>Supervisor de Carga</strong>. Descargá archivos, usá la
                    calculadora de Wh (Ah × V) o la guía de transporte de silla de rueda.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-4">
                <button
                    type="button"
                    onClick={() => setActiveTab("documentos")}
                    className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 ${
                        activeTab === "documentos"
                            ? "bg-cyan-500 text-slate-900 shadow-md"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                    <FileText className="w-4 h-4 shrink-0" aria-hidden />
                    Documentos
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("transporte-silla")}
                    className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 ${
                        activeTab === "transporte-silla"
                            ? "bg-cyan-500 text-slate-900 shadow-md"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                    <Accessibility className="w-4 h-4 shrink-0" aria-hidden />
                    Transporte de silla de rueda
                </button>
            </div>

            {activeTab === "documentos" && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_min(100%,22rem)] xl:grid-cols-[1fr_24rem] gap-8 items-start animate-in fade-in duration-200">
                    <section className="min-w-0 text-left">
                        {docs.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-card p-12 text-left text-muted-foreground">
                                <FileText className="w-12 h-12 mb-4 opacity-40" />
                                <p className="font-bold text-secondary">No hay herramientas cargadas todavía.</p>
                            </div>
                        ) : (
                            <ul className="flex flex-col gap-3 w-full">
                                {docs.map((doc) => (
                                    <li
                                        key={doc.id}
                                        className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden hover:border-cyan-300/80 transition-colors"
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 text-left">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-700">
                                                <FileText className="w-5 h-5" aria-hidden />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-black text-secondary leading-tight">
                                                    {doc.title}
                                                </h3>
                                                {doc.description && (
                                                    <p className="text-sm text-muted-foreground font-medium mt-0.5">
                                                        {doc.description}
                                                    </p>
                                                )}
                                            </div>
                                            <a
                                                href={doc.href}
                                                download={doc.fileName}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black uppercase tracking-wide text-xs sm:text-sm px-4 py-2.5 shadow-md transition-colors w-full sm:w-auto"
                                            >
                                                <FileDown className="w-4 h-4" aria-hidden />
                                                Descargar
                                            </a>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <WhCalculator />
                </div>
            )}

            {activeTab === "transporte-silla" && <WheelchairTransportView />}
        </div>
    );
}
