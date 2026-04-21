import { useState, useEffect, useMemo } from "react";
import {
  normalizeUserRole,
  isHccDeskRole,
  isAdminOrHccDesk,
  isLimpiezaRole,
  type Flight,
  type User,
  type HitosData,
  type PernocteRowState,
  type RouteAfectacionEntry,
  type DiferidoEntry,
} from "./types";
import { formatDelayLine, formatMvtSseeSummary, formatMinutesToHHMM, parseTimeToMinutes } from "./lib/mvtTime";
import { ScheduleParser } from "./components/ScheduleParser";
import { FlightModal } from "./components/FlightModal";
import { OperationsMenu } from "./components/OperationsMenu";
import { isFlightIncompleteAndLate } from "./lib/dateHelpers";
import {
  getAirlinePrefix,
  coerceFlightFromDb,
  getHitosDepartureTime,
  isMvtCompleteForCard,
  isHitosCompleteForCard,
  canDownloadHitosSummaryRole,
  hasHitosDataForSummaryExport,
  flightNeedsCleaningWarning,
} from "./lib/flightHelpers";
import { FLEET_DATA, getAircraftInfo } from "./lib/fleetData";
import { WeatherIndicator } from "./components/WeatherIndicator";
import { PlaneTakeoff, AlertCircle, CheckCircle2, ClipboardPaste, MessageSquareText, CalendarDays, Search, Users, LogOut, Loader2, Download, Ban, FileBarChart2, CirclePlus, CalendarClock, Moon, Route, Table2, FileWarning, RotateCcw, Settings } from "lucide-react";
import { BroomIcon } from "./components/BroomIcon";
import { downloadHitosSummary } from "./lib/downloadHitosSummary";
import { auth, db } from "./lib/firebase";
import { ref, onValue, set, get, push, remove } from "firebase/database";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Login } from "./components/Login";
import { UserManagement } from "./components/UserManagement";
import { ControlView } from "./components/ControlView";
import { CancelFlightModal } from "./components/CancelFlightModal";
import { DailyReportView } from "./components/DailyReportView";
import { ManualFlightModal } from "./components/ManualFlightModal";
import { RescheduleFlightModal } from "./components/RescheduleFlightModal";
import { PernocteView } from "./components/PernocteView";
import { DiferidosView } from "./components/DiferidosView";
import {
  computePernocteRows,
  coercePernocteRow,
  flightVisibleToLimpiezaBoard,
  isLimpiezaPendiente,
} from "./lib/pernocteHelpers";
import { GanttCalculatorView } from "./components/GanttCalculatorView";
import { normalizeMvtData, normalizeHitosData } from "./lib/flightDataNormalize";
import { RouteChangeModal } from "./components/RouteChangeModal";
import { GestionesModal } from "./components/GestionesModal";
import { flightDateToIso } from "./lib/controlHelpers";
import { coerceRouteAfectacion, normalizeAirportCode } from "./lib/routeAfectaciones";
import { forFirebaseDb } from "./lib/forFirebaseDb";
import {
    findFlightForGestiones,
    applyGestionesRowToFlight,
    type ParseGestionesResult,
} from "./lib/gestionesTableParse";
import { coerceDiferido, getDiferidoTextForReg, normalizeRegDiferido } from "./lib/diferidosHelpers";

function App() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [mainTab, setMainTab] = useState<"tablero" | "control" | "reporte" | "pernocte" | "diferidos">("tablero");
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [cancelModalFlight, setCancelModalFlight] = useState<Flight | null>(null);
  const [rescheduleModalFlight, setRescheduleModalFlight] = useState<Flight | null>(null);
  /** Menú ⋯ en tarjeta de vuelo (reprogramar / cancelar) */
  const [openFlightActionsMenuId, setOpenFlightActionsMenuId] = useState<string | null>(null);
  const [routeModalFlight, setRouteModalFlight] = useState<Flight | null>(null);
  const [routeAfectaciones, setRouteAfectaciones] = useState<RouteAfectacionEntry[]>([]);
  /** Matrícula → texto (Firebase: diferidos/{matrícula}) */
  const [diferidosMap, setDiferidosMap] = useState<Record<string, DiferidoEntry>>({});
  const [showParser, setShowParser] = useState(false);
  const [showGestiones, setShowGestiones] = useState(false);
  const [showManualFlight, setShowManualFlight] = useState(false);
  const [showOpsMenu, setShowOpsMenu] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  /** pernocte[YYYY-MM-DD][matrícula] */
  const [pernocteData, setPernocteData] = useState<Record<string, Record<string, PernocteRowState>>>({});
  /** Fecha vista en Pernocte (vacío = misma que el selector del header) */
  const [pernocteFilterDate, setPernocteFilterDate] = useState("");
  const pernocteDateEffective = pernocteFilterDate || selectedDate;

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showUserManagement, setShowUserManagement] = useState(false);
  /** Calculadora Gantt pública (sin sesión) */
  const [publicGanttOpen, setPublicGanttOpen] = useState(false);
  /** Aviso tras enviar MVT correctamente */
  const [mvtSentToast, setMvtSentToast] = useState<{ open: boolean; subtitle?: string }>({ open: false });
  /** Aviso tras guardar Hitos validados */
  const [hitosSavedToast, setHitosSavedToast] = useState<{ open: boolean; subtitle?: string }>({ open: false });

  const userRole = normalizeUserRole(currentUser?.role);

  useEffect(() => {
    if (!mvtSentToast.open) return;
    const t = window.setTimeout(() => setMvtSentToast({ open: false }), 4500);
    return () => window.clearTimeout(t);
  }, [mvtSentToast.open]);

  useEffect(() => {
    if (!hitosSavedToast.open) return;
    const t = window.setTimeout(() => setHitosSavedToast({ open: false }), 4500);
    return () => window.clearTimeout(t);
  }, [hitosSavedToast.open]);

  useEffect(() => {
    if (!openFlightActionsMenuId) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = document.querySelector(`[data-flight-actions="${openFlightActionsMenuId}"]`);
      if (el && !el.contains(e.target as Node)) {
        setOpenFlightActionsMenuId(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openFlightActionsMenuId]);

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const raw = snapshot.val() as User;
          setCurrentUser({ ...raw, role: normalizeUserRole(raw.role) });
        } else {
          setCurrentUser(null);
          await signOut(auth);
        }
      } else {
        setCurrentUser(null);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // Live Cloud Synchronization via Firebase Realtime DB
  useEffect(() => {
    const flightsRef = ref(db, 'flights');
    const unsubscribe = onValue(flightsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const flightsArray = Array.isArray(data) ? data : Object.values(data);
        const validFlights = (flightsArray.filter(Boolean) as Flight[]).map(coerceFlightFromDb);
        setFlights(validFlights);

        // Assure modal stays linked to the latest realtime database version
        setSelectedFlight((prev) => {
          if (!prev) return null;
          return validFlights.find((f) => f.id === prev.id) || prev;
        });
        setRouteModalFlight((prev) => {
          if (!prev) return null;
          return validFlights.find((f) => f.id === prev.id) || prev;
        });
      } else {
        setFlights([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setRouteAfectaciones([]);
      return;
    }
    const r = ref(db, `routeAfectaciones/${selectedDate}`);
    const unsub = onValue(r, (snapshot) => {
      const v = snapshot.val();
      if (!v || typeof v !== "object") {
        setRouteAfectaciones([]);
        return;
      }
      const list: RouteAfectacionEntry[] = [];
      for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
        list.push(coerceRouteAfectacion(raw, id));
      }
      list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      setRouteAfectaciones(list);
    });
    return () => unsub();
  }, [selectedDate]);

  useEffect(() => {
    const pernocteRef = ref(db, "pernocte");
    const unsub = onValue(pernocteRef, (snapshot) => {
      const v = snapshot.val();
      if (!v || typeof v !== "object") {
        setPernocteData({});
        return;
      }
      const out: Record<string, Record<string, PernocteRowState>> = {};
      for (const [dateKey, regs] of Object.entries(v as Record<string, unknown>)) {
        if (!regs || typeof regs !== "object") continue;
        out[dateKey] = {};
        for (const [regKey, row] of Object.entries(regs as Record<string, unknown>)) {
          out[dateKey][regKey] = coercePernocteRow(row);
        }
      }
      setPernocteData(out);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const dRef = ref(db, "diferidos");
    const unsub = onValue(dRef, (snapshot) => {
      const v = snapshot.val();
      if (!v || typeof v !== "object") {
        setDiferidosMap({});
        return;
      }
      const out: Record<string, DiferidoEntry> = {};
      for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
        out[String(k).trim().toUpperCase()] = coerceDiferido(raw);
      }
      setDiferidosMap(out);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setSelectedDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [selectedDate]);

  // Intervalo para refrescar tarjetas (retrasos / incompletos)
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTimeTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleLoadFlights = (newFlights: Flight[]) => {
    const normalized = newFlights.map(coerceFlightFromDb);
    const updatedFlights = [...flights, ...normalized];
    set(ref(db, 'flights'), forFirebaseDb(updatedFlights));
    setShowParser(false);
  };

  const handleManualFlightAdd = (flight: Flight) => {
    const normalized = coerceFlightFromDb(flight);
    set(ref(db, "flights"), forFirebaseDb([...flights, normalized]));
    setShowManualFlight(false);
    const raw = normalized.date;
    if (raw && raw.includes("-")) {
      const parts = raw.split("-");
      if (parts.length === 3 && parts[2].length === 4) {
        const [d, m, y] = parts;
        setSelectedDate(`${y}-${m}-${d}`);
      }
    }
  };

  const handleSaveMVT = async (id: string, mvtData: Flight["mvtData"]) => {
    const payload = normalizeMvtData(mvtData);
    payload.mvtSentAt = new Date().toISOString();
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, mvtData: payload } : f));
    const f = flights.find((x) => x.id === id);
    const subtitle = f ? `${getAirlinePrefix(f.flt)}${f.flt} · ${f.reg} · ${f.dep}→${f.arr}` : undefined;
    try {
      await set(ref(db, "flights"), forFirebaseDb(updatedFlights));
      setMvtSentToast({ open: true, subtitle });
    } catch {
      alert("No se pudo guardar el MVT. Revisá la conexión e intentá de nuevo.");
    }
  };

  /** Auto-guardado de borrador Hitos: no marca “enviado”; preserva hitosSentAt si la carta no cambió. */
  const handlePersistHitos = (id: string, hitosData: HitosData) => {
    const prev = flights.find((f) => f.id === id)?.hitosData;
    const payload = normalizeHitosData(hitosData);
    if (prev?.hitosSentAt && prev.ganttChartName === payload.ganttChartName) {
      payload.hitosSentAt = prev.hitosSentAt;
    }
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, hitosData: payload } : f));
    set(ref(db, "flights"), forFirebaseDb(updatedFlights));
  };

  /** Guardar Hitos validado desde la pestaña (botón Guardar). */
  const handleSaveHitos = async (id: string, hitosData: HitosData) => {
    const payload = normalizeHitosData(hitosData);
    payload.hitosSentAt = new Date().toISOString();
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, hitosData: payload } : f));
    const f = flights.find((x) => x.id === id);
    const subtitle = f ? `${getAirlinePrefix(f.flt)}${f.flt} · ${f.reg} · ${f.dep}→${f.arr}` : undefined;
    try {
      await set(ref(db, "flights"), forFirebaseDb(updatedFlights));
      setHitosSavedToast({ open: true, subtitle });
    } catch {
      alert("No se pudieron guardar los hitos. Revisá la conexión e intentá de nuevo.");
    }
  };

  const handleSaveCrewHitos = (id: string, hitosCrewData: Record<string, string>) => {
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, hitosCrewData } : f));
    set(ref(db, 'flights'), forFirebaseDb(updatedFlights));
  };

  const handleUpdateDailyReportObs = (id: string, text: string) => {
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, dailyReportObs: text } : f));
    set(ref(db, "flights"), forFirebaseDb(updatedFlights));
  };

  const handleCancelFlight = (id: string, reason: string) => {
    const updatedFlights = flights.map((f) =>
      f.id === id ? { ...f, cancelled: true, cancellationReason: reason } : f
    );
    set(ref(db, "flights"), forFirebaseDb(updatedFlights));
    setCancelModalFlight(null);
    setSelectedFlight((prev) => (prev?.id === id ? updatedFlights.find((x) => x.id === id) ?? null : prev));
  };

  const handleReactivateFlight = (id: string) => {
    if (!window.confirm("¿Reactivar este vuelo? Dejará de figurar como cancelado.")) return;
    const updatedFlights = flights.map((f) =>
      f.id === id ? { ...f, cancelled: false, cancellationReason: "" } : f
    );
    set(ref(db, "flights"), forFirebaseDb(updatedFlights));
    setSelectedFlight((prev) => (prev?.id === id ? updatedFlights.find((x) => x.id === id) ?? null : prev));
  };

  const handleRescheduleFlight = (id: string, newEtd: string, reason: string) => {
    const updatedFlights = flights.map((f) => {
      if (f.id !== id) return f;
      return {
        ...f,
        etd: newEtd,
        rescheduleReason: reason,
      };
    });
    set(ref(db, "flights"), forFirebaseDb(updatedFlights));
    setRescheduleModalFlight(null);
    setSelectedFlight((prev) => (prev?.id === id ? updatedFlights.find((x) => x.id === id) ?? null : prev));
  };

  const handleUpdateRegistration = (id: string, newReg: string) => {
    const flight = flights.find(f => f.id === id);
    if (!flight) return;

    const info = getAircraftInfo(newReg);
    if (info) {
      const paxStr = flight.mvtData?.paxActual || flight.pax;
      const paxNum = parseInt(paxStr, 10) || 0;

      if (paxNum > info.capacity) {
        alert(`¡Atención! Cambio a equipo de menor capacidad (${info.model} / MAP ${info.capacity} pax). \n\nSe generará SOBREVENTA con ${paxNum} pasajeros activos.`);
      }
    }

    const updatedFlights = flights.map(f => f.id === id ? { ...f, reg: newReg } : f);
    set(ref(db, 'flights'), forFirebaseDb(updatedFlights));
  };

  const handleRouteChangeConfirm = async (newDep: string, newArr: string) => {
    if (!routeModalFlight) return;
    const id = routeModalFlight.id;
    const flight = flights.find((f) => f.id === id) ?? routeModalFlight;
    const depAntes = normalizeAirportCode(flight.dep);
    const arrAntes = normalizeAirportCode(flight.arr);
    const depDespues = normalizeAirportCode(newDep);
    const arrDespues = normalizeAirportCode(newArr);
    const dateKey = flightDateToIso(flight);
    if (!dateKey) {
      throw new Error("No se pudo determinar la fecha del vuelo para registrar la afectación.");
    }
    const byName = currentUser?.name?.trim() || currentUser?.email || "—";
    const updatedFlights = flights.map((f) =>
      f.id === id ? { ...f, dep: depDespues, arr: arrDespues, route: `${depDespues}-${arrDespues}` } : f
    );
    const logRef = push(ref(db, `routeAfectaciones/${dateKey}`));
    try {
      await set(ref(db, "flights"), forFirebaseDb(updatedFlights));
      await set(logRef, {
        flightId: id,
        flt: String(flight.flt ?? ""),
        reg: String(flight.reg ?? ""),
        depAntes,
        arrAntes,
        depDespues,
        arrDespues,
        at: new Date().toISOString(),
        by: byName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        msg.includes("permission") || msg.includes("PERMISSION_DENIED")
          ? "Sin permiso para guardar en Firebase. Revisá las reglas de la base (flights y routeAfectaciones)."
          : `No se pudo guardar: ${msg}`
      );
    }
    setRouteModalFlight(null);
    setSelectedFlight((prev) => (prev?.id === id ? updatedFlights.find((x) => x.id === id) ?? null : prev));
  };

  const handleGestionesApply = async (
    parsed: ParseGestionesResult,
    opts: { syncStdSta: boolean; defaultRescheduleReason: string }
  ) => {
    let next = [...flights];
    for (const row of parsed.rows) {
      const f = findFlightForGestiones(next, row);
      if (!f) continue;
      const i = next.findIndex((x) => x.id === f.id);
      if (i === -1) continue;
      next[i] = applyGestionesRowToFlight(next[i], row, {
        syncStdSta: opts.syncStdSta,
        defaultRescheduleReason: opts.defaultRescheduleReason,
      });
    }
    try {
      await set(ref(db, "flights"), forFirebaseDb(next));
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveDiferido = async (regRaw: string, text: string) => {
    const reg = normalizeRegDiferido(regRaw);
    const t = text.trim();
    if (!reg || !t) return;
    try {
      await set(
        ref(db, `diferidos/${reg}`),
        forFirebaseDb({
          text: t,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.name?.trim() || currentUser?.email || "",
        })
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveDiferido = async (regRaw: string) => {
    const reg = normalizeRegDiferido(regRaw);
    if (!reg) return;
    try {
      await remove(ref(db, `diferidos/${reg}`));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const flightsForSelectedDate = flights.filter((f) => {
    const dateRaw = String(f.date ?? "");
    let flightIso = dateRaw;
    if (dateRaw && dateRaw.includes("-")) {
      const [d, m, y] = dateRaw.split("-");
      if (y && y.length === 4) {
        flightIso = `${y}-${m}-${d}`;
      }
    }
    return selectedDate ? flightIso === selectedDate : true;
  });

  /** Tablero: fecha + buscador de tarjetas (independiente del buscador del modal MVT) */
  const filteredFlights = flightsForSelectedDate.filter((f) => {
    const sq = searchQuery.toUpperCase();
    if (!sq) return true;
    const fltU = String(f.flt ?? "").toUpperCase();
    const depU = String(f.dep ?? "").toUpperCase();
    const arrU = String(f.arr ?? "").toUpperCase();
    return fltU.includes(sq) || depU.includes(sq) || arrU.includes(sq);
  });

  /** Rol Limpieza: solo vuelos con bloque largo (&gt;3:30) o último JES del día (pernocte). */
  const boardFlights = useMemo(() => {
    if (!isLimpiezaRole(userRole)) return filteredFlights;
    const iso = selectedDate?.trim();
    if (!iso) return filteredFlights;
    return filteredFlights.filter((f) => flightVisibleToLimpiezaBoard(f, flightsForSelectedDate, iso));
  }, [userRole, filteredFlights, flightsForSelectedDate, selectedDate]);

  const pernocteRows = useMemo(
    () => (pernocteDateEffective ? computePernocteRows(flights, pernocteDateEffective) : []),
    [flights, pernocteDateEffective]
  );

  const handlePernoctePatch = (reg: string, patch: Partial<PernocteRowState>) => {
    if (!pernocteDateEffective) return;
    const prev = coercePernocteRow(pernocteData[pernocteDateEffective]?.[reg]);
    const next: PernocteRowState = { ...prev, ...patch };
    if (patch.precargaQ !== undefined) {
      next.precargaQ = String(patch.precargaQ).replace(/\D/g, "");
    }
    set(ref(db, `pernocte/${pernocteDateEffective}/${reg}`), next);
  };

  if (loadingAuth) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-12 h-12 text-cyan-400 animate-spin" /></div>;
  }

  if (!currentUser) {
    if (publicGanttOpen) {
      return <GanttCalculatorView onBack={() => setPublicGanttOpen(false)} />;
    }
    return <Login onLoginSuccess={setCurrentUser} onOpenGantt={() => setPublicGanttOpen(true)} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      <header className="bg-slate-900 border-b border-slate-800 text-white py-3 px-4 md:px-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40 w-full mb-6 max-w-full min-w-0">
        <div className="flex items-center justify-between w-full md:w-auto gap-3">
          <div className="flex items-center gap-3">
            <PlaneTakeoff className="w-8 h-8 text-cyan-400 shrink-0" />
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-white truncate">
              SMARTOPS
              <span className="text-cyan-400 font-bold hidden sm:inline border-l-2 border-slate-700 pl-3">
                Management
              </span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 w-full md:w-auto">
          {/* Search Bar */}
          {mainTab === "tablero" && (
          <div className="flex flex-1 md:flex-initial min-w-[140px] items-center gap-2 bg-slate-800 px-3 py-2 rounded-full border border-slate-700 shadow-inner">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar vuelo, AEP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none placeholder:text-slate-500 w-full md:w-32 focus:w-full md:focus:w-48 transition-all min-w-0"
            />
          </div>
          )}

          {/* Date Picker — sin overflow-hidden en el header: recorta el popup nativo del type="date". Label: clic en el ícono enfoca el input. */}
          <label className="relative z-[60] flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-2 shadow-inner min-h-[2.5rem]">
            <CalendarDays className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
            <input
              id="header-flight-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="min-w-[10.5rem] cursor-pointer bg-transparent py-1 text-sm font-bold uppercase tracking-wider text-white [color-scheme:light] focus:outline-none md:min-w-[11rem]"
            />
          </label>

          <div className="flex gap-2 w-full md:w-auto justify-center mt-1 md:mt-0 items-center">
            {/* User Details */}
            <div className="flex shrink-0 items-center gap-3 bg-slate-800 px-4 py-2 rounded-full border border-slate-700 shadow-inner md:ml-2">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-white uppercase leading-none">{currentUser.name.split(' ')[0]}</span>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{userRole}</span>
              </div>
              <div className="h-6 w-px bg-slate-700"></div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors" title="Cerrar Sessión">
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {(userRole === "ADMIN" || userRole === "AJS") && (
              <button
                onClick={() => setShowUserManagement(true)}
                className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 px-3 py-2 rounded-full font-bold shadow-sm transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
              >
                <Users className="w-4 h-4" />
                <span className="hidden md:inline">Usuarios</span>
              </button>
            )}

            {userRole !== "LIMPIEZA" && (
            <button
              onClick={() => setShowOpsMenu(true)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-5 py-2 rounded-full font-bold shadow-sm transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
              title="MVT"
            >
              <MessageSquareText className="w-4 h-4 text-cyan-400" />
              <span>MVT</span>
            </button>
            )}

            {isAdminOrHccDesk(userRole) && (
              <button
                type="button"
                onClick={() => setShowGestiones(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/40 px-5 py-2 rounded-full font-black shadow-md transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
                title="Pegar tabla de gestiones (matrículas, ETD/ETA, etc.)"
              >
                <Table2 className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Gestiones</span>
                <span className="sm:hidden">Gest.</span>
              </button>
            )}
            {isAdminOrHccDesk(userRole) && (
              <button
                onClick={() => setShowParser(true)}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 border border-transparent px-5 py-2 rounded-full font-black shadow-md transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Cargar</span>
              </button>
            )}
            {isHccDeskRole(userRole) && (
              <button
                type="button"
                onClick={() => setShowManualFlight(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/40 px-5 py-2 rounded-full font-black shadow-md transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
                title="Cargar un vuelo completando los datos a mano"
              >
                <CirclePlus className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Alta manual</span>
                <span className="sm:hidden">Manual</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {isHccDeskRole(userRole) && (
          <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-4">
            <button
              type="button"
              onClick={() => setMainTab("tablero")}
              className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                mainTab === "tablero"
                  ? "bg-cyan-500 text-slate-900 shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Vuelos
            </button>
            <button
              type="button"
              onClick={() => setMainTab("control")}
              className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                mainTab === "control"
                  ? "bg-cyan-500 text-slate-900 shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tablero Control
            </button>
            <button
              type="button"
              onClick={() => setMainTab("reporte")}
              className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 ${
                mainTab === "reporte"
                  ? "bg-cyan-500 text-slate-900 shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FileBarChart2 className="w-4 h-4 shrink-0" />
              Reporte Diario
            </button>
            <button
              type="button"
              onClick={() => setMainTab("pernocte")}
              className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 ${
                mainTab === "pernocte"
                  ? "bg-cyan-500 text-slate-900 shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Moon className="w-4 h-4 shrink-0" />
              Pernocte
            </button>
            {isHccDeskRole(userRole) && (
              <button
                type="button"
                onClick={() => setMainTab("diferidos")}
                className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all flex items-center gap-2 ${
                  mainTab === "diferidos"
                    ? "bg-amber-500 text-slate-900 shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <FileWarning className="w-4 h-4 shrink-0" />
                Diferidos
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-secondary flex items-center gap-3">
            {mainTab === "diferidos" && isHccDeskRole(userRole) ? (
              <>Diferidos</>
            ) : mainTab === "control" && isHccDeskRole(userRole) ? (
              <>Control operacional</>
            ) : mainTab === "reporte" && isHccDeskRole(userRole) ? (
              <>Reporte Diario</>
            ) : mainTab === "pernocte" && isHccDeskRole(userRole) ? (
              <>Pernocte</>
            ) : (
              <>
                Vuelos
                <span className="text-sm font-bold text-secondary-foreground bg-primary px-3 py-1 rounded-full shadow-sm">
                  {boardFlights.length}
                </span>
              </>
            )}
          </h2>
        </div>

        {mainTab === "diferidos" && isHccDeskRole(userRole) ? (
          <DiferidosView diferidos={diferidosMap} onSave={handleSaveDiferido} onRemove={handleRemoveDiferido} />
        ) : mainTab === "control" && isHccDeskRole(userRole) ? (
          <ControlView flights={flights} selectedDate={selectedDate} routeAfectaciones={routeAfectaciones} />
        ) : mainTab === "reporte" && isHccDeskRole(userRole) ? (
          <DailyReportView
            flights={flights}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onUpdateDailyReportObs={handleUpdateDailyReportObs}
            canEditObs={isHccDeskRole(userRole)}
            reportUserName={currentUser?.name ?? ""}
            routeAfectaciones={routeAfectaciones}
          />
        ) : mainTab === "pernocte" && isHccDeskRole(userRole) ? (
          <PernocteView
            filterDate={pernocteDateEffective}
            headerDate={selectedDate}
            filterFollowsHeader={!pernocteFilterDate}
            onFilterDateChange={setPernocteFilterDate}
            onFollowHeaderDate={() => setPernocteFilterDate("")}
            rows={pernocteRows}
            pernocteByReg={pernocteData[pernocteDateEffective] ?? {}}
            onPatchRow={handlePernoctePatch}
          />
        ) : boardFlights.length === 0 ? (
          <div className="bg-card border border-border border-dashed rounded-3xl p-16 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
              <PlaneTakeoff className="w-16 h-16 text-primary/60" />
            </div>
            <p className="text-xl font-bold text-secondary mb-2">
              {flights.length === 0
                ? "No hay vuelos cargados en el sistema."
                : filteredFlights.length === 0 && searchQuery.trim()
                  ? "No hay vuelos que coincidan con la búsqueda."
                  : flightsForSelectedDate.length === 0
                    ? "Para esa fecha no hay vuelos cargados."
                    : isLimpiezaRole(userRole) && filteredFlights.length > 0
                      ? "No hay vuelos de limpieza o pernocte en el filtro actual."
                      : isLimpiezaRole(userRole)
                        ? "No hay vuelos con bloque largo (>3:30 h) ni último sector JES del día para esta fecha."
                        : "Para esa fecha no hay vuelos cargados."}
            </p>
            <p className="text-md max-w-md mx-auto">
              {isLimpiezaRole(userRole)
                ? "Solo se listan vuelos que requieren limpieza por tiempo de bloque o el último JES de cada matrícula (pernocte)."
                : 'Usa el botón "Cargar" en la parte superior para pegar la programación de la jornada.'}
            </p>
            {isAdminOrHccDesk(userRole) && (
            <button
              onClick={() => setShowParser(true)}
              className="mt-8 bg-primary/10 text-primary px-6 py-2 rounded-full font-bold shadow hover:bg-primary/20 transition-colors"
            >
              Empezar ahora
            </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...boardFlights].sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b))).map((flight) => {
              const isCancelled = !!flight.cancelled;
              const hidePaxOnCard = isLimpiezaRole(userRole);
              const showWeatherOnCard = !isLimpiezaRole(userRole);
              const pernocteForDay = selectedDate ? pernocteData[selectedDate] ?? {} : {};
              const limpiezaPendienteCard =
                hidePaxOnCard &&
                !isCancelled &&
                !!selectedDate &&
                isLimpiezaPendiente(flight, selectedDate, flightsForSelectedDate, pernocteForDay);
              const isLate = !isCancelled && isFlightIncompleteAndLate(flight);
              const hasMvt = isMvtCompleteForCard(flight);
              const hasHitos = isHitosCompleteForCard(flight);

              let cardBg = "bg-card border-border hover:border-primary/50";
              let badgeText = "";
              let badgeColor = "";
              let badgeIcon: "ban" | "check" | "alert" | null = null;

              if (isCancelled) {
                cardBg =
                  "bg-slate-100 dark:bg-slate-900/95 border-slate-400 dark:border-slate-600 shadow-slate-900/10 hover:border-slate-500";
                badgeText = "VUELO CANCELADO";
                badgeColor = "bg-slate-700 border-white dark:border-slate-900 text-white";
                badgeIcon = "ban";
              } else if (limpiezaPendienteCard) {
                cardBg =
                  "bg-red-50 dark:bg-[#450a0a] border-red-600 dark:border-red-500 shadow-red-900/25 hover:border-red-500 dark:hover:border-red-400";
                badgeText = "LIMPIEZA PENDIENTE";
                badgeColor = "bg-red-600 border-white dark:border-[#450a0a] text-white";
                badgeIcon = "alert";
              } else if (hasMvt && hasHitos) {
                cardBg = "bg-emerald-50 dark:bg-[#064e3b] border-emerald-400 dark:border-emerald-500 shadow-emerald-900/20";
                badgeText = "MVT ✓ · HITOS ✓";
                badgeColor = "bg-emerald-500 border-white dark:border-[#064e3b] text-white";
                badgeIcon = "check";
              } else if (hasMvt && !hasHitos) {
                cardBg = "bg-yellow-50 dark:bg-[#422006] border-yellow-400 dark:border-yellow-600 shadow-yellow-900/20";
                badgeText = "MVT ✓ · Hitos pendiente";
                badgeColor = "bg-yellow-500 border-white dark:border-[#422006] text-yellow-950 dark:text-yellow-50";
                badgeIcon = "alert";
              } else if (!hasMvt && hasHitos) {
                cardBg = "bg-yellow-50 dark:bg-[#422006] border-yellow-400 dark:border-yellow-600 shadow-yellow-900/20";
                badgeText = "MVT pendiente · Hitos ✓";
                badgeColor = "bg-yellow-500 border-white dark:border-[#422006] text-yellow-950 dark:text-yellow-50";
                badgeIcon = "alert";
              } else {
                if (isLate) {
                  cardBg = "bg-red-50 dark:bg-[#450a0a] border-red-500 dark:border-red-600 shadow-red-900/20";
                  badgeText = "DATOS INCOMPLETOS";
                  badgeColor = "bg-red-600 border-white dark:border-[#450a0a] text-white";
                  badgeIcon = "alert";
                }
              }

              const paxStr = flight.mvtData?.paxActual || flight.pax;
              const paxNum = parseInt(paxStr, 10) || 0;
              const acInfo = getAircraftInfo(flight.reg);
              const paxExcess = acInfo ? paxNum - acInfo.capacity : 0;
              const diferidoTxt = getDiferidoTextForReg(diferidosMap, flight.reg);

              const canRescheduleFlight = isHccDeskRole(userRole) && !isCancelled;
              const canCancelFlight = isAdminOrHccDesk(userRole) && !isCancelled;
              const showFlightActionsMenu = canRescheduleFlight || canCancelFlight;
              const showHitosDownload =
                canDownloadHitosSummaryRole(userRole) &&
                hasMvt &&
                hasHitosDataForSummaryExport(flight) &&
                !isCancelled;

              return (
                <div
                  key={flight.id}
                  onClick={() => setSelectedFlight(flight)}
                  className={`relative border-2 rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-1.5 ${cardBg}`}
                >
                  {(showHitosDownload || showFlightActionsMenu) && (
                    <div
                      className="absolute top-2 right-2 z-20 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showHitosDownload && (
                        <button
                          type="button"
                          title="Descargar informe HTML de hitos (operacionales y tripulación)"
                          aria-label="Descargar informe HTML de hitos operacionales y de tripulación"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadHitosSummary(flight);
                          }}
                          className="inline-flex items-center justify-center rounded-xl border-2 border-emerald-600/40 bg-white/95 p-2 text-emerald-800 shadow-md hover:bg-emerald-50 hover:border-emerald-500 transition-colors"
                        >
                          <Download className="w-4 h-4 shrink-0" aria-hidden />
                        </button>
                      )}
                      {showFlightActionsMenu && (
                        <div className="relative" data-flight-actions={flight.id}>
                          <button
                            type="button"
                            title="Opciones del vuelo"
                            aria-label="Opciones del vuelo"
                            aria-expanded={openFlightActionsMenuId === flight.id}
                            aria-haspopup="menu"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenFlightActionsMenuId((prev) =>
                                prev === flight.id ? null : flight.id
                              );
                            }}
                            className="inline-flex items-center justify-center rounded-xl border-2 border-slate-300/80 bg-white/95 p-2 text-slate-700 shadow-md hover:bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Settings className="w-4 h-4 shrink-0" aria-hidden />
                          </button>
                          {openFlightActionsMenuId === flight.id && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full mt-1 min-w-[13.5rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10 z-30"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canRescheduleFlight && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-amber-900 hover:bg-amber-50 dark:text-amber-100 dark:hover:bg-amber-950/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenFlightActionsMenuId(null);
                                    setRescheduleModalFlight(flight);
                                  }}
                                >
                                  <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                  Reprogramar vuelo
                                </button>
                              )}
                              {canCancelFlight && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenFlightActionsMenuId(null);
                                    setCancelModalFlight(flight);
                                  }}
                                >
                                  <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                  Cancelar vuelo
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-4xl font-black tracking-tighter flex items-baseline gap-1 ${isLate ? "text-red-700 dark:text-red-100" : "text-secondary dark:text-primary"}`}>
                      <span className="text-lg font-bold opacity-70 tracking-normal text-slate-500 dark:text-slate-400">{getAirlinePrefix(flight.flt)}</span>
                      {flight.flt}
                    </span>
                  </div>

                  {!isCancelled && flightNeedsCleaningWarning(flight) ? (
                    <div
                      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/95 dark:bg-amber-950/40 dark:border-amber-600 px-3 py-2.5 text-amber-950 dark:text-amber-100 shadow-sm"
                      role="status"
                    >
                      <BroomIcon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <p className="text-[11px] sm:text-xs font-bold leading-snug">
                        Tiempo de vuelo mayor a 03:30hs, requiere limpieza al arribo.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between font-bold mb-6">
                    <div
                      className="flex flex-col items-start leading-tight relative gap-0.5 min-w-0 max-w-[45%]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">STD</span>
                      {showWeatherOnCard ? (
                        <WeatherIndicator iata={flight.dep} date={flight.date} time={flight.std} align="left" />
                      ) : null}
                      <span className={`text-2xl ${isLate ? "dark:text-white" : ""}`}>{flight.dep}</span>
                      <span className="text-sm font-black text-muted-foreground dark:text-slate-300/70 tabular-nums">{flight.std}</span>
                      {flight.etd?.trim() ? (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed border-amber-300/80 dark:border-amber-700/60 w-full">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">ETD</span>
                          {showWeatherOnCard ? (
                            <WeatherIndicator iata={flight.dep} date={flight.date} time={flight.etd} align="left" />
                          ) : null}
                          <span className="text-sm font-black text-amber-900 dark:text-amber-200 tabular-nums">{flight.etd}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center px-4">
                      <div className={`w-full h-px ${isLate ? "bg-red-300 dark:bg-red-800/50" : "bg-border"}`}></div>
                    </div>
                    <div
                      className="flex flex-col items-end leading-tight relative min-w-0 max-w-[45%]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showWeatherOnCard ? (
                        <WeatherIndicator iata={flight.arr} date={flight.date} time={flight.sta} align="right" />
                      ) : null}
                      <span className={`text-2xl ${isLate ? "dark:text-white" : ""}`}>{flight.arr}</span>
                      <span className="text-sm font-black text-muted-foreground dark:text-slate-300/70">{flight.sta}</span>
                    </div>
                  </div>

                  {isAdminOrHccDesk(userRole) && !isCancelled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRouteModalFlight(flight);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-cyan-950 dark:text-cyan-100 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-300 dark:border-cyan-700 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors"
                    >
                      <Route className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      Cambio ruta
                    </button>
                  )}

                  <div className="flex flex-col gap-2 mt-auto min-h-[72px] text-sm bg-black/5 dark:bg-black/30 rounded-xl p-3 border border-black/5 dark:border-white/10">
                    <div className="flex justify-between items-end w-full gap-2">
                      <div className="flex flex-col min-w-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Equipamiento</span>
                        <div className="flex items-center flex-wrap gap-2">
                          <select
                            value={flight.reg}
                            disabled={!isAdminOrHccDesk(userRole)}
                            onChange={(e) => handleUpdateRegistration(flight.id, e.target.value)}
                            className={`font-black bg-transparent border-b-2 border-dashed border-slate-300 dark:border-slate-700 pb-0.5 focus:outline-none text-sm transition-colors ${isAdminOrHccDesk(userRole) ? "cursor-pointer hover:border-primary focus:border-primary text-slate-800 dark:text-slate-100 hover:text-primary" : "appearance-none cursor-default border-none text-slate-600 dark:text-slate-400"}`}
                          >
                            {!acInfo && <option value={flight.reg}>{flight.reg}</option>}
                            {Object.keys(FLEET_DATA).sort().map(r => (
                              <option key={r} value={r} className="text-foreground bg-background">{r}</option>
                            ))}
                          </select>
                          {acInfo && (
                            <span className="text-[10.5px] font-bold px-2 py-0.5 bg-slate-200/80 dark:bg-slate-700/50 rounded text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {acInfo.model}
                            </span>
                          )}
                        </div>
                      </div>

                      {!hidePaxOnCard ? (
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground dark:text-slate-400 mb-1">Pax</span>
                        <span className="font-bold text-lg text-primary dark:text-white flex items-center gap-1.5">
                          {paxStr}
                          {paxExcess > 0 && <span className="text-red-700 dark:text-red-300 font-black text-[11px] bg-red-100 dark:bg-red-950/80 px-2 py-0.5 rounded-md shadow-sm">(+{paxExcess})</span>}
                        </span>
                      </div>
                      ) : null}
                    </div>

                    {diferidoTxt ? (
                      <ul className="mt-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                        <li className="flex items-start gap-1.5 text-[10px] leading-tight text-amber-900/90 dark:text-amber-100/85">
                          <span className="text-amber-600 dark:text-amber-500 shrink-0 select-none" aria-hidden>
                            •
                          </span>
                          <span className="min-w-0">
                            <span className="font-bold text-amber-800 dark:text-amber-400">Diferido: </span>
                            <span className="font-medium line-clamp-2" title={diferidoTxt}>
                              {diferidoTxt}
                            </span>
                          </span>
                        </li>
                      </ul>
                    ) : null}

                    {hasMvt && (
                      <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 w-full space-y-2">
                        <div className={`grid gap-x-2 gap-y-2 w-full ${hidePaxOnCard ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
                          <div className="flex flex-col items-start min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">ATD</span>
                            <span className="font-bold text-primary dark:text-blue-300 tabular-nums">
                              {formatMinutesToHHMM(parseTimeToMinutes(flight.mvtData?.atd))}
                            </span>
                          </div>
                          {!hidePaxOnCard ? (
                          <div className="flex flex-col items-start sm:items-center min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">PAX (MVT)</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                              {flight.mvtData?.paxActual?.trim() || flight.pax || "—"}
                            </span>
                          </div>
                          ) : null}
                          <div className="flex flex-col items-center text-center min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">
                              SSEE
                            </span>
                            <span
                              className="font-bold text-slate-700 dark:text-slate-300 text-xs leading-snug line-clamp-2 break-words max-w-full text-center"
                              title={formatMvtSseeSummary(flight.mvtData?.ssee)}
                            >
                              {formatMvtSseeSummary(flight.mvtData?.ssee)}
                            </span>
                          </div>
                          <div className="flex flex-col items-start sm:items-end min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Bags</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">{flight.mvtData?.totalBags || "0"}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-stretch text-left w-full pt-1 border-t border-black/5 dark:border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Demoras</span>
                          {(() => {
                            const m = flight.mvtData;
                            const lines = [
                              m?.dlyCod1 ? formatDelayLine(m.dlyCod1, m.dlyTime1 || "") : "",
                              m?.dlyCod2 ? formatDelayLine(m.dlyCod2, m.dlyTime2 || "") : "",
                            ].filter(Boolean);
                            if (lines.length === 0) {
                              return (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">- Ninguna -</span>
                              );
                            }
                            return (
                              <div className="flex flex-wrap gap-1 justify-start">
                                {lines.map((line, i) => (
                                  <span
                                    key={i}
                                    className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-1.5 py-0.5 rounded text-[11px] font-bold leading-tight"
                                  >
                                    {line}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isCancelled && flight.rescheduleReason?.trim() && (
                    <p className="mt-2 text-xs text-amber-900/90 dark:text-amber-200/90 line-clamp-4 border-t border-amber-200/80 dark:border-amber-800/80 pt-2 text-left">
                      <span className="font-bold text-amber-800 dark:text-amber-300">
                        Reprogramación{flight.etd?.trim() ? ` · ETD ${flight.etd}` : ""}:{" "}
                      </span>
                      {flight.rescheduleReason}
                    </p>
                  )}
                  {isCancelled && flight.cancellationReason && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-4 border-t border-slate-200 dark:border-slate-600 pt-2 text-left">
                      <span className="font-bold text-slate-500 dark:text-slate-500">Motivo: </span>
                      {flight.cancellationReason}
                    </p>
                  )}
                  {isAdminOrHccDesk(userRole) && isCancelled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReactivateFlight(flight.id);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      Reactivar vuelo
                    </button>
                  )}

                  {/* Disclaimers */}
                  {badgeText && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 border-2 text-[9px] sm:text-[10px] font-black tracking-wide uppercase px-2.5 sm:px-3 py-1 rounded-full shadow flex items-center gap-1.5 max-w-[calc(100%-0.5rem)] text-center ${badgeColor}`}>
                      {badgeIcon === "ban" ? (
                        <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      ) : badgeIcon === "check" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="leading-tight">{badgeText}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {showParser && (
        <ScheduleParser
          onLoadFlights={handleLoadFlights}
          onClose={() => setShowParser(false)}
        />
      )}

      {showManualFlight && isHccDeskRole(userRole) && (
        <ManualFlightModal
          initialDateIso={selectedDate}
          onClose={() => setShowManualFlight(false)}
          onSubmit={handleManualFlightAdd}
        />
      )}

      {showOpsMenu && (
        <OperationsMenu
          flights={flightsForSelectedDate}
          onClose={() => setShowOpsMenu(false)}
        />
      )}

      {cancelModalFlight && (
        <CancelFlightModal
          flight={cancelModalFlight}
          onClose={() => setCancelModalFlight(null)}
          onConfirm={(reason) => handleCancelFlight(cancelModalFlight.id, reason)}
        />
      )}

      {rescheduleModalFlight && (
        <RescheduleFlightModal
          flight={rescheduleModalFlight}
          onClose={() => setRescheduleModalFlight(null)}
          onConfirm={(etd, reason) => handleRescheduleFlight(rescheduleModalFlight.id, etd, reason)}
        />
      )}

      {routeModalFlight && isAdminOrHccDesk(userRole) && (
        <RouteChangeModal
          flight={routeModalFlight}
          onClose={() => setRouteModalFlight(null)}
          onConfirm={handleRouteChangeConfirm}
        />
      )}

      {showGestiones && isAdminOrHccDesk(userRole) && (
        <GestionesModal flights={flights} onClose={() => setShowGestiones(false)} onApply={handleGestionesApply} />
      )}

      {selectedFlight && (
        <FlightModal
          flight={selectedFlight}
          userRole={userRole}
          onClose={() => setSelectedFlight(null)}
          onSaveMVT={(data) => handleSaveMVT(selectedFlight.id, data)}
          onSaveHitos={(data) => handleSaveHitos(selectedFlight.id, data)}
          onPersistHitos={(data) => handlePersistHitos(selectedFlight.id, data)}
          onSaveCrewHitos={(data) => handleSaveCrewHitos(selectedFlight.id, data)}
          onPersistCrewHitos={(data) => handleSaveCrewHitos(selectedFlight.id, data)}
        />
      )}

      {showUserManagement && (userRole === "ADMIN" || userRole === "AJS") && (
        <UserManagement onClose={() => setShowUserManagement(false)} />
      )}

      {mvtSentToast.open ? (
        <div
          className="fixed bottom-6 left-1/2 z-[100] flex max-w-[min(92vw,24rem)] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300"
          role="status"
          aria-live="polite"
        >
          <div className="flex w-full items-start gap-3 rounded-2xl border border-emerald-300/80 bg-white px-4 py-3 shadow-xl ring-1 ring-emerald-500/15 dark:border-emerald-700/90 dark:bg-emerald-950 dark:ring-emerald-400/20">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="font-black text-emerald-900 dark:text-emerald-100">MVT enviado</p>
              {mvtSentToast.subtitle ? (
                <p className="mt-0.5 text-sm font-semibold leading-snug text-emerald-800/95 dark:text-emerald-200/95">
                  {mvtSentToast.subtitle}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-emerald-700/85 dark:text-emerald-300/90">Los datos ya quedaron registrados.</p>
            </div>
            <button
              type="button"
              onClick={() => setMvtSentToast({ open: false })}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-emerald-700/80 transition-colors hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-900/60 dark:hover:text-emerald-50"
              aria-label="Cerrar aviso"
            >
              <span className="text-lg font-bold leading-none">×</span>
            </button>
          </div>
        </div>
      ) : null}

      {hitosSavedToast.open ? (
        <div
          className={`fixed left-1/2 z-[100] flex max-w-[min(92vw,24rem)] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300 ${mvtSentToast.open ? "bottom-24" : "bottom-6"}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex w-full items-start gap-3 rounded-2xl border border-indigo-300/80 bg-white px-4 py-3 shadow-xl ring-1 ring-indigo-500/15 dark:border-indigo-700/90 dark:bg-indigo-950 dark:ring-indigo-400/20">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="font-black text-indigo-900 dark:text-indigo-100">Hitos guardados</p>
              {hitosSavedToast.subtitle ? (
                <p className="mt-0.5 text-sm font-semibold leading-snug text-indigo-800/95 dark:text-indigo-200/95">
                  {hitosSavedToast.subtitle}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-indigo-700/85 dark:text-indigo-300/90">Los datos ya quedaron registrados.</p>
            </div>
            <button
              type="button"
              onClick={() => setHitosSavedToast({ open: false })}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-indigo-700/80 transition-colors hover:bg-indigo-100 hover:text-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-900/60 dark:hover:text-indigo-50"
              aria-label="Cerrar aviso"
            >
              <span className="text-lg font-bold leading-none">×</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
