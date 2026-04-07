import { useState } from "react";
import type { Flight } from "../types";
import { MVTForm } from "./MVTForm";
import { HitosTab } from "./HitosTab";
import { HitosCrewTab } from "./HitosCrewTab";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { X } from "lucide-react";

interface Props {
    flight: Flight;
    userRole: import("../types").UserRole;
    onClose: () => void;
    onSaveMVT: (data: Flight["mvtData"]) => void;
    onSaveHitos: (data: any) => void;
    onSaveCrewHitos: (data: any) => void;
}

export function FlightModal({ flight, userRole, onClose, onSaveMVT, onSaveHitos, onSaveCrewHitos }: Props) {
    const [activeTab, setActiveTab] = useState<"MVT" | "HITOS" | "CREW">(() => {
        return userRole === "CREW" ? "CREW" : "MVT";
    });

    const canSeeStandard = userRole === "ADMIN" || userRole === "HCC" || userRole === "SC" || userRole === "AJS";
    const canSeeCrew = userRole === "ADMIN" || userRole === "CREW" || userRole === "AJS";
    const isReadOnlyView = userRole === "AJS";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl h-[90vh] md:h-auto md:max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 relative">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pr-10">
                        <div>
                            <h2 className="text-xl md:text-2xl font-black text-primary tracking-tight">
                                {getAirlinePrefix(flight.flt)} {flight.flt}
                            </h2>
                            <p className="text-sm font-semibold text-muted-foreground">{flight.dep} → {flight.arr}</p>
                        </div>
                        <div className="hidden sm:block h-8 w-px bg-border mx-2"></div>
                        <div className="flex gap-4 items-center">
                            <div>
                                <p className="text-xs text-muted-foreground">Matrícula</p>
                                <p className="font-bold text-sm md:text-base">{flight.reg}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">STD</p>
                                <p className="font-bold text-sm md:text-base">{flight.std}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors shadow-sm border border-slate-200"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 border-b border-border bg-slate-50/50">
                    {canSeeStandard && (
                        <>
                            <button
                                onClick={() => setActiveTab("MVT")}
                                className={`px-6 py-3 text-sm font-bold uppercase tracking-wider relative transition-colors ${activeTab === "MVT" ? "text-blue-600" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                MVT
                                {activeTab === "MVT" && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-lg"></span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab("HITOS")}
                                className={`px-6 py-3 text-sm font-bold uppercase tracking-wider relative transition-colors ${activeTab === "HITOS" ? "text-blue-600" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                Hitos
                                {activeTab === "HITOS" && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-lg"></span>
                                )}
                            </button>
                        </>
                    )}
                    {canSeeCrew && (
                        <button
                            onClick={() => setActiveTab("CREW")}
                            className={`px-6 py-3 text-sm font-bold uppercase tracking-wider relative transition-colors ${activeTab === "CREW" ? "text-blue-600" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Hitos Crew
                            {activeTab === "CREW" && (
                                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-lg"></span>
                            )}
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
                    {activeTab === "MVT" && canSeeStandard && (
                        <MVTForm
                            flight={flight}
                            readOnly={isReadOnlyView}
                            onSave={(data) => {
                                onSaveMVT(data);
                            }}
                        />
                    )}
                    {activeTab === "HITOS" && canSeeStandard && (
                        <HitosTab
                            flight={flight}
                            readOnly={isReadOnlyView}
                            onSave={(data) => {
                                onSaveHitos(data);
                                onClose();
                            }}
                        />
                    )}
                    {activeTab === "CREW" && canSeeCrew && (
                        <HitosCrewTab
                            flight={flight}
                            readOnly={isReadOnlyView}
                            onSave={(data) => {
                                onSaveCrewHitos(data);
                                onClose();
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
