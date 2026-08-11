import { useEffect, useMemo, useState } from "react";
import type { Flight } from "../types";
import { fetchAa2000Flights, type Aa2000FlightData } from "../lib/aa2000Api";
import { Clock, Plane, MapPin } from "lucide-react";

interface Props {
    flights: Flight[];
    selectedDate: string;
}

interface FlightPair {
    arrival: Flight;
    departure: Flight | null;
}

export function CombustibleBoard({ flights, selectedDate }: Props) {
    const [aa2000Flights, setAa2000Flights] = useState<Aa2000FlightData[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!selectedDate) return;
        let isMounted = true;
        setLoading(true);
        fetchAa2000Flights("AEP", selectedDate).then((res) => {
            if (isMounted) {
                setAa2000Flights(res);
                setLoading(false);
            }
        });
        return () => {
            isMounted = false;
        };
    }, [selectedDate]);

    const pairs = useMemo(() => {
        // Find arrivals to AEP
        const arrivals = flights.filter(f => f.arr === "AEP" && !f.cancelled);
        // Find departures from AEP
        const departures = flights.filter(f => f.dep === "AEP" && !f.cancelled);

        // Sort them by STD to find the next departure
        departures.sort((a, b) => a.std.localeCompare(b.std));

        const result: FlightPair[] = [];
        const usedDepartures = new Set<string>();

        for (const arr of arrivals) {
            const nextDep = departures.find(d => d.reg === arr.reg && d.std >= arr.std && !usedDepartures.has(d.id));
            if (nextDep) {
                usedDepartures.add(nextDep.id);
            }
            result.push({ arrival: arr, departure: nextDep ?? null });
        }

        // Sort pairs by arrival STD
        result.sort((a, b) => a.arrival.std.localeCompare(b.arrival.std));
        return result;
    }, [flights]);

    const getTamsInfo = (flight: Flight) => {
        // Try to match by airline code (e.g. WJ) + flight number
        const flightNumberMatch = flight.flt.replace(/\D/g, "");
        const tamsMatch = aa2000Flights.find(t => t.nro.replace(/\D/g, "") === flightNumberMatch && (flight.arr === "AEP" ? t.mov === "A" : t.mov === "D"));
        return tamsMatch;
    };

    if (loading && aa2000Flights.length === 0) {
        return <div className="p-8 text-center text-slate-500 font-semibold animate-pulse">Cargando datos de AA2000...</div>;
    }

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
            <div className="flex items-center gap-3 mb-2">
                <div className="bg-orange-100 p-2 rounded-lg">
                    <Plane className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Carga de Combustible</h2>
                    <p className="text-xs font-semibold text-slate-500">Pares de vuelo (Arribo + Salida) en Aeroparque (AEP)</p>
                </div>
            </div>

            {pairs.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                    <p className="text-slate-500 font-semibold">No hay arribos a AEP programados para esta fecha.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {pairs.map((pair, idx) => {
                        const tamsArr = getTamsInfo(pair.arrival);
                        const arrTime = tamsArr?.atda || tamsArr?.etda || tamsArr?.stda || pair.arrival.sta;
                        const pos = tamsArr?.posicion || "—";
                        
                        return (
                            <div key={pair.arrival.id || idx} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
                                {/* Arribo */}
                                <div className="flex-1 p-4 bg-slate-50/50 border-b md:border-b-0 md:border-r border-slate-100">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Plane className="w-4 h-4 text-blue-500" />
                                        <span className="text-[10px] font-black uppercase text-blue-700 tracking-wider bg-blue-100 px-2 py-0.5 rounded">Arribo</span>
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-2xl font-black text-slate-800 tracking-tight">{pair.arrival.flt}</p>
                                            <p className="text-sm font-bold text-slate-500">{pair.arrival.dep} → {pair.arrival.arr}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-700 bg-slate-200/50 px-2 py-1 rounded-md">{pair.arrival.reg || "S/M"}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="bg-white border border-slate-200 p-2.5 rounded-xl">
                                            <p className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> POS</p>
                                            <p className="text-lg font-black text-slate-700 mt-0.5">{pos}</p>
                                        </div>
                                        <div className="bg-white border border-slate-200 p-2.5 rounded-xl">
                                            <p className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> ETA/ATA</p>
                                            <p className="text-lg font-black text-slate-700 mt-0.5">{arrTime}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Salida */}
                                <div className="flex-1 p-4">
                                    {pair.departure ? (
                                        <>
                                            <div className="flex items-center gap-2 mb-3">
                                                <Plane className="w-4 h-4 text-orange-500" />
                                                <span className="text-[10px] font-black uppercase text-orange-700 tracking-wider bg-orange-100 px-2 py-0.5 rounded">Salida</span>
                                            </div>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-2xl font-black text-slate-800 tracking-tight">{pair.departure.flt}</p>
                                                    <p className="text-sm font-bold text-slate-500">{pair.departure.dep} → {pair.departure.arr}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-slate-400 uppercase">STD</p>
                                                    <p className="text-lg font-black text-slate-700 -mt-1">{pair.departure.std}</p>
                                                </div>
                                            </div>
                                            {pair.departure.etd && pair.departure.etd !== pair.departure.std && (
                                                <div className="mt-4 bg-red-50 border border-red-100 p-2.5 rounded-xl">
                                                    <p className="text-[10px] font-black uppercase text-red-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Reprogramado (ETD)</p>
                                                    <p className="text-lg font-black text-red-700 mt-0.5">{pair.departure.etd}</p>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                            <Plane className="w-6 h-6 text-slate-300 mb-2" />
                                            <p className="text-sm font-semibold text-slate-400">Sin salida programada</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
