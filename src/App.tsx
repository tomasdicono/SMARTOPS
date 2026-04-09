import { useState, useEffect, useMemo } from "react";
import { normalizeUserRole, type Flight, type User, type HitosData, type PernocteRowState, type RouteAfectacionEntry } from "./types";
import { formatDelayLine, formatMinutesToHHMM, parseTimeToMinutes } from "./lib/mvtTime";
import { ScheduleParser } from "./components/ScheduleParser";
import { FlightModal } from "./components/FlightModal";
import { OperationsMenu } from "./components/OperationsMenu";
import { isFlightIncompleteAndLate } from "./lib/dateHelpers";
import { getAirlinePrefix, coerceFlightFromDb, getHitosDepartureTime } from "./lib/flightHelpers";
import { FLEET_DATA, getAircraftInfo } from "./lib/fleetData";
import { WeatherIndicator } from "./components/WeatherIndicator";
import { PlaneTakeoff, AlertCircle, CheckCircle2, ClipboardPaste, MessageSquareText, CalendarDays, Search, Users, LogOut, Loader2, Download, Ban, FileBarChart2, CirclePlus, CalendarClock, Moon, Route } from "lucide-react";
import { downloadHitosSummary } from "./lib/downloadHitosSummary";
import { auth, db } from "./lib/firebase";
import { ref, onValue, set, get, push } from "firebase/database";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Login } from "./components/Login";
import { UserManagement } from "./components/UserManagement";
import { ControlView } from "./components/ControlView";
import { CancelFlightModal } from "./components/CancelFlightModal";
import { DailyReportView } from "./components/DailyReportView";
import { ManualFlightModal } from "./components/ManualFlightModal";
import { RescheduleFlightModal } from "./components/RescheduleFlightModal";
import { PernocteView } from "./components/PernocteView";
import { computePernocteRows, coercePernocteRow } from "./lib/pernocteHelpers";
import { GanttCalculatorView } from "./components/GanttCalculatorView";
import { normalizeMvtData } from "./lib/flightDataNormalize";
import { RouteChangeModal } from "./components/RouteChangeModal";
import { flightDateToIso } from "./lib/controlHelpers";
import { coerceRouteAfectacion, normalizeAirportCode } from "./lib/routeAfectaciones";
import { forFirebaseDb } from "./lib/forFirebaseDb";

function App() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [mainTab, setMainTab] = useState<"tablero" | "control" | "reporte" | "pernocte">("tablero");
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [cancelModalFlight, setCancelModalFlight] = useState<Flight | null>(null);
  const [rescheduleModalFlight, setRescheduleModalFlight] = useState<Flight | null>(null);
  const [routeModalFlight, setRouteModalFlight] = useState<Flight | null>(null);
  const [routeAfectaciones, setRouteAfectaciones] = useState<RouteAfectacionEntry[]>([]);
  const [showParser, setShowParser] = useState(false);
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

  const userRole = normalizeUserRole(currentUser?.role);

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

  const handleSaveMVT = (id: string, mvtData: Flight["mvtData"]) => {
    const payload = normalizeMvtData(mvtData);
    payload.mvtSentAt = new Date().toISOString();
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, mvtData: payload } : f));
    set(ref(db, 'flights'), forFirebaseDb(updatedFlights));
  };

  const handleSaveHitos = (id: string, hitosData: HitosData) => {
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, hitosData } : f));
    set(ref(db, 'flights'), forFirebaseDb(updatedFlights));
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
      <header className="bg-slate-900 border-b border-slate-800 text-white py-3 px-4 md:px-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40 w-full mb-6 max-w-full overflow-hidden">
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

          {/* Date Picker */}
          <div className="flex shrink-0 items-center gap-2 bg-slate-800 px-3 py-2 rounded-full border border-slate-700 shadow-inner">
            <CalendarDays className="w-4 h-4 text-cyan-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer [color-scheme:light] uppercase tracking-wider w-[120px] md:w-auto"
            />
          </div>

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

            <button
              onClick={() => setShowOpsMenu(true)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-5 py-2 rounded-full font-bold shadow-sm transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
              title="MVT"
            >
              <MessageSquareText className="w-4 h-4 text-cyan-400" />
              <span>MVT</span>
            </button>

            {(userRole === "ADMIN" || userRole === "HCC") && (
              <button
                onClick={() => setShowParser(true)}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 border border-transparent px-5 py-2 rounded-full font-black shadow-md transition-all flex items-center gap-2 text-sm uppercase tracking-wide flex-1 md:flex-none justify-center"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Cargar</span>
              </button>
            )}
            {userRole === "HCC" && (
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
        {(userRole === "HCC" || userRole === "AJS") && (
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
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-secondary flex items-center gap-3">
            {mainTab === "control" && (userRole === "HCC" || userRole === "AJS") ? (
              <>Control operacional</>
            ) : mainTab === "reporte" && (userRole === "HCC" || userRole === "AJS") ? (
              <>Reporte Diario</>
            ) : mainTab === "pernocte" && (userRole === "HCC" || userRole === "AJS") ? (
              <>Pernocte</>
            ) : (
              <>
                Vuelos
                <span className="text-sm font-bold text-secondary-foreground bg-primary px-3 py-1 rounded-full shadow-sm">
                  {filteredFlights.length}
                </span>
              </>
            )}
          </h2>
        </div>

        {mainTab === "control" && (userRole === "HCC" || userRole === "AJS") ? (
          <ControlView flights={flights} selectedDate={selectedDate} routeAfectaciones={routeAfectaciones} />
        ) : mainTab === "reporte" && (userRole === "HCC" || userRole === "AJS") ? (
          <DailyReportView
            flights={flights}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onUpdateDailyReportObs={handleUpdateDailyReportObs}
            canEditObs={userRole === "HCC" || userRole === "AJS"}
            reportUserName={currentUser?.name ?? ""}
          />
        ) : mainTab === "pernocte" && (userRole === "HCC" || userRole === "AJS") ? (
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
        ) : filteredFlights.length === 0 ? (
          <div className="bg-card border border-border border-dashed rounded-3xl p-16 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
              <PlaneTakeoff className="w-16 h-16 text-primary/60" />
            </div>
            <p className="text-xl font-bold text-secondary mb-2">
              {flights.length === 0 ? "No hay vuelos cargados en el sistema." : "Para esa fecha no hay vuelos cargados."}
            </p>
            <p className="text-md max-w-md mx-auto">
              Usa el botón "Cargar" en la parte superior para pegar la programación de la jornada.
            </p>
            {(userRole === "ADMIN" || userRole === "HCC") && (
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
            {[...filteredFlights].sort((a, b) => getHitosDepartureTime(a).localeCompare(getHitosDepartureTime(b))).map((flight) => {
              const isCancelled = !!flight.cancelled;
              const isLate = !isCancelled && isFlightIncompleteAndLate(flight);
              const hasMvt = !!flight.mvtData?.atd;
              const hasHitos = !!flight.hitosData?.ganttChartName;

              let cardBg = "bg-card border-border hover:border-primary/50";
              let badgeText = "";
              let badgeColor = "";

              if (isCancelled) {
                cardBg =
                  "bg-slate-100 dark:bg-slate-900/95 border-slate-400 dark:border-slate-600 shadow-slate-900/10 hover:border-slate-500";
                badgeText = "VUELO CANCELADO";
                badgeColor = "bg-slate-700 border-white dark:border-slate-900 text-white";
              } else if (hasMvt && hasHitos) {
                cardBg = "bg-emerald-50 dark:bg-[#064e3b] border-emerald-400 dark:border-emerald-500 shadow-emerald-900/20";
                badgeText = "MVT COMPLETADO";
                badgeColor = "bg-emerald-500 border-white dark:border-[#064e3b] text-white";
              } else if (hasMvt && !hasHitos) {
                cardBg = "bg-yellow-50 dark:bg-[#422006] border-yellow-400 dark:border-yellow-600 shadow-yellow-900/20";
                badgeText = "PENDIENTE HITOS";
                badgeColor = "bg-yellow-500 border-white dark:border-[#422006] text-yellow-950 dark:text-yellow-50";
              } else if (!hasMvt && hasHitos) {
                cardBg = "bg-yellow-50 dark:bg-[#422006] border-yellow-400 dark:border-yellow-600 shadow-yellow-900/20";
                badgeText = "PENDIENTE MVT";
                badgeColor = "bg-yellow-500 border-white dark:border-[#422006] text-yellow-950 dark:text-yellow-50";
              } else {
                if (isLate) {
                  cardBg = "bg-red-50 dark:bg-[#450a0a] border-red-500 dark:border-red-600 shadow-red-900/20";
                  badgeText = "DATOS INCOMPLETOS";
                  badgeColor = "bg-red-600 border-white dark:border-[#450a0a] text-white";
                }
              }

              const paxStr = flight.mvtData?.paxActual || flight.pax;
              const paxNum = parseInt(paxStr, 10) || 0;
              const acInfo = getAircraftInfo(flight.reg);
              const paxExcess = acInfo ? paxNum - acInfo.capacity : 0;

              return (
                <div
                  key={flight.id}
                  onClick={() => setSelectedFlight(flight)}
                  className={`relative border-2 rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-1.5 ${cardBg}`}
                >
                  {userRole === "AJS" && hasMvt && hasHitos && !isCancelled && (
                    <button
                      type="button"
                      title="Descargar informe HTML de hitos (operacionales y tripulación)"
                      aria-label="Descargar informe HTML de hitos operacionales y de tripulación"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadHitosSummary(flight);
                      }}
                      className="absolute top-2 right-2 z-20 inline-flex items-center justify-center rounded-xl border-2 border-emerald-600/40 bg-white/95 p-2 text-emerald-800 shadow-md hover:bg-emerald-50 hover:border-emerald-500 transition-colors"
                    >
                      <Download className="w-4 h-4 shrink-0" aria-hidden />
                    </button>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-4xl font-black tracking-tighter flex items-baseline gap-1 ${isLate ? "text-red-700 dark:text-red-100" : "text-secondary dark:text-primary"}`}>
                      <span className="text-lg font-bold opacity-70 tracking-normal text-slate-500 dark:text-slate-400">{getAirlinePrefix(flight.flt)}</span>
                      {flight.flt}
                    </span>
                  </div>

                  <div className="flex items-center justify-between font-bold mb-6">
                    <div
                      className="flex flex-col items-start leading-tight relative gap-0.5 min-w-0 max-w-[45%]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">STD</span>
                      <WeatherIndicator iata={flight.dep} date={flight.date} time={flight.std} align="left" />
                      <span className={`text-2xl ${isLate ? "dark:text-white" : ""}`}>{flight.dep}</span>
                      <span className="text-sm font-black text-muted-foreground dark:text-slate-300/70 tabular-nums">{flight.std}</span>
                      {flight.etd?.trim() ? (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed border-amber-300/80 dark:border-amber-700/60 w-full">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">ETD</span>
                          <WeatherIndicator iata={flight.dep} date={flight.date} time={flight.etd} align="left" />
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
                      <WeatherIndicator iata={flight.arr} date={flight.date} time={flight.sta} align="right" />
                      <span className={`text-2xl ${isLate ? "dark:text-white" : ""}`}>{flight.arr}</span>
                      <span className="text-sm font-black text-muted-foreground dark:text-slate-300/70">{flight.sta}</span>
                    </div>
                  </div>

                  {(userRole === "ADMIN" || userRole === "HCC") && !isCancelled && (
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
                            disabled={userRole !== "ADMIN" && userRole !== "HCC"}
                            onChange={(e) => handleUpdateRegistration(flight.id, e.target.value)}
                            className={`font-black bg-transparent border-b-2 border-dashed border-slate-300 dark:border-slate-700 pb-0.5 focus:outline-none text-sm transition-colors ${(userRole === "ADMIN" || userRole === "HCC") ? "cursor-pointer hover:border-primary focus:border-primary text-slate-800 dark:text-slate-100 hover:text-primary" : "appearance-none cursor-default border-none text-slate-600 dark:text-slate-400"}`}
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

                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground dark:text-slate-400 mb-1">Pax</span>
                        <span className="font-bold text-lg text-primary dark:text-white flex items-center gap-1.5">
                          {paxStr}
                          {paxExcess > 0 && <span className="text-red-700 dark:text-red-300 font-black text-[11px] bg-red-100 dark:bg-red-950/80 px-2 py-0.5 rounded-md shadow-sm">(+{paxExcess})</span>}
                        </span>
                      </div>
                    </div>

                    {hasMvt && (
                      <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 flex justify-between items-center w-full">
                         <div className="flex flex-col items-start">
                           <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">ATD</span>
                           <span className="font-bold text-primary dark:text-blue-300 tabular-nums">
                             {formatMinutesToHHMM(parseTimeToMinutes(flight.mvtData?.atd))}
                           </span>
                         </div>
                         <div className="flex flex-col items-center">
                           <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Bags</span>
                           <span className="font-bold text-slate-700 dark:text-slate-300">{flight.mvtData?.totalBags || "0"}</span>
                         </div>
                         <div className="flex flex-col items-end text-right max-w-[min(100%,11rem)]">
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
                               <div className="flex flex-col gap-0.5 items-end">
                                 {lines.map((line, i) => (
                                   <span
                                     key={i}
                                     className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-1.5 py-0.5 rounded text-[11px] font-bold leading-tight whitespace-nowrap"
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

                  {(userRole === "HCC" || userRole === "AJS") && !isCancelled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRescheduleModalFlight(flight);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                    >
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      Reprogramar vuelo
                    </button>
                  )}
                  {(userRole === "ADMIN" || userRole === "HCC" || userRole === "AJS") && !isCancelled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCancelModalFlight(flight);
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      Cancelar vuelo
                    </button>
                  )}
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

                  {/* Disclaimers */}
                  {badgeText && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 border-2 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full shadow flex items-center gap-1.5 whitespace-nowrap ${badgeColor}`}>
                      {badgeText === "VUELO CANCELADO" ? (
                        <Ban className="w-3.5 h-3.5" />
                      ) : badgeText === "MVT COMPLETADO" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" />
                      )}
                      {badgeText}
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

      {showManualFlight && userRole === "HCC" && (
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

      {routeModalFlight && (userRole === "ADMIN" || userRole === "HCC") && (
        <RouteChangeModal
          flight={routeModalFlight}
          onClose={() => setRouteModalFlight(null)}
          onConfirm={handleRouteChangeConfirm}
        />
      )}

      {selectedFlight && (
        <FlightModal
          flight={selectedFlight}
          userRole={userRole}
          onClose={() => setSelectedFlight(null)}
          onSaveMVT={(data) => handleSaveMVT(selectedFlight.id, data)}
          onSaveHitos={(data) => handleSaveHitos(selectedFlight.id, data)}
          onPersistHitos={(data) => handleSaveHitos(selectedFlight.id, data)}
          onSaveCrewHitos={(data) => handleSaveCrewHitos(selectedFlight.id, data)}
          onPersistCrewHitos={(data) => handleSaveCrewHitos(selectedFlight.id, data)}
        />
      )}

      {showUserManagement && (userRole === "ADMIN" || userRole === "AJS") && (
        <UserManagement onClose={() => setShowUserManagement(false)} />
      )}
    </div>
  );
}

export default App;
