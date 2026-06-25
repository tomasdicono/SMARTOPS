import { useState, useEffect } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "../lib/firebase";
import { Loader2, AlertTriangle } from "lucide-react";
import type { User } from "../types";
import { startOfWeek, isBefore, format } from "date-fns";

const BASES = [
  "AEP", "EZE", "BRC", "COR", "CPC", "CRD", "FTE", "JUJ", "IGR", "MDZ", "NQN", 
  "REL", "RES", "SDE", "SLA", "UAQ", "TUC", "USH"
];

const EQUIPOS = [
  "GPU ITC", "ASU ITC", "ACU ITC", "Papamovil ITC", "De-icing ITC",
  "GPU ARSA", "ASU ARSA", "ACU ARSA", "Papamovil ARSA", "De-icing ARSA"
];

type StatusOption = "Operativo" | "Inoperativo" | "No disponible";

interface EquipmentData {
  status: StatusOption;
  updatedBy: string;
  lastUpdated: number;
}

interface StatusEquiposGRHViewProps {
  currentUser: User | null;
}

export function StatusEquiposGRHView({ currentUser }: StatusEquiposGRHViewProps) {
  const [data, setData] = useState<Record<string, Record<string, EquipmentData | string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const statusRef = ref(db, "statusEquiposGRH");
    const unsub = onValue(statusRef, (snap) => {
      if (snap.exists()) {
        setData(snap.val());
      } else {
        setData({});
      }
      setLoading(false);
    }, (error) => {
      console.error("Error cargando statusEquiposGRH:", error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleChange = (base: string, equipo: string, value: StatusOption) => {
    const now = Date.now();
    const userName = currentUser?.name?.trim() || currentUser?.email || "Usuario";
    
    const newValue: EquipmentData = {
      status: value,
      updatedBy: userName,
      lastUpdated: now
    };

    const updated = {
      ...data,
      [base]: {
        ...(data[base] || {}),
        [equipo]: newValue
      }
    };
    
    setData(updated); // Optimistic update
    set(ref(db, `statusEquiposGRH/${base}/${equipo}`), newValue);
  };

  const getEquipmentState = (base: string, equipo: string) => {
    const rawVal = data[base]?.[equipo];
    
    if (!rawVal) {
      return { status: "No disponible" as StatusOption, isOutdated: false, tooltip: "" };
    }

    // Handle legacy string data if any is left over
    if (typeof rawVal === "string") {
      return { status: rawVal as StatusOption, isOutdated: true, tooltip: "Falta actualizar esta semana" };
    }

    const { status, updatedBy, lastUpdated } = rawVal;
    
    // Check if it's older than this week's Monday
    const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const isOutdated = isBefore(new Date(lastUpdated), thisMonday);
    
    const formattedDate = format(new Date(lastUpdated), "dd/MM/yyyy HH:mm");
    let tooltip = `Actualizado por: ${updatedBy}\nEl: ${formattedDate}`;
    if (isOutdated) {
      tooltip += "\n⚠️ Requiere actualización (dato de la semana pasada o anterior)";
    }

    return { status, isOutdated, tooltip };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800">Status Equipos GRH</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Estado operativo de equipos por base. Se requiere actualizar los estados cada comienzo de semana.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">Base</th>
              {EQUIPOS.map((eq) => (
                <th key={eq} className="px-4 py-3 text-center border-r border-slate-200 last:border-0">{eq}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BASES.map((base) => (
              <tr key={base} className="hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3 font-black text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                  {base}
                </td>
                {EQUIPOS.map((eq) => {
                  const { status, isOutdated, tooltip } = getEquipmentState(base, eq);
                  return (
                    <td key={eq} className="px-2 py-2 border-r border-slate-100 last:border-0 relative">
                      <div className="relative group/cell" title={tooltip}>
                        <select
                          value={status}
                          onChange={(e) => handleChange(base, eq, e.target.value as StatusOption)}
                          className={`text-xs font-bold rounded-lg px-2 py-1.5 border-0 shadow-sm cursor-pointer w-full text-center transition-colors appearance-none ${
                            status === "Operativo" 
                              ? "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1" 
                              : status === "Inoperativo"
                              ? "bg-rose-500 text-white hover:bg-rose-600 focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
                              : "bg-slate-400 text-white hover:bg-slate-500 focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
                          } ${isOutdated ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                        >
                          <option value="Operativo">Operativo</option>
                          <option value="Inoperativo">Inoperativo</option>
                          <option value="No disponible">No disponible</option>
                        </select>
                        {isOutdated && (
                          <div className="absolute -top-1.5 -right-1.5 bg-amber-100 text-amber-600 rounded-full p-0.5 shadow-sm border border-amber-200 pointer-events-none">
                            <AlertTriangle className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
