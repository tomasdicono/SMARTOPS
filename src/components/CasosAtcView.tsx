import { useState, useMemo } from "react";
import { Download, ChevronDown, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { type Flight } from "../types";
import { parseTimeToMinutes, formatMinutesToHHMM, formatMvtTimeDisplay } from "../lib/mvtTime";

interface FlightWithDelay extends Flight {
  _filteredDelayMins: number;
}

interface CasosAtcViewProps {
  flights: Flight[];
  onFlightSelect?: (flight: Flight) => void;
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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
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
            <p className="text-sm text-gray-500 mt-1">
              Seleccioná un rango de fechas y filtros para buscar demoras.
            </p>
          </div>
          <button
            onClick={handleDownloadExcel}
            disabled={filteredFlights.length === 0}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={20} />
            <span className="font-medium">Descargar Excel</span>
          </button>
        </div>

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
      </div>
    </div>
  );
}
