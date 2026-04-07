import { useState, useEffect } from "react";
import type { Flight, User } from "./types";
import { ScheduleParser } from "./components/ScheduleParser";
import { FlightModal } from "./components/FlightModal";
import { OperationsMenu } from "./components/OperationsMenu";
import { isFlightIncompleteAndLate } from "./lib/dateHelpers";
import { getAirlinePrefix } from "./lib/flightHelpers";
import { FLEET_DATA, getAircraftInfo } from "./lib/fleetData";
import { WeatherIndicator } from "./components/WeatherIndicator";
import { PlaneTakeoff, AlertCircle, CheckCircle2, ClipboardPaste, MessageSquareText, CalendarDays, Search, Users, LogOut, Loader2 } from "lucide-react";
import { auth, db } from "./lib/firebase";
import { ref, onValue, set, get } from "firebase/database";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Login } from "./components/Login";
import { UserManagement } from "./components/UserManagement";
function App() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [showParser, setShowParser] = useState(false);
  const [showOpsMenu, setShowOpsMenu] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showUserManagement, setShowUserManagement] = useState(false);

  const userRole = currentUser?.role || "CREW";

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
          setCurrentUser(snapshot.val() as User);
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
        const validFlights = flightsArray.filter(Boolean) as Flight[];
        setFlights(validFlights);

        // Assure modal stays linked to the latest realtime database version
        setSelectedFlight(prev => {
          if (!prev) return null;
          return validFlights.find(f => f.id === prev.id) || prev;
        });
      } else {
        setFlights([]);
      }
    });

    return () => unsubscribe();
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

  // Also set an interval to refresh the colors every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleLoadFlights = (newFlights: Flight[]) => {
    const updatedFlights = [...flights, ...newFlights];
    set(ref(db, 'flights'), updatedFlights);
    setShowParser(false);
  };

  const handleSaveMVT = (id: string, mvtData: Flight["mvtData"]) => {
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, mvtData } : f));
    set(ref(db, 'flights'), updatedFlights);
  };

  const handleSaveHitos = (id: string, hitosData: any) => {
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, hitosData } : f));
    set(ref(db, 'flights'), updatedFlights);
  };

  const handleSaveCrewHitos = (id: string, hitosCrewData: any) => {
    const updatedFlights = flights.map((f) => (f.id === id ? { ...f, hitosCrewData } : f));
    set(ref(db, 'flights'), updatedFlights);
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
    set(ref(db, 'flights'), updatedFlights);
  };

  const filteredFlights = flights.filter(f => {
    let flightIso = f.date;
    if (f.date && f.date.includes("-")) {
      const [d, m, y] = f.date.split("-");
      if (y && y.length === 4) {
        flightIso = `${y}-${m}-${d}`;
      }
    }

    const matchesDate = selectedDate ? flightIso === selectedDate : true;
    const sq = searchQuery.toUpperCase();
    const matchesSearch = sq
      ? f.flt.includes(sq) || f.dep.includes(sq) || f.arr.includes(sq)
      : true;
    return matchesDate && matchesSearch;
  });

  if (loadingAuth) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-12 h-12 text-cyan-400 animate-spin" /></div>;
  }

  if (!currentUser) {
    return <Login onLoginSuccess={setCurrentUser} />;
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

          {/* Date Picker */}
          <div className="flex shrink-0 items-center gap-2 bg-slate-800 px-3 py-2 rounded-full border border-slate-700 shadow-inner">
            <CalendarDays className="w-4 h-4 text-cyan-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer [color-scheme:dark] uppercase tracking-wider w-[120px] md:w-auto"
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
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-secondary dark:text-gray-100 flex items-center gap-3">
            Tablero de Vuelos
            <span className="text-sm font-bold text-secondary-foreground bg-primary px-3 py-1 rounded-full shadow-sm">
              {filteredFlights.length}
            </span>
          </h2>
        </div>

        {filteredFlights.length === 0 ? (
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
            <button
              onClick={() => setShowParser(true)}
              className="mt-8 bg-primary/10 text-primary px-6 py-2 rounded-full font-bold shadow hover:bg-primary/20 transition-colors"
            >
              Empezar ahora
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...filteredFlights].sort((a, b) => a.std.localeCompare(b.std)).map((flight) => {
              const isLate = isFlightIncompleteAndLate(flight);
              const hasMvt = !!flight.mvtData?.atd;
              const hasHitos = !!flight.hitosData?.ganttChartName;

              let cardBg = "bg-card border-border hover:border-primary/50";
              let badgeText = "";
              let badgeColor = "";

              if (hasMvt && hasHitos) {
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
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-4xl font-black tracking-tighter flex items-baseline gap-1 ${isLate ? "text-red-700 dark:text-red-100" : "text-secondary dark:text-primary"}`}>
                      <span className="text-lg font-bold opacity-70 tracking-normal text-slate-500 dark:text-slate-400">{getAirlinePrefix(flight.flt)}</span>
                      {flight.flt}
                    </span>
                  </div>

                  <div className="flex items-center justify-between font-bold mb-6">
                    <div className="flex flex-col items-start leading-tight relative">
                      <WeatherIndicator iata={flight.dep} date={flight.date} time={flight.std} align="left" />
                      <span className={`text-2xl ${isLate ? "dark:text-white" : ""}`}>{flight.dep}</span>
                      <span className="text-sm font-black text-muted-foreground dark:text-slate-300/70">{flight.std}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center px-4">
                      <div className={`w-full h-px ${isLate ? "bg-red-300 dark:bg-red-800/50" : "bg-border"}`}></div>
                    </div>
                    <div className="flex flex-col items-end leading-tight relative">
                      <WeatherIndicator iata={flight.arr} date={flight.date} time={flight.sta} align="right" />
                      <span className={`text-2xl ${isLate ? "dark:text-white" : ""}`}>{flight.arr}</span>
                      <span className="text-sm font-black text-muted-foreground dark:text-slate-300/70">{flight.sta}</span>
                    </div>
                  </div>

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
                           <span className="font-bold text-primary dark:text-blue-300">{flight.mvtData?.atd}</span>
                         </div>
                         <div className="flex flex-col items-center">
                           <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Bags</span>
                           <span className="font-bold text-slate-700 dark:text-slate-300">{flight.mvtData?.totalBags || "0"}</span>
                         </div>
                         <div className="flex flex-col items-end">
                           <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Demoras</span>
                           {flight.mvtData?.dlyCod1 ? (
                              <div className="flex gap-1">
                                <span className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-1.5 py-0.5 rounded text-xs font-bold">{flight.mvtData.dlyCod1}</span>
                                {flight.mvtData?.dlyCod2 && <span className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 px-1.5 py-0.5 rounded text-xs font-bold">{flight.mvtData.dlyCod2}</span>}
                              </div>
                           ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs mr-1">- Ninguna -</span>
                           )}
                         </div>
                      </div>
                    )}
                  </div>

                  {/* Disclaimers */}
                  {badgeText && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 border-2 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full shadow flex items-center gap-1.5 whitespace-nowrap ${badgeColor}`}>
                      {badgeText === "MVT COMPLETADO" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
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

      {showOpsMenu && (
        <OperationsMenu
          flights={filteredFlights}
          onClose={() => setShowOpsMenu(false)}
        />
      )}

      {selectedFlight && (
        <FlightModal
          flight={selectedFlight}
          userRole={userRole}
          onClose={() => setSelectedFlight(null)}
          onSaveMVT={(data) => handleSaveMVT(selectedFlight.id, data)}
          onSaveHitos={(data) => handleSaveHitos(selectedFlight.id, data)}
          onSaveCrewHitos={(data) => handleSaveCrewHitos(selectedFlight.id, data)}
        />
      )}

      {showUserManagement && (userRole === "ADMIN" || userRole === "AJS") && (
        <UserManagement onClose={() => setShowUserManagement(false)} />
      )}
    </div>
  );
}

export default App;
