import { useState, useMemo } from "react";
import { Download, ChevronDown, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { type Flight } from "../types";
import { parseTimeToMinutes, formatMinutesToHHMM, formatMvtTimeDisplay } from "../lib/mvtTime";
import { getAirlinePrefix } from "../lib/flightHelpers";
import { formatDelayCell, delayTimeCellClassName, totalDelayMinutes } from "../lib/dailyReportHelpers";
import { downloadDailyOtpPdf } from "../lib/dailyOtpPdf";

interface FlightWithDelay extends Flight {
  _filteredDelayMins: number;
}

interface CasosAtcViewProps {
  flights: Flight[];
  onFlightSelect?: (flight: Flight) => void;
  onUpdatePlanDeAccion?: (flightId: string, text: string) => void;
}

function MultiSelect({ label, options, selected, onToggle }: { label: string, options: string[], selected: string[], onToggle: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative flex-1">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div 
        className="w-full rounded-lg border-gray-300 shadow-sm p-2 border bg-white flex justify-between items-center cursor-pointer min-h-[42px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1 truncate text-sm">
          {selected.length === 0 ? "Todos" : selected.join(", ")}
        </div>
        <ChevronDown size={16} className="text-gray-500 ml-2" />
      </div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="p-2 text-sm text-gray-500 text-center">No hay opciones</div>
            ) : (
              options.map(opt => (
                <div 
                  key={opt}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(opt);
                  }}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${selected.includes(opt) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {selected.includes(opt) && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm">{opt}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CasosAtcView({ flights, onFlightSelect }: CasosAtcViewProps) {
  const [activeTab, setActiveTab] = useState<"buscador" | "dailyOtp">("buscador");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [otpDate, setOtpDate] = useState("");
  
  const planRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const planTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      Object.values(planTimers.current).forEach(clearTimeout);
    };
  }, []);

  const flushPlan = (id: string, text: string) => {
      if (planTimers.current[id]) {
          clearTimeout(planTimers.current[id]);
          delete planTimers.current[id];
      }
      onUpdatePlanDeAccion?.(id, text);
  };

  const schedulePlan = (id: string, text: string) => {
      if (planTimers.current[id]) clearTimeout(planTimers.current[id]);
      planTimers.current[id] = setTimeout(() => {
          flushPlan(id, text);
      }, 600);
  };
  
  const [selectedAirports, setSelectedAirports] = useState<string[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const availableAirports = useMemo(() => {
    const airports = new Set<string>();
    flights.forEach(f => {
      if (f.dep) airports.add(f.dep);
      if (f.arr) airports.add(f.arr);
    });
    return Array.from(airports).sort();
  }, [flights]);

  const availableCodes = useMemo(() => {
    const codes = new Set<string>();
    flights.forEach(f => {
      if (f.mvtData?.dlyCod1) codes.add(f.mvtData.dlyCod1);
      if (f.mvtData?.dlyCod2) codes.add(f.mvtData.dlyCod2);
    });
    return Array.from(codes).sort();
  }, [flights]);

  const toggleAirport = (airport: string) => {
    setSelectedAirports(prev => 
      prev.includes(airport) ? prev.filter(a => a !== airport) : [...prev, airport]
    );
  };

  const toggleCode = (code: string) => {
    setSelectedCodes(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const filteredFlights = useMemo(() => {
    if (!startDate || !endDate) return [];
    
    return flights.filter((f) => {
      const [day, month, year] = f.date.split("-");
      const flightIso = `${year}-${month}-${day}`;
      
      if (flightIso < startDate || flightIso > endDate) return false;

      if (selectedAirports.length > 0) {
        if (!selectedAirports.includes(f.dep) && !selectedAirports.includes(f.arr)) {
          return false;
        }
      }

      const d1 = f.mvtData?.dlyCod1;
      const d2 = f.mvtData?.dlyCod2;

      if (selectedCodes.length > 0) {
        const hasCode = (d1 && selectedCodes.includes(d1)) || (d2 && selectedCodes.includes(d2));
        if (!hasCode) return false;
      } else {
        if (!d1 && !d2) return false;
      }

      return true;
    }).map(f => {
      const d1 = f.mvtData?.dlyCod1;
      const d2 = f.mvtData?.dlyCod2;
      
      let mins = 0;
      if (selectedCodes.length > 0) {
        if (d1 && selectedCodes.includes(d1)) mins += parseTimeToMinutes(f.mvtData?.dlyTime1);
        if (d2 && selectedCodes.includes(d2)) mins += parseTimeToMinutes(f.mvtData?.dlyTime2);
      } else {
        if (d1) mins += parseTimeToMinutes(f.mvtData?.dlyTime1);
        if (d2) mins += parseTimeToMinutes(f.mvtData?.dlyTime2);
      }

      return { ...f, _filteredDelayMins: mins } as FlightWithDelay;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.std.localeCompare(b.std));
  }, [flights, startDate, endDate, selectedAirports, selectedCodes]);

  const OTP_CODES = ["3", "8", "12", "14", "15", "34", "85", "18", "36", "38", "11", "39", "33", "86", "87", "99", "35", "19", "58", "75"];

  const otpFlights = useMemo(() => {
    if (!otpDate) return [];
    return flights.filter(f => {
      const [day, month, year] = f.date.split("-");
      const flightIso = `${year}-${month}-${day}`;
      if (flightIso !== otpDate) return false;

      const d1 = f.mvtData?.dlyCod1;
      const d2 = f.mvtData?.dlyCod2;
      const t1 = parseTimeToMinutes(f.mvtData?.dlyTime1);
      const t2 = parseTimeToMinutes(f.mvtData?.dlyTime2);

      if (d1 && OTP_CODES.includes(d1)) return true;
      if (d2 && OTP_CODES.includes(d2)) return true;
      if (d1 === "66" && t1 > 10) return true;
      if (d2 === "66" && t2 > 10) return true;

      return false;
    }).sort((a, b) => a.std.localeCompare(b.std));
  }, [flights, otpDate]);

  const handleDownloadOtpPdf = () => {
    if (otpFlights.length === 0 || !otpDate) return;
    const currentPlanMap: Record<string, string> = {};
    otpFlights.forEach(f => {
        const el = planRefs.current[f.id];
        const text = el ? el.value : (f.planDeAccion || "");
        if (text) currentPlanMap[f.id] = text;
    });
    downloadDailyOtpPdf(otpFlights, otpDate, currentPlanMap);
  };

  const handleDownloadExcel = () => {
    if (filteredFlights.length === 0) return;

    const data = filteredFlights.map((f) => ({
      Fecha: f.date,
      Vuelo: f.flt,
      Matrícula: f.reg,
      Ruta: `${f.dep} - ${f.arr}`,
      STD: f.std,
      ATD: formatMvtTimeDisplay(f.mvtData?.atd),
      "DLY 1": f.mvtData?.dlyCod1 || "",
      "DLY 2": f.mvtData?.dlyCod2 || "",
      "Demoras codigos filtrados (HH:MM)": f._filteredDelayMins > 0 ? formatMinutesToHHMM(f._filteredDelayMins) : "",
      "PAX PROG": f.pax,
      "PAX MVT": f.mvtData?.paxActual || "",
      "Observaciones": f.mvtData?.observaciones || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Buscador Demoras");
    
    XLSX.writeFile(workbook, `Buscador_Demoras_${startDate}_to_${endDate}.xlsx`);
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Buscador demoras</h1>
            <div className="flex gap-4 mt-3 border-b border-gray-200">
              <button
                className={`pb-2 px-1 text-sm font-medium ${activeTab === 'buscador' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('buscador')}
              >
                Buscador Demoras
              </button>
              <button
                className={`pb-2 px-1 text-sm font-medium ${activeTab === 'dailyOtp' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('dailyOtp')}
              >
                Daily OTP
              </button>
            </div>
          </div>
          {activeTab === "buscador" && (
            <button
              onClick={handleDownloadExcel}
              disabled={filteredFlights.length === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={20} />
              <span className="font-medium">Descargar Excel</span>
            </button>
          )}
        </div>

        {activeTab === "buscador" && (
          <>

        <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border min-h-[42px]"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border min-h-[42px]"
            />
          </div>
          <MultiSelect 
            label="Aeropuertos" 
            options={availableAirports} 
            selected={selectedAirports} 
            onToggle={toggleAirport} 
          />
          <MultiSelect 
            label="Códigos de Demora" 
            options={availableCodes} 
            selected={selectedCodes} 
            onToggle={toggleCode} 
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vuelo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matrícula</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruta</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">STD / ATD</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DLY</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Demoras codigos filtrados</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAX MVT</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFlights.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      {!startDate || !endDate 
                        ? "Seleccioná un rango de fechas para comenzar" 
                        : "No se encontraron vuelos que coincidan con los filtros."}
                    </td>
                  </tr>
                ) : (
                  filteredFlights.map((f) => (
                    <tr 
                      key={f.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => onFlightSelect && onFlightSelect(f)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{f.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{f.flt}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.reg}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.dep} - {f.arr}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {f.std} / {formatMvtTimeDisplay(f.mvtData?.atd)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {f.mvtData?.dlyCod1 && (
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${selectedCodes.length > 0 && selectedCodes.includes(f.mvtData.dlyCod1) ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                             {f.mvtData.dlyCod1}
                           </span>
                        )}
                        {f.mvtData?.dlyCod2 && (
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedCodes.length > 0 && selectedCodes.includes(f.mvtData.dlyCod2) ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                             {f.mvtData.dlyCod2}
                           </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                        {f._filteredDelayMins > 0 ? formatMinutesToHHMM(f._filteredDelayMins) : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {f.mvtData?.paxActual || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}

        {activeTab === "dailyOtp" && (
          <>
            <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de OTP</label>
                 <input
                   type="date"
                   value={otpDate}
                   onChange={(e) => setOtpDate(e.target.value)}
                   className="w-full sm:w-auto rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 p-2 border min-h-[42px]"
                 />
               </div>
               <button
                 onClick={handleDownloadOtpPdf}
                 disabled={otpFlights.length === 0}
                 className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Download size={20} />
                 <span className="font-medium">Descargar PDF</span>
               </button>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DLY TTL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FLT Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">STD</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ATD</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reg</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">1° Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">2° Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Observaciones</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan de acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {otpFlights.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-6 py-8 text-center text-gray-500">
                          {!otpDate 
                            ? "Seleccioná una fecha para ver los vuelos OTP." 
                            : "No se encontraron vuelos OTP para esta fecha."}
                        </td>
                      </tr>
                    ) : (
                      otpFlights.map((f) => {
                        const m = f.mvtData!;
                        const ttl = totalDelayMinutes(f);
                        const atdStr = m.atd ? formatMinutesToHHMM(parseTimeToMinutes(m.atd)) : "—";
                        return (
                          <tr key={f.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-amber-800 text-sm">
                                  {formatMinutesToHHMM(ttl)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-black text-sm text-gray-900">
                                  <span className="text-gray-500 font-bold">{getAirlinePrefix(f.flt)}</span>
                                  {f.flt}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-gray-500">{f.std || "—"}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-gray-900">{atdStr}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-bold text-sm text-gray-900">{f.dep}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-bold text-sm text-gray-900">{f.arr}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-sm text-gray-500">{f.reg}</td>
                              <td className={`whitespace-nowrap text-sm ${delayTimeCellClassName(m.dlyTime1)}`}>
                                  {formatDelayCell(m.dlyTime1)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-bold text-sm text-gray-800">{m.dlyCod1 || "—"}</td>
                              <td className={`whitespace-nowrap text-sm ${delayTimeCellClassName(m.dlyTime2)}`}>
                                  {formatDelayCell(m.dlyTime2)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-bold text-sm text-gray-800">{m.dlyCod2 || "—"}</td>
                              <td className="px-4 py-3 w-[400px]">
                                  <textarea
                                      readOnly
                                      value={f.dailyReportObs || ""}
                                      rows={3}
                                      className="w-full text-xs border border-gray-200 rounded-lg p-1.5 bg-gray-50 text-gray-500 resize-none cursor-default focus:outline-none"
                                  />
                              </td>
                              <td className="px-4 py-3 w-[300px]">
                                  <textarea
                                      key={`plan-${f.id}`}
                                      ref={(el) => {
                                          planRefs.current[f.id] = el;
                                      }}
                                      defaultValue={f.planDeAccion || ""}
                                      rows={3}
                                      placeholder="Plan de acción…"
                                      onChange={(e) => schedulePlan(f.id, e.target.value)}
                                      onBlur={(e) => flushPlan(f.id, e.target.value)}
                                      className="w-full text-xs border border-gray-300 rounded-lg p-1.5 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
                                  />
                              </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
