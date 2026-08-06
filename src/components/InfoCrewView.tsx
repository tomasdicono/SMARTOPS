import { useMemo, useState } from "react";
import {
  Users,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  Table,
  ChevronDown,
  ChevronUp,
  Clock,
  CalendarClock,
  Plane
} from "lucide-react";
import type { Flight } from "../types";

// Safe, custom date parsing function that works for "dd-MM-yyyy" and "yyyy-MM-dd"
function parseToDate(dateStr: string, timeStr: string): Date {
  const dateNormalized = dateStr.trim().replace(/\//g, "-");
  const timeNormalized = timeStr.trim();

  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  let day = new Date().getDate();

  const dParts = dateNormalized.split("-");
  if (dParts.length === 3) {
    if (dParts[0].length === 4) {
      // yyyy-MM-dd
      year = parseInt(dParts[0], 10);
      month = parseInt(dParts[1], 10) - 1;
      day = parseInt(dParts[2], 10);
    } else {
      // dd-MM-yyyy
      day = parseInt(dParts[0], 10);
      month = parseInt(dParts[1], 10) - 1;
      year = parseInt(dParts[2], 10);
    }
  }

  let hours = 0;
  let minutes = 0;
  const tParts = timeNormalized.split(":");
  if (tParts.length === 2) {
    hours = parseInt(tParts[0], 10);
    minutes = parseInt(tParts[1], 10);
  }

  return new Date(year, month, day, hours, minutes, 0, 0);
}

// Safe, custom difference in minutes
function getDifferenceInMinutes(dateA: Date, dateB: Date): number {
  return Math.round((dateA.getTime() - dateB.getTime()) / (60 * 1000));
}

// Safe, custom format HH:MM
function formatHHmm(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Maximum Service Hours Lookup Table
// presentation time HH:MM, legs count
function getMaxServiceHours(presentationTimeStr: string, legs: number): number {
  const parts = presentationTimeStr.split(":");
  if (parts.length !== 2) return 9;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return 9;
  const totalMinutes = hours * 60 + minutes;

  const getLimit = (legs1_2: number, legs3_4: number, leg5: number, leg6: number, leg7plus: number) => {
    if (legs <= 2) return legs1_2;
    if (legs <= 4) return legs3_4;
    if (legs === 5) return leg5;
    if (legs === 6) return leg6;
    return leg7plus;
  };

  // 00:00 to 03:59
  if (totalMinutes >= 0 && totalMinutes <= 239) {
    return 9;
  }
  // 04:00 to 04:59
  else if (totalMinutes >= 240 && totalMinutes <= 299) {
    return getLimit(10, 10, 9, 9, 9);
  }
  // 05:00 to 05:59
  else if (totalMinutes >= 300 && totalMinutes <= 359) {
    return getLimit(12, 12, 11.5, 11, 10.5);
  }
  // 06:00 to 06:59
  else if (totalMinutes >= 360 && totalMinutes <= 419) {
    return getLimit(13, 12, 11.5, 11, 10.5);
  }
  // 07:00 to 11:59
  else if (totalMinutes >= 420 && totalMinutes <= 719) {
    return getLimit(14, 13, 12.5, 12, 11.5);
  }
  // 12:00 to 12:59
  else if (totalMinutes >= 720 && totalMinutes <= 779) {
    return getLimit(13, 13, 12.5, 12, 11.5);
  }
  // 13:00 to 16:59
  else if (totalMinutes >= 780 && totalMinutes <= 1019) {
    return getLimit(12, 12, 11.5, 11, 10.5);
  }
  // 17:00 to 21:59
  else if (totalMinutes >= 1020 && totalMinutes <= 1319) {
    return getLimit(12, 11, 10, 9, 9);
  }
  // 22:00 to 22:59
  else if (totalMinutes >= 1320 && totalMinutes <= 1379) {
    return getLimit(11, 10, 9, 9, 9);
  }
  // 23:00 to 23:59
  else if (totalMinutes >= 1380 && totalMinutes <= 1439) {
    return getLimit(10, 9, 9, 9, 9);
  }

  return 9; // Fallback
}

interface CrewGroupInfo {
  route: string;
  reg: string;
  flights: Flight[];
  sortedLegs: {
    flight: Flight;
    stdDate: Date;
    staDate: Date;
  }[];
  activeLegsCount: number;
  firstStd: string;
  lastSta: string;
  presentationTimeStr: string;
  presentationDate: Date | null;
  maxServiceHours: number;
  endOfServiceDate: Date | null;
  limitTimeStr: string;
  holguraMinutes: number | null;
  holguraStr: string;
  status: "danger" | "warning" | "success" | "none";
}

interface InfoCrewViewProps {
  flights: Flight[];
  selectedDate: string;
}

export function InfoCrewView({ flights }: InfoCrewViewProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "danger" | "warning" | "success">("all");
  const [sortBy, setSortBy] = useState<"std" | "holgura" | "legs">("holgura");
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [showTableModal, setShowTableModal] = useState(false);

  // Group and calculate slacks
  // Group and calculate slacks
  const crewGroups = useMemo<CrewGroupInfo[]>(() => {
    // 1. Group flights strictly by Route
    const groups: Record<string, Flight[]> = {};
    for (const f of flights) {
      const r = (f.route || "").trim();
      if (!r) continue;
      if (!groups[r]) {
        groups[r] = [];
      }
      groups[r].push(f);
    }

    // 2. Calculate info for each crew group
    const list: CrewGroupInfo[] = [];

    for (const [route, groupFlights] of Object.entries(groups)) {
      // Parse dates
      const parsedLegs = groupFlights.map((f) => {
        const stdDate = parseToDate(f.date, f.std);
        let staDate = parseToDate(f.date, f.sta);
        if (staDate < stdDate) {
          staDate = new Date(staDate.getTime() + 24 * 60 * 60 * 1000);
        }
        return { flight: f, stdDate, staDate };
      });

      // Deduplicate flights by flight number (flt) to prevent duplicate database records from inflating legs count
      const uniqueLegsMap = new Map<string, typeof parsedLegs[0]>();
      for (const leg of parsedLegs) {
        const key = leg.flight.flt.trim().toUpperCase();
        if (!uniqueLegsMap.has(key)) {
          uniqueLegsMap.set(key, leg);
        } else {
          const existing = uniqueLegsMap.get(key)!;
          // Keep the non-cancelled one if possible
          if (existing.flight.cancelled && !leg.flight.cancelled) {
            uniqueLegsMap.set(key, leg);
          }
        }
      }

      // Sort unique legs by departure time
      const sortedLegs = [...uniqueLegsMap.values()].sort((a, b) => a.stdDate.getTime() - b.stdDate.getTime());

      // Split into separate duties based on NAT/REC rule
      const duties: typeof sortedLegs[] = [];
      let currentDuty: typeof sortedLegs = [];

      for (const leg of sortedLegs) {
        const dep = (leg.flight.dep || "").trim().toUpperCase();
        if ((dep === "NAT" || dep === "REC") && currentDuty.length > 0) {
          duties.push(currentDuty);
          currentDuty = [];
        }
        currentDuty.push(leg);
        const arr = (leg.flight.arr || "").trim().toUpperCase();
        if (arr === "NAT" || arr === "REC") {
          duties.push(currentDuty);
          currentDuty = [];
        }
      }
      if (currentDuty.length > 0) {
        duties.push(currentDuty);
      }

      // Process each duty as a separate crew group info
      duties.forEach((duty) => {
        const activeLegs = duty.filter((l) => !l.flight.cancelled);
        const activeLegsCount = activeLegs.length;
        const reg = activeLegs[0]?.flight.reg || duty[0]?.flight.reg || "";

        // Custom route label/name: e.g. "3832 (AEP)" or "3832 (NAT)"
        const originAirport = duty[0]?.flight.dep || "";
        const routeLabel = duties.length > 1 ? `${route} (${originAirport})` : route;

        const dutyFlights = duty.map((l) => l.flight);

        if (activeLegsCount === 0) {
          list.push({
            route: routeLabel,
            reg,
            flights: dutyFlights,
            sortedLegs: duty,
            activeLegsCount: 0,
            firstStd: "",
            lastSta: "",
            presentationTimeStr: "",
            presentationDate: null,
            maxServiceHours: 0,
            endOfServiceDate: null,
            limitTimeStr: "",
            holguraMinutes: null,
            holguraStr: "Sin legs activos",
            status: "none"
          });
          return;
        }

        const firstActive = activeLegs[0];
        const lastActive = activeLegs[activeLegsCount - 1];

        // Presentation date = first active STD - 1 hour
        const presentationDate = new Date(firstActive.stdDate.getTime() - 60 * 60 * 1000);
        const presentationTimeStr = formatHHmm(presentationDate);

        // Max service hours
        const maxServiceHours = getMaxServiceHours(presentationTimeStr, activeLegsCount);

        // End of service limit
        const endOfServiceDate = new Date(presentationDate.getTime() + maxServiceHours * 60 * 60 * 1000);
        const crossDay = endOfServiceDate.getDate() !== presentationDate.getDate();
        const limitTimeStr = formatHHmm(endOfServiceDate) + (crossDay ? " (+1)" : "");

        // Holgura
        const holguraMinutes = getDifferenceInMinutes(endOfServiceDate, lastActive.staDate);

        const absMinutes = Math.abs(holguraMinutes);
        const hh = Math.floor(absMinutes / 60);
        const mm = absMinutes % 60;
        const sign = holguraMinutes < 0 ? "-" : "";
        const holguraStr = `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

        let status: "danger" | "warning" | "success" = "success";
        if (holguraMinutes < 0) {
          status = "danger";
        } else if (holguraMinutes < 60) {
          status = "warning";
        }

        list.push({
          route: routeLabel,
          reg,
          flights: dutyFlights,
          sortedLegs: duty,
          activeLegsCount,
          firstStd: firstActive.flight.std,
          lastSta: lastActive.flight.sta,
          presentationTimeStr,
          presentationDate,
          maxServiceHours,
          endOfServiceDate,
          limitTimeStr,
          holguraMinutes,
          holguraStr,
          status
        });
      });
    }
    return list;
  }, [flights]);

  // Statistics
  const stats = useMemo(() => {
    let total = crewGroups.length;
    let danger = 0;
    let warning = 0;
    let success = 0;

    for (const g of crewGroups) {
      if (g.status === "danger") danger++;
      else if (g.status === "warning") warning++;
      else if (g.status === "success") success++;
    }

    return { total, danger, warning, success };
  }, [crewGroups]);

  // Filter and Search
  const filteredGroups = useMemo(() => {
    let result = crewGroups;

    // Search
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (g) =>
          g.route.toLowerCase().includes(q) ||
          g.reg.toLowerCase().includes(q) ||
          g.flights.some((f) => f.flt.toLowerCase().includes(q))
      );
    }

    // Filter
    if (filterType !== "all") {
      result = result.filter((g) => g.status === filterType);
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === "std") {
        if (!a.presentationDate) return 1;
        if (!b.presentationDate) return -1;
        return a.presentationDate.getTime() - b.presentationDate.getTime();
      } else if (sortBy === "legs") {
        return b.activeLegsCount - a.activeLegsCount;
      } else {
        // Sort by holgura (danger/critical first)
        if (a.holguraMinutes === null) return 1;
        if (b.holguraMinutes === null) return -1;
        return a.holguraMinutes - b.holguraMinutes;
      }
    });

    return result;
  }, [crewGroups, search, filterType, sortBy]);

  const toggleExpand = (route: string) => {
    setExpandedRoute(expandedRoute === route ? null : route);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Crews */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
          <div className="p-3 bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Crews hoy</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{stats.total}</p>
          </div>
        </div>

        {/* In Penalty */}
        <button
          onClick={() => setFilterType(filterType === "danger" ? "all" : "danger")}
          className={`text-left bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm flex items-center gap-4 transition-all hover:shadow-md cursor-pointer ${
            filterType === "danger"
              ? "border-red-500 ring-2 ring-red-500/20"
              : "border-slate-200 dark:border-slate-800"
          }`}
        >
          <div className="p-3 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-2xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">En Penalidad (Holgura &lt; 0)</p>
            <p className="text-2xl font-black text-red-600 dark:text-red-400">{stats.danger}</p>
          </div>
        </button>

        {/* Warning */}
        <button
          onClick={() => setFilterType(filterType === "warning" ? "all" : "warning")}
          className={`text-left bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm flex items-center gap-4 transition-all hover:shadow-md cursor-pointer ${
            filterType === "warning"
              ? "border-amber-500 ring-2 ring-amber-500/20"
              : "border-slate-200 dark:border-slate-800"
          }`}
        >
          <div className="p-3 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-2xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">En Alerta (Holgura &lt; 1h)</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.warning}</p>
          </div>
        </button>

        {/* Safe */}
        <button
          onClick={() => setFilterType(filterType === "success" ? "all" : "success")}
          className={`text-left bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm flex items-center gap-4 transition-all hover:shadow-md cursor-pointer ${
            filterType === "success"
              ? "border-emerald-500 ring-2 ring-emerald-500/20"
              : "border-slate-200 dark:border-slate-800"
          }`}
        >
          <div className="p-3 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-2xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Holgura Segura (&gt;= 1h)</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.success}</p>
          </div>
        </button>
      </div>

      {/* Control Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Crew, Matrícula o Vuelo..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Filters and sorting */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="holgura">Holgura (Más crítica primero)</option>
              <option value="std">Hora de Presentación</option>
              <option value="legs">Cantidad de Tramos</option>
            </select>
          </div>

          <button
            onClick={() => setShowTableModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
          >
            <Table className="w-4 h-4" />
            Ver Tabla Límites
          </button>
        </div>
      </div>

      {/* Main List */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center text-slate-500 flex flex-col items-center justify-center min-h-[30vh]">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-lg font-bold text-slate-700 dark:text-slate-300">No se encontraron crews</p>
            <p className="text-sm text-slate-400 mt-1">Intenta ajustando los filtros o la búsqueda.</p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded = expandedRoute === group.route;
            const isCritical = group.status === "danger";
            const isWarning = group.status === "warning";

            // Status style settings
            let badgeBg = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/30";
            let alertBorder = "border-slate-200 dark:border-slate-800";
            if (isCritical) {
              badgeBg = "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200/50 dark:border-red-900/30";
              alertBorder = "border-red-200 dark:border-red-950/40 ring-1 ring-red-500/10";
            } else if (isWarning) {
              badgeBg = "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30";
              alertBorder = "border-amber-200 dark:border-amber-950/40 ring-1 ring-amber-500/10";
            }

            return (
              <div
                key={group.route}
                className={`bg-white dark:bg-slate-900 border rounded-3xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md ${alertBorder}`}
              >
                {/* Header row */}
                <div
                  onClick={() => toggleExpand(group.route)}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-500" />
                      <span className="font-black text-slate-800 dark:text-slate-200">Crew {group.route}</span>
                    </div>

                    {group.reg && (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <Plane className="w-3.5 h-3.5 text-slate-400" />
                        {group.reg}
                      </span>
                    )}

                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {group.activeLegsCount} {group.activeLegsCount === 1 ? "Tramo" : "Tramos"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    {/* Time summary info */}
                    {group.activeLegsCount > 0 && (
                      <div className="hidden lg:flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
                        <div>
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Presentación</p>
                          <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {group.presentationTimeStr}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Servicio Máx</p>
                          <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                            {group.maxServiceHours} hs
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Hora Límite</p>
                          <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                            <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                            {group.limitTimeStr}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Último STA</p>
                          <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                            {group.lastSta}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Slack Badge */}
                    <div className="flex items-center gap-3">
                      <div className={`px-4 py-2 border rounded-2xl flex flex-col items-center justify-center min-w-[100px] ${badgeBg}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">Holgura</span>
                        <span className="text-base font-black tracking-tight">{group.holguraStr}</span>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile visible summary (when collapsed) */}
                {group.activeLegsCount > 0 && !isExpanded && (
                  <div className="lg:hidden px-5 pb-4 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-900 pt-3">
                    <span>Pres: <strong>{group.presentationTimeStr}</strong></span>
                    <span>Max: <strong>{group.maxServiceHours}h</strong></span>
                    <span>Límite: <strong>{group.limitTimeStr}</strong></span>
                    <span>STA: <strong>{group.lastSta}</strong></span>
                  </div>
                )}

                {/* Detailed flight timeline list (when expanded) */}
                {isExpanded && (
                  <div className="bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-100 dark:border-slate-900 p-6 space-y-4">
                    {/* Compact layout of calculations details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl text-sm">
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wide">Hora Presentación</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-slate-400" />
                          {group.presentationTimeStr} hs <span className="text-slate-400 text-xs font-normal">(-1hs STD)</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wide">Piernas / Tramos</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {group.activeLegsCount} {group.activeLegsCount === 1 ? "pierna activa" : "piernas activas"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wide">Servicio Máximo FDP</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {group.maxServiceHours} horas
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wide">Fin de Servicio Límite</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block flex items-center gap-1.5">
                          <CalendarClock className="w-4 h-4 text-slate-400" />
                          {group.limitTimeStr} hs
                        </span>
                      </div>
                    </div>

                    {/* Timeline title */}
                    <div className="text-xs font-black uppercase tracking-wider text-slate-400 pb-1 mt-2">
                      Secuencia de Vuelos
                    </div>

                    {/* Leg Sequence Timeline */}
                    <div className="space-y-3 relative pl-4 before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                      {group.sortedLegs.map((leg) => {
                        const isCancelled = leg.flight.cancelled;
                        return (
                          <div
                            key={leg.flight.id}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4.5 rounded-2xl border transition-all ${
                              isCancelled
                                ? "bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-900 opacity-55 text-slate-400"
                                : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Timeline indicator node */}
                              <div className={`absolute left-[5px] w-3.5 h-3.5 rounded-full border-2 bg-white dark:bg-slate-900 z-10 ${
                                isCancelled
                                  ? "border-slate-300 dark:border-slate-700"
                                  : "border-purple-500"
                              }`} />

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`font-bold ${isCancelled ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>
                                    Vuelo {leg.flight.flt}
                                  </span>
                                  {isCancelled && (
                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 rounded text-[9px] font-black uppercase tracking-wider">
                                      Cancelado
                                    </span>
                                  )}
                                  {leg.flight.pax && !isCancelled && (
                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] text-slate-500">
                                      PAX: {leg.flight.pax}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 font-semibold mt-0.5">
                                  {leg.flight.dep} ➔ {leg.flight.arr}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-6 text-sm">
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">STD</span>
                                <span className={`font-semibold ${isCancelled ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>
                                  {leg.flight.std}
                                </span>
                              </div>
                              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">STA</span>
                                <span className={`font-semibold ${isCancelled ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>
                                  {leg.flight.sta}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reference Table Modal */}
      {showTableModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">Tabla de Límites de Servicio de Tripulación</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tiempos de Servicio Máximos (FDP) según horario de presentación y piernas</p>
              </div>
              <button
                onClick={() => setShowTableModal(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-all text-slate-500"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Table content */}
            <div className="p-6 overflow-auto">
              <table className="w-full text-left text-sm border-collapse rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-xs uppercase border-b border-slate-200 dark:border-slate-800">
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">Desde</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">Hasta</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">1 Leg</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">2 Leg</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">3 Leg</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">4 Leg</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">5 Leg</th>
                    <th className="p-3.5 border-r border-slate-200 dark:border-slate-800">6 Leg</th>
                    <th className="p-3.5">7+ Leg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">00:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">03:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3">9</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40 bg-slate-50/20 dark:bg-slate-950/10">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">04:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">04:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3">9</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">05:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">05:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11.5</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3">10.5</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40 bg-slate-50/20 dark:bg-slate-950/10">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">06:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">06:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11.5</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3">10.5</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">07:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">11:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">14</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">14</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12.5</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3">11.5</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40 bg-slate-50/20 dark:bg-slate-950/10">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">12:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">12:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">13</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12.5</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3">11.5</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">13:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">16:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11.5</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3">10.5</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40 bg-slate-50/20 dark:bg-slate-950/10">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">17:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">21:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">12</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3 border-r border-slate-200 LOGO dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3">9</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">22:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">22:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">11</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3">9</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-950/40 bg-slate-50/20 dark:bg-slate-950/10">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">23:00</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 font-semibold">23:59</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">10</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800">9</td>
                    <td className="p-3">9</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
              <button
                onClick={() => setShowTableModal(false)}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
