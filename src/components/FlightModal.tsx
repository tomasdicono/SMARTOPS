import { useState } from "react";
import type { Flight, User } from "../types";
import { MVTForm } from "./MVTForm";
import { HitosTab } from "./HitosTab";
import { HitosCrewTab } from "./HitosCrewTab";
import { LimpiezaChecklistTab } from "./LimpiezaChecklistTab";
import {
    flightNeedsCleaningWarning,
    getAirlinePrefix,
    isMvtCompleteForCard,
    hasHitosDataForSummaryExport,
    canDownloadHitosSummaryRole,
} from "../lib/flightHelpers";
import { getLimpiezaChecklistMode } from "../lib/limpiezaChecklistHelpers";
import { isLimpiezaRole, canEditMvtDelayAfterSent, canSubmitMvtAfterQrf } from "../types";
import { isQrfActive, isAlternoActive } from "../lib/flightHelpers";

type FlightModalTab = "MVT" | "HITOS" | "CREW" | "LIMPIEZA";
import { hasMvtSent } from "../lib/controlHelpers";
import { downloadHitosSummary } from "../lib/downloadHitosSummary";
import { X, Ban, Download, RotateCcw } from "lucide-react";
import { AlternoIcon } from "./AlternoIcon";
import { BroomIcon } from "./BroomIcon";

interface Props {
    flight: Flight;
    userRole: import("../types").UserRole;
    /** Vuelos del día (misma fecha que el tablero) — modo tránsito vs pernocte del checklist */
    checklistDayFlights: Flight[];
    checklistSelectedIso: string;
    currentUser: User | null;
    onClose: () => void;
    onSaveMVT: (data: Flight["mvtData"]) => void;
    /** Auto-guardado MVT en Firebase (sin marcar enviado). */
    onPersistMvt?: (data: Flight["mvtData"]) => void;
    onSaveHitos: (data: import("../types").HitosData) => void;
    onPersistHitos?: (data: import("../types").HitosData) => void;
    onSaveCrewHitos: (data: Record<string, string>) => void;
    onPersistCrewHitos?: (data: Record<string, string>) => void;
    initialTab?: FlightModalTab;
}

export function FlightModal({
    flight,
    userRole,
    checklistDayFlights,
    checklistSelectedIso,
    currentUser,
    onClose,
    onSaveMVT,
    onPersistMvt,
    onSaveHitos,
    onPersistHitos,
    onSaveCrewHitos,
    onPersistCrewHitos,
    initialTab,
}: Props) {
    const [activeTab, setActiveTab] = useState<FlightModalTab>(() => {
        if (initialTab) return initialTab;
        if (isLimpiezaRole(userRole)) return "LIMPIEZA";
        if (userRole === "CREW") return "CREW";
        return "MVT";
    });

    /** MVT: operaciones / supervisión de carga */
    const canSeeMvt =
        !isLimpiezaRole(userRole) && (userRole === "ADMIN" || userRole === "HCC" || userRole === "SC" || userRole === "AJS");
    /** Hitos (Gantt + ATA): sin acceso CREW (solo Hitos Crew) */
    const canSeeHitos =
        !isLimpiezaRole(userRole) && (userRole === "ADMIN" || userRole === "HCC" || userRole === "SC" || userRole === "AJS");
    const canSeeCrew = userRole === "ADMIN" || userRole === "CREW" || userRole === "AJS";
    const checklistMode = getLimpiezaChecklistMode(flight, checklistDayFlights, checklistSelectedIso);
    const canSeeLimpiezaChecklist =
        checklistMode != null &&
        (isLimpiezaRole(userRole) ||
            userRole === "ADMIN" ||
            userRole === "HCC" ||
            userRole === "SC" ||
            userRole === "AJS");
    const isReadOnlyView = !!flight.cancelled;
    const qrfActive = isQrfActive(flight);
    const alternoActive = isAlternoActive(flight);
    const mvtSent = hasMvtSent(flight);
    const canEditOperationalAfterSent =
        canEditMvtDelayAfterSent(userRole) && !isReadOnlyView;
    const canResubmitMvtAfterQrf =
        qrfActive && canSubmitMvtAfterQrf(userRole) && !isReadOnlyView;
    const canEditMvtAfterSent =
        (mvtSent && canEditOperationalAfterSent) || canResubmitMvtAfterQrf;
    const mvtFormReadOnly = isReadOnlyView || (mvtSent && !canEditMvtAfterSent);
    const hitosSent =
        flight.hitosData?.hitosSentAt != null && String(flight.hitosData.hitosSentAt).trim() !== "";
    const canEditHitosAfterSent = hitosSent && canEditOperationalAfterSent;
    const canDownloadHitosSummary =
        canDownloadHitosSummaryRole(userRole) &&
        !isReadOnlyView &&
        isMvtCompleteForCard(flight) &&
        hasHitosDataForSummaryExport(flight);

    /** SC / escritorio: Limpieza es guía ANEXO A, no bloquea MVT ni Hitos. */
    const limpiezaAsGuide = canSeeLimpiezaChecklist && !isLimpiezaRole(userRole);

    const tabOrder: FlightModalTab[] = limpiezaAsGuide
        ? [
              ...(canSeeMvt ? (["MVT"] as const) : []),
              ...(canSeeHitos ? (["HITOS"] as const) : []),
              ...(canSeeCrew ? (["CREW"] as const) : []),
              ...(canSeeLimpiezaChecklist ? (["LIMPIEZA"] as const) : []),
          ]
        : [
              ...(canSeeMvt ? (["MVT"] as const) : []),
              ...(canSeeLimpiezaChecklist ? (["LIMPIEZA"] as const) : []),
              ...(canSeeHitos ? (["HITOS"] as const) : []),
              ...(canSeeCrew ? (["CREW"] as const) : []),
          ];

    const selectTab = (tab: FlightModalTab) => setActiveTab(tab);

    const tabButton = (tab: FlightModalTab) => {
        const isLimpieza = tab === "LIMPIEZA";
        const active = activeTab === tab;
        const label =
            tab === "MVT" ? "MVT" : tab === "HITOS" ? "Hitos" : tab === "CREW" ? "Hitos Crew" : "Limpieza";
        return (
            <button
                key={tab}
                type="button"
                onClick={() => selectTab(tab)}
                className={`px-6 py-3 text-sm font-bold uppercase tracking-wider relative transition-colors ${
                    active
                        ? isLimpieza
                            ? "text-violet-700"
                            : "text-blue-600"
                        : "text-muted-foreground hover:text-foreground"
                }`}
            >
                {label}
                {active ? (
                    <span
                        className={`absolute bottom-0 left-0 w-full h-0.5 rounded-t-lg ${
                            isLimpieza ? "bg-violet-600" : "bg-blue-600"
                        }`}
                    />
                ) : null}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl h-[90vh] md:h-auto md:max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 relative">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pr-10">
                        <div>
                            <h2 className="text-xl md:text-2xl font-black text-primary tracking-tight">
                                {getAirlinePrefix(flight.flt)} {flight.flt}
                            </h2>
                            <p className="text-sm font-semibold text-muted-foreground">
                                {flight.dep} →{" "}
                                {alternoActive ? (
                                    <>
                                        <span className="line-through text-slate-400">{flight.arr}</span>{" "}
                                        <span className="text-amber-700 dark:text-amber-300 font-bold">{flight.alternoArr}</span>
                                    </>
                                ) : (
                                    flight.arr
                                )}
                            </p>
                        </div>
                        <div className="hidden sm:block h-8 w-px bg-border mx-2"></div>
                        <div className="flex gap-4 items-center">
                            <div>
                                <p className="text-xs text-muted-foreground">Matrícula</p>
                                <p className="font-bold text-sm md:text-base">{flight.reg}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">STD</p>
                                <p className="font-bold text-sm md:text-base tabular-nums">{flight.std}</p>
                            </div>
                            {flight.etd?.trim() ? (
                                <div>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">ETD</p>
                                    <p className="font-bold text-sm md:text-base tabular-nums text-amber-800 dark:text-amber-200">{flight.etd}</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                        {canDownloadHitosSummary && (
                            <button
                                type="button"
                                onClick={() => downloadHitosSummary(flight)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-emerald-900 shadow-sm hover:bg-emerald-100 transition-colors"
                                title="Descargar informe HTML de hitos (operacionales y tripulación)"
                            >
                                <Download className="w-4 h-4 shrink-0" aria-hidden />
                                <span className="hidden sm:inline">Resumen hitos</span>
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors shadow-sm border border-slate-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {flight.cancelled && (
                    <div className="px-4 sm:px-6 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-3">
                        <Ban className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" aria-hidden />
                        <div className="min-w-0">
                            <p className="text-sm font-black text-rose-900 uppercase tracking-wide">Vuelo cancelado</p>
                            {flight.cancellationReason ? (
                                <p className="text-sm text-rose-800 mt-1 whitespace-pre-wrap">{flight.cancellationReason}</p>
                            ) : (
                                <p className="text-sm text-rose-700 mt-1">Sin motivo registrado.</p>
                            )}
                            <p className="text-xs text-rose-700/80 mt-2">Los formularios están bloqueados; solo lectura.</p>
                        </div>
                    </div>
                )}

                {!flight.cancelled && qrfActive && (
                    <div className="px-4 sm:px-6 py-3 bg-blue-50 border-b border-blue-200 flex items-start gap-3">
                        <RotateCcw className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden />
                        <div className="min-w-0">
                            <p className="text-sm font-black text-blue-950 uppercase tracking-wide">QRF activo</p>
                            <p className="text-sm text-blue-900 mt-1 leading-snug">
                                El avión regresó a posición. SC debe {mvtSent ? "reenviar" : "cargar"} el MVT; el STD y la programación del vuelo no se modifican.
                            </p>
                            {flight.qrfReason?.trim() ? (
                                <p className="text-sm text-blue-800 mt-2 font-semibold whitespace-pre-wrap">
                                    Motivo: {flight.qrfReason.trim()}
                                </p>
                            ) : null}
                        </div>
                    </div>
                )}

                {!flight.cancelled && alternoActive && (
                    <div className="px-4 sm:px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
                        <AlternoIcon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-sm font-black text-amber-950 uppercase tracking-wide">Alterno activo</p>
                            <p className="text-sm text-amber-900 mt-1 leading-snug">
                                Destino programado{" "}
                                <span className="line-through text-amber-700/70">{flight.arr}</span>
                                {" → "}
                                <span className="font-bold">{flight.alternoArr}</span>
                            </p>
                            {flight.alternoReason?.trim() ? (
                                <p className="text-sm text-amber-800 mt-2 font-semibold whitespace-pre-wrap">
                                    Motivo: {flight.alternoReason.trim()}
                                </p>
                            ) : null}
                        </div>
                    </div>
                )}

                {!flight.cancelled && flightNeedsCleaningWarning(flight) && (
                    <div className="px-4 sm:px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
                        <BroomIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm font-bold text-amber-950 leading-snug">
                            Tiempo de vuelo mayor a 03:30hs, requiere limpieza al arribo.
                        </p>
                    </div>
                )}

                {limpiezaAsGuide ? (
                    <div className="px-4 sm:px-6 py-2.5 bg-violet-50 border-b border-violet-200">
                        <p className="text-sm font-semibold text-violet-950 leading-snug">
                            La pestaña Limpieza es una guía (ANEXO A). Podés cargar MVT e Hitos sin completar el checklist.
                        </p>
                    </div>
                ) : null}

                {/* Tabs — rol Limpieza: solo checklist; SC/escritorio: MVT y Hitos antes que la guía Limpieza */}
                <div className="flex px-6 border-b border-border bg-slate-50/50">{tabOrder.map(tabButton)}</div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
                    {/* Mantener pestañas montadas (hidden) para no perder estado local al cambiar de pestaña */}
                    {canSeeMvt && (
                        <div className={activeTab === "MVT" ? "block" : "hidden"} aria-hidden={activeTab !== "MVT"}>
                            <MVTForm
                                key={flight.id}
                                flight={flight}
                                readOnly={mvtFormReadOnly}
                                canEditFullMvtAfterSent={canEditMvtAfterSent}
                                onSave={(data) => {
                                    onSaveMVT(data);
                                }}
                                onPersistMvt={onPersistMvt}
                            />
                        </div>
                    )}
                    {canSeeLimpiezaChecklist && (
                        <div className={activeTab === "LIMPIEZA" ? "block" : "hidden"} aria-hidden={activeTab !== "LIMPIEZA"}>
                            <LimpiezaChecklistTab
                                flight={flight}
                                dayFlights={checklistDayFlights}
                                selectedIso={checklistSelectedIso}
                                currentUser={currentUser}
                                readOnly={isReadOnlyView}
                                guideOnly={limpiezaAsGuide}
                            />
                        </div>
                    )}
                    {canSeeHitos && (
                        <div className={activeTab === "HITOS" ? "block" : "hidden"} aria-hidden={activeTab !== "HITOS"}>
                            <HitosTab
                                key={flight.id}
                                flight={flight}
                                readOnly={isReadOnlyView}
                                canEditAfterSent={canEditHitosAfterSent}
                                onPersistHitos={onPersistHitos}
                                onSave={(data) => {
                                    onSaveHitos(data);
                                }}
                            />
                        </div>
                    )}
                    {canSeeCrew && (
                        <div className={activeTab === "CREW" ? "block" : "hidden"} aria-hidden={activeTab !== "CREW"}>
                            <HitosCrewTab
                                key={flight.id}
                                flight={flight}
                                readOnly={isReadOnlyView || userRole !== "CREW"}
                                onPersistCrewHitos={onPersistCrewHitos}
                                onSave={(data) => {
                                    onSaveCrewHitos(data);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
