import React, { useState, useMemo } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { type Flight } from "../types";
import { parseTimeToMinutes, formatMinutesToHHMM, formatMvtTimeDisplay } from "../lib/mvtTime";

interface FlightWithAtcDelay extends Flight {
  _atcMins: number;
}

interface CasosAtcViewProps {
  flights: Flight[];
}

export function CasosAtcView({ flights }: CasosAtcViewProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredFlights = useMemo(() => {
    if (!startDate || !endDate) return [];
    
    return flights.filter((f) => {
      // Check if flight date is within range
      // f.date is in DD-MM-YYYY format, we need to compare it as YYYY-MM-DD
      const [day, month, year] = f.date.split("-");
      const flightIso = `${year}-${month}-${day}`;
      
      if (flightIso < startDate || flightIso > endDate) return false;

      // Check for delay codes 80, 81, or 89
      const dly1 = f.mvtData?.dlyCod1;
      const dly2 = f.mvtData?.dlyCod2;
      
      const hasTargetCode = (code: string) => {
        const c = code.toUpperCase();
        return c.includes("80") || c.includes("81") || c.includes("89");
      };
      return hasTargetCode(dly1 || "") || hasTargetCode(dly2 || "");
    }).map(f => {
      const dly1 = f.mvtData?.dlyCod1;
      const dly2 = f.mvtData?.dlyCod2;
      
      const hasTargetCode = (code: string) => {
        const c = code.toUpperCase();
        return c.includes("80") || c.includes("81") || c.includes("89");
      };

      let atcMins = 0;
      if (hasTargetCode(dly1 || "")) atcMins += parseTimeToMinutes(f.mvtData?.dlyTime1);
      if (hasTargetCode(dly2 || "")) atcMins += parseTimeToMinutes(f.mvtData?.dlyTime2);

      return { ...f, _atcMins: atcMins } as FlightWithAtcDelay;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.std.localeCompare(b.std));
  }, [flights, startDate, endDate]);

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
      "Demora ATC (HH:MM)": f._atcMins > 0 ? formatMinutesToHHMM(f._atcMins) : "",
      "PAX PROG": f.pax,
      "PAX MVT": f.mvtData?.paxActual || "",
      "Observaciones": f.mvtData?.observaciones || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Casos ATC");
    
    XLSX.writeFile(workbook, `Casos_ATC_${startDate}_to_${endDate}.xlsx`);
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Casos ATC (Demoras 80, 81, 89)</h1>
            <p className="text-sm text-gray-500 mt-1">
              Seleccioná un rango de fechas para ver los vuelos afectados.
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

        <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            />
          </div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Demora ATC (HH:MM)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAX MVT</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFlights.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      {!startDate || !endDate 
                        ? "Seleccioná un rango de fechas para comenzar" 
                        : "No se encontraron vuelos con demoras ATC (80, 81, 89) en este rango de fechas."}
                    </td>
                  </tr>
                ) : (
                  filteredFlights.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{f.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{f.flt}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.reg}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{f.dep} - {f.arr}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {f.std} / {formatMvtTimeDisplay(f.mvtData?.atd)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {f.mvtData?.dlyCod1 && (
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mr-2">
                             {f.mvtData.dlyCod1}
                           </span>
                        )}
                        {f.mvtData?.dlyCod2 && (
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                             {f.mvtData.dlyCod2}
                           </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                        {f._atcMins > 0 ? formatMinutesToHHMM(f._atcMins) : "-"}
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
