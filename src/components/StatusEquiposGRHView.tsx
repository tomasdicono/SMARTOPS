import { useState, useEffect, useRef } from "react";
import { ref, onValue, set, push, remove } from "firebase/database";
import { db } from "../lib/firebase";
import { Loader2, AlertTriangle, Plus, Trash2, History, Wrench, ChevronDown, X, Upload } from "lucide-react";
import type { User } from "../types";
import { startOfWeek, isBefore, format } from "date-fns";
import * as XLSX from "xlsx";

const BASES = [
  "AEP", "EZE", "BRC", "COR", "CPC", "CRD", "FTE", "JUJ", "IGR", "MDZ", "NQN", 
  "REL", "RES", "SDE", "SLA", "UAQ", "TUC", "USH"
];

const EQUIPOS = [
  "GPU ITC", "ASU ITC", "ACU ITC", "Papamovil ITC", "De-icing ITC",
  "GPU ARSA", "ASU ARSA", "ACU ARSA", "Papamovil ARSA", "De-icing ARSA"
];

const BASES_ESPECIALES = ["ASU"];
const EQUIPOS_ESPECIALES = ["GPU", "ASU", "Papamovil", "ACU"];

const AEROPUERTOS_HISTORIAL = [
  "AEP", "EZE", "BRC", "COR", "CPC", "CRD", "FTE", "IGR", "JUJ", "MDZ", 
  "NQN", "PSS", "REL", "RES", "SLA", "SDE", "TUC", "UAQ", "USH"
];

const TIPOS_EQUIPO = ["GPU", "ASU", "ACU"] as const;
type TipoEquipo = typeof TIPOS_EQUIPO[number];

type StatusOption = "Operativo" | "Inoperativo" | "No disponible";

type SubTab = "estado" | "historial";

type Prestador = "ITC" | "ARSA" | "OTRO";
const PRESTADORES: Prestador[] = ["ITC", "ARSA", "OTRO"];

interface EquipoHistorial {
  id: string;
  numero: string;
  tipo: TipoEquipo;
  aeropuerto: string;
  marcaModelo?: string;
  prestador: Prestador;
  createdAt: number;
  createdBy: string;
}

interface FallaHistorial {
  id: string;
  equipoId: string;
  vuelo: string;
  fecha: string;
  falla: string;
  createdAt: number;
  createdBy: string;
}

interface EquipmentData {
  status: StatusOption;
  updatedBy: string;
  lastUpdated: number;
}

interface StatusEquiposGRHViewProps {
  currentUser: User | null;
}

export function StatusEquiposGRHView({ currentUser }: StatusEquiposGRHViewProps) {
  const [subTab, setSubTab] = useState<SubTab>("estado");
  const [data, setData] = useState<Record<string, Record<string, EquipmentData | string>>>({});
  const [loading, setLoading] = useState(true);
  
  // Historial state
  const [equiposHistorial, setEquiposHistorial] = useState<Record<string, EquipoHistorial>>({});
  const [fallasHistorial, setFallasHistorial] = useState<Record<string, FallaHistorial>>({});
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [selectedAeropuerto, setSelectedAeropuerto] = useState<string>("AEP");
  
  // Modal state for adding equipment
  const [showAddEquipo, setShowAddEquipo] = useState(false);
  const [newEquipoNumero, setNewEquipoNumero] = useState("");
  const [newEquipoTipo, setNewEquipoTipo] = useState<TipoEquipo>("GPU");
  const [newEquipoMarcaModelo, setNewEquipoMarcaModelo] = useState("");
  const [newEquipoPrestador, setNewEquipoPrestador] = useState<Prestador>("ITC");
  
  // Excel import state
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Modal state for adding falla
  const [showAddFalla, setShowAddFalla] = useState(false);
  const [selectedEquipoForFalla, setSelectedEquipoForFalla] = useState<string | null>(null);
  const [newFallaVuelo, setNewFallaVuelo] = useState("");
  const [newFallaFecha, setNewFallaFecha] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newFallaDescripcion, setNewFallaDescripcion] = useState("");

  useEffect(() => {
    const statusRef = ref(db, "statusEquiposGRH");
    
    // Timeout para evitar loading infinito
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);
    
    const unsub = onValue(statusRef, (snap) => {
      clearTimeout(timeout);
      if (snap.exists()) {
        setData(snap.val());
      } else {
        setData({});
      }
      setLoading(false);
    }, (error) => {
      clearTimeout(timeout);
      console.error("Error cargando statusEquiposGRH:", error);
      setLoading(false);
    });
    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  // Load historial data
  useEffect(() => {
    const equiposRef = ref(db, "historialEquipos/equipos");
    const fallasRef = ref(db, "historialEquipos/fallas");
    
    // Timeout para evitar loading infinito
    const timeout = setTimeout(() => {
      setLoadingHistorial(false);
    }, 5000);
    
    const unsubEquipos = onValue(equiposRef, (snap) => {
      if (snap.exists()) {
        setEquiposHistorial(snap.val());
      } else {
        setEquiposHistorial({});
      }
    }, (error) => {
      console.error("Error cargando equipos historial:", error);
    });
    
    const unsubFallas = onValue(fallasRef, (snap) => {
      clearTimeout(timeout);
      if (snap.exists()) {
        setFallasHistorial(snap.val());
      } else {
        setFallasHistorial({});
      }
      setLoadingHistorial(false);
    }, (error) => {
      clearTimeout(timeout);
      console.error("Error cargando fallas historial:", error);
      setLoadingHistorial(false);
    });
    
    return () => {
      clearTimeout(timeout);
      unsubEquipos();
      unsubFallas();
    };
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

  // Historial functions
  const equiposByAeropuerto = Object.entries(equiposHistorial)
    .filter(([, eq]) => eq.aeropuerto === selectedAeropuerto)
    .map(([id, eq]) => ({ ...eq, id }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.numero.localeCompare(b.numero));

  const getFallasForEquipo = (equipoId: string) => {
    return Object.entries(fallasHistorial)
      .filter(([, f]) => f.equipoId === equipoId)
      .map(([id, f]) => ({ ...f, id }))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  };

  const handleAddEquipo = () => {
    if (!newEquipoNumero.trim()) return;
    
    const userName = currentUser?.name?.trim() || currentUser?.email || "Usuario";
    const newEquipo: Omit<EquipoHistorial, "id"> = {
      numero: newEquipoNumero.trim(),
      tipo: newEquipoTipo,
      aeropuerto: selectedAeropuerto,
      prestador: newEquipoPrestador,
      ...(newEquipoMarcaModelo.trim() && { marcaModelo: newEquipoMarcaModelo.trim() }),
      createdAt: Date.now(),
      createdBy: userName
    };
    
    const newRef = push(ref(db, "historialEquipos/equipos"));
    set(newRef, newEquipo)
      .then(() => {
        console.log("Equipo agregado correctamente");
      })
      .catch((error) => {
        console.error("Error al agregar equipo:", error);
        alert("Error al agregar equipo: " + error.message);
      });
    
    setNewEquipoNumero("");
    setNewEquipoMarcaModelo("");
    setNewEquipoPrestador("ITC");
    setShowAddEquipo(false);
  };

  const handleImportExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const userName = currentUser?.name?.trim() || currentUser?.email || "Usuario";
        let imported = 0;
        let errors = 0;

        for (const row of jsonData as Record<string, unknown>[]) {
          const tipoRaw = String(row["Equipo"] || row["EQUIPO"] || row["Tipo"] || row["TIPO"] || "").toUpperCase().trim();
          const numero = String(row["Número de equipo"] || row["NÚMERO DE EQUIPO"] || row["Numero"] || row["NUMERO"] || row["Número"] || "").trim();
          const marcaModelo = String(row["Marca/Modelo"] || row["MARCA/MODELO"] || row["Marca"] || row["MARCA"] || "").trim();
          const prestadorRaw = String(row["Proveedor"] || row["PROVEEDOR"] || row["Prestador"] || row["PRESTADOR"] || "").toUpperCase().trim();
          const aeropuerto = String(row["ATO"] || row["ato"] || row["Aeropuerto"] || row["AEROPUERTO"] || "").toUpperCase().trim();

          // Validar tipo
          let tipo: TipoEquipo;
          if (tipoRaw === "GPU") tipo = "GPU";
          else if (tipoRaw === "ASU") tipo = "ASU";
          else if (tipoRaw === "ACU") tipo = "ACU";
          else {
            errors++;
            continue;
          }

          // Validar prestador
          let prestador: Prestador;
          if (prestadorRaw === "ITC") prestador = "ITC";
          else if (prestadorRaw === "ARSA") prestador = "ARSA";
          else prestador = "OTRO";

          // Validar campos requeridos
          if (!numero || !aeropuerto) {
            errors++;
            continue;
          }

          const newEquipo: Omit<EquipoHistorial, "id"> = {
            numero,
            tipo,
            aeropuerto,
            prestador,
            ...(marcaModelo && { marcaModelo }),
            createdAt: Date.now(),
            createdBy: userName
          };

          try {
            const newRef = push(ref(db, "historialEquipos/equipos"));
            await set(newRef, newEquipo);
            imported++;
          } catch {
            errors++;
          }
        }

        alert(`Importación completada:\n- ${imported} equipos importados\n- ${errors} errores`);
      } catch (error) {
        console.error("Error al importar Excel:", error);
        alert("Error al procesar el archivo Excel");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDeleteEquipo = (equipoId: string) => {
    if (!confirm("¿Eliminar este equipo y todas sus fallas?")) return;
    
    // Delete equipo
    remove(ref(db, `historialEquipos/equipos/${equipoId}`));
    
    // Delete all fallas for this equipo
    Object.entries(fallasHistorial)
      .filter(([, f]) => f.equipoId === equipoId)
      .forEach(([fallaId]) => {
        remove(ref(db, `historialEquipos/fallas/${fallaId}`));
      });
  };

  const handleAddFalla = () => {
    if (!selectedEquipoForFalla || !newFallaVuelo.trim() || !newFallaDescripcion.trim()) return;
    
    const userName = currentUser?.name?.trim() || currentUser?.email || "Usuario";
    const newFalla: Omit<FallaHistorial, "id"> = {
      equipoId: selectedEquipoForFalla,
      vuelo: newFallaVuelo.trim().toUpperCase(),
      fecha: newFallaFecha,
      falla: newFallaDescripcion.trim(),
      createdAt: Date.now(),
      createdBy: userName
    };
    
    const newRef = push(ref(db, "historialEquipos/fallas"));
    set(newRef, newFalla);
    
    setNewFallaVuelo("");
    setNewFallaDescripcion("");
    setShowAddFalla(false);
    setSelectedEquipoForFalla(null);
  };

  const handleDeleteFalla = (fallaId: string) => {
    if (!confirm("¿Eliminar esta falla del historial?")) return;
    remove(ref(db, `historialEquipos/fallas/${fallaId}`));
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
      <div className="p-6 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-800">Status Equipos GRH</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {subTab === "estado" 
                ? "Estado operativo de equipos por base. Se requiere actualizar los estados cada comienzo de semana."
                : "Historial de incidencias y fallas de equipos por aeropuerto."
              }
            </p>
          </div>
        </div>
        
        {/* Sub-tabs */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSubTab("estado")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              subTab === "estado"
                ? "bg-cyan-500 text-white shadow-md"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Wrench className="w-4 h-4" />
            Estado Actual
          </button>
          <button
            type="button"
            onClick={() => setSubTab("historial")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              subTab === "historial"
                ? "bg-cyan-500 text-white shadow-md"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            Historial de Incidencias
          </button>
        </div>
      </div>
      
      {subTab === "historial" ? (
        loadingHistorial ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : <HistorialIncidenciasTab
          aeropuertos={AEROPUERTOS_HISTORIAL}
          selectedAeropuerto={selectedAeropuerto}
          setSelectedAeropuerto={setSelectedAeropuerto}
          equipos={equiposByAeropuerto}
          getFallasForEquipo={getFallasForEquipo}
          showAddEquipo={showAddEquipo}
          setShowAddEquipo={setShowAddEquipo}
          newEquipoNumero={newEquipoNumero}
          setNewEquipoNumero={setNewEquipoNumero}
          newEquipoTipo={newEquipoTipo}
          setNewEquipoTipo={setNewEquipoTipo}
          newEquipoMarcaModelo={newEquipoMarcaModelo}
          setNewEquipoMarcaModelo={setNewEquipoMarcaModelo}
          newEquipoPrestador={newEquipoPrestador}
          setNewEquipoPrestador={setNewEquipoPrestador}
          handleAddEquipo={handleAddEquipo}
          handleImportExcel={handleImportExcel}
          isImporting={isImporting}
          fileInputRef={fileInputRef}
          handleDeleteEquipo={handleDeleteEquipo}
          showAddFalla={showAddFalla}
          setShowAddFalla={setShowAddFalla}
          selectedEquipoForFalla={selectedEquipoForFalla}
          setSelectedEquipoForFalla={setSelectedEquipoForFalla}
          newFallaVuelo={newFallaVuelo}
          setNewFallaVuelo={setNewFallaVuelo}
          newFallaFecha={newFallaFecha}
          setNewFallaFecha={setNewFallaFecha}
          newFallaDescripcion={newFallaDescripcion}
          setNewFallaDescripcion={setNewFallaDescripcion}
          handleAddFalla={handleAddFalla}
          handleDeleteFalla={handleDeleteFalla}
        />
      ) : (
        <>
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

      <div className="mt-8 border-t border-slate-200 pt-6 px-6">
        <h3 className="text-lg font-bold text-slate-800 mb-2">Bases sin ITC/ARSA</h3>
        <p className="text-sm text-slate-500 mb-4">Escalas que operan con equipos unificados.</p>
      </div>
      <div className="overflow-x-auto pb-4">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs border-y border-slate-200">
            <tr>
              <th className="px-4 py-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">Base</th>
              {EQUIPOS_ESPECIALES.map((eq) => (
                <th key={eq} className="px-4 py-3 text-center border-r border-slate-200 last:border-0">{eq}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BASES_ESPECIALES.map((base) => (
              <tr key={base} className="hover:bg-slate-50 transition-colors group border-b border-slate-200">
                <td className="px-4 py-3 font-black text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                  {base}
                </td>
                {EQUIPOS_ESPECIALES.map((eq) => {
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
        </>
      )}
    </div>
  );
}

// Historial de Incidencias Tab Component
interface HistorialIncidenciasTabProps {
  aeropuertos: string[];
  selectedAeropuerto: string;
  setSelectedAeropuerto: (a: string) => void;
  equipos: (EquipoHistorial & { id: string })[];
  getFallasForEquipo: (equipoId: string) => (FallaHistorial & { id: string })[];
  showAddEquipo: boolean;
  setShowAddEquipo: (show: boolean) => void;
  newEquipoNumero: string;
  setNewEquipoNumero: (n: string) => void;
  newEquipoTipo: TipoEquipo;
  setNewEquipoTipo: (t: TipoEquipo) => void;
  newEquipoMarcaModelo: string;
  setNewEquipoMarcaModelo: (m: string) => void;
  newEquipoPrestador: Prestador;
  setNewEquipoPrestador: (p: Prestador) => void;
  handleAddEquipo: () => void;
  handleImportExcel: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isImporting: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDeleteEquipo: (id: string) => void;
  showAddFalla: boolean;
  setShowAddFalla: (show: boolean) => void;
  selectedEquipoForFalla: string | null;
  setSelectedEquipoForFalla: (id: string | null) => void;
  newFallaVuelo: string;
  setNewFallaVuelo: (v: string) => void;
  newFallaFecha: string;
  setNewFallaFecha: (f: string) => void;
  newFallaDescripcion: string;
  setNewFallaDescripcion: (d: string) => void;
  handleAddFalla: () => void;
  handleDeleteFalla: (id: string) => void;
}

function HistorialIncidenciasTab({
  aeropuertos,
  selectedAeropuerto,
  setSelectedAeropuerto,
  equipos,
  getFallasForEquipo,
  showAddEquipo,
  setShowAddEquipo,
  newEquipoNumero,
  setNewEquipoNumero,
  newEquipoTipo,
  setNewEquipoTipo,
  newEquipoMarcaModelo,
  setNewEquipoMarcaModelo,
  newEquipoPrestador,
  setNewEquipoPrestador,
  handleAddEquipo,
  handleImportExcel,
  isImporting,
  fileInputRef,
  handleDeleteEquipo,
  showAddFalla,
  setShowAddFalla,
  selectedEquipoForFalla,
  setSelectedEquipoForFalla,
  newFallaVuelo,
  setNewFallaVuelo,
  newFallaFecha,
  setNewFallaFecha,
  newFallaDescripcion,
  setNewFallaDescripcion,
  handleAddFalla,
  handleDeleteFalla,
}: HistorialIncidenciasTabProps) {
  const [expandedEquipos, setExpandedEquipos] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedEquipos(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedEquipo = equipos.find(e => e.id === selectedEquipoForFalla);

  return (
    <div className="p-6">
      {/* Airport Filter */}
      <div className="mb-6">
        <label className="block text-sm font-bold text-slate-700 mb-2">Filtrar por Aeropuerto</label>
        <div className="flex flex-wrap gap-2">
          {aeropuertos.map((apt) => (
            <button
              key={apt}
              type="button"
              onClick={() => setSelectedAeropuerto(apt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedAeropuerto === apt
                  ? "bg-cyan-500 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {apt}
            </button>
          ))}
        </div>
      </div>

      {/* Add Equipment Button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800">
          Equipos en {selectedAeropuerto}
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Importar Excel
          </button>
          <button
            type="button"
            onClick={() => setShowAddEquipo(true)}
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar Equipo
          </button>
        </div>
      </div>

      {/* Equipment List */}
      {equipos.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Wrench className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No hay equipos registrados en {selectedAeropuerto}</p>
          <p className="text-sm mt-1">Agrega un equipo para comenzar a registrar fallas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {equipos.map((equipo) => {
            const fallas = getFallasForEquipo(equipo.id);
            const isExpanded = expandedEquipos.has(equipo.id);
            const prestadorColor = equipo.prestador === "ITC" 
              ? "border-l-emerald-500 bg-emerald-50" 
              : equipo.prestador === "ARSA" 
              ? "border-l-cyan-500 bg-cyan-50" 
              : "border-l-slate-400 bg-slate-50";
            
            return (
              <div key={equipo.id} className={`border border-slate-200 rounded-xl overflow-hidden border-l-4 ${prestadorColor}`}>
                {/* Equipment Header */}
                <div 
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:brightness-95 transition-all"
                  onClick={() => toggleExpanded(equipo.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                      equipo.tipo === "GPU" ? "bg-blue-100 text-blue-700" :
                      equipo.tipo === "ASU" ? "bg-purple-100 text-purple-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {equipo.tipo}
                    </span>
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                      equipo.prestador === "ITC" ? "bg-emerald-500 text-white" :
                      equipo.prestador === "ARSA" ? "bg-cyan-500 text-white" :
                      "bg-slate-500 text-white"
                    }`}>
                      {equipo.prestador || "OTRO"}
                    </span>
                    <span className="font-bold text-slate-800">#{equipo.numero}</span>
                    {equipo.marcaModelo && (
                      <span className="text-sm text-slate-500 italic">{equipo.marcaModelo}</span>
                    )}
                    <span className="text-sm text-slate-500">
                      ({fallas.length} {fallas.length === 1 ? "evento" : "eventos"})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEquipoForFalla(equipo.id);
                        setShowAddFalla(true);
                      }}
                      className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                      title="Agregar falla"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEquipo(equipo.id);
                      }}
                      className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                      title="Eliminar equipo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Fallas List */}
                {isExpanded && (
                  <div className="border-t border-slate-200">
                    {fallas.length === 0 ? (
                      <div className="px-4 py-6 text-center text-slate-500 text-sm">
                        No hay eventos registrados para este equipo
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {fallas.map((falla) => (
                          <div key={falla.id} className="px-4 py-3 flex items-start justify-between hover:bg-slate-50">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold">
                                  {falla.vuelo}
                                </span>
                                <span className="text-sm text-slate-500">
                                  {format(new Date(falla.fecha), "dd/MM/yyyy")}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700">{falla.falla}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                Registrado por: {falla.createdBy}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteFalla(falla.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors ml-2"
                              title="Eliminar falla"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddEquipo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">Agregar Equipo en {selectedAeropuerto}</h3>
              <button
                type="button"
                onClick={() => setShowAddEquipo(false)}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Equipo</label>
                <div className="flex gap-2">
                  {TIPOS_EQUIPO.map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setNewEquipoTipo(tipo)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 ${
                        newEquipoTipo === tipo
                          ? tipo === "GPU" ? "bg-blue-500 text-white" :
                            tipo === "ASU" ? "bg-purple-500 text-white" :
                            "bg-amber-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Número de Equipo</label>
                <input
                  type="text"
                  value={newEquipoNumero}
                  onChange={(e) => setNewEquipoNumero(e.target.value)}
                  placeholder="Ej: 001, A12, etc."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Marca / Modelo <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={newEquipoMarcaModelo}
                  onChange={(e) => setNewEquipoMarcaModelo(e.target.value)}
                  placeholder="Ej: Hobart 4400, etc."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Prestador de Servicios</label>
                <div className="flex gap-2">
                  {PRESTADORES.map((prest) => (
                    <button
                      key={prest}
                      type="button"
                      onClick={() => setNewEquipoPrestador(prest)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 ${
                        newEquipoPrestador === prest
                          ? prest === "ITC" ? "bg-emerald-500 text-white" :
                            prest === "ARSA" ? "bg-cyan-500 text-white" :
                            "bg-slate-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {prest}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowAddEquipo(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddEquipo}
                disabled={!newEquipoNumero.trim()}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Falla Modal */}
      {showAddFalla && selectedEquipo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">
                Registrar Falla - {selectedEquipo.tipo} #{selectedEquipo.numero}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddFalla(false);
                  setSelectedEquipoForFalla(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Vuelo</label>
                <input
                  type="text"
                  value={newFallaVuelo}
                  onChange={(e) => setNewFallaVuelo(e.target.value.toUpperCase())}
                  placeholder="Ej: AR1234"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Fecha</label>
                <input
                  type="date"
                  value={newFallaFecha}
                  onChange={(e) => setNewFallaFecha(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Descripción de la Falla</label>
                <textarea
                  value={newFallaDescripcion}
                  onChange={(e) => setNewFallaDescripcion(e.target.value)}
                  placeholder="Describe la falla ocurrida..."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setShowAddFalla(false);
                  setSelectedEquipoForFalla(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddFalla}
                disabled={!newFallaVuelo.trim() || !newFallaDescripcion.trim()}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Registrar Falla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
