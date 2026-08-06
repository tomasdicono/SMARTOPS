import { useState, useRef } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Flight } from "../types";
import { ClipboardPaste, CheckCircle2, X, Upload, FileSpreadsheet, AlertCircle, FileText, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
    onLoadFlights: (flights: Flight[]) => void;
    onClose: () => void;
    onDeleteFlightsForDate?: () => void;
}

type Tab = "paste" | "excel";

function normalizeDateStr(raw: unknown): string {
    if (raw == null) return "";
    if (typeof raw === "number") {
        // Excel serial date format
        try {
            const dateObj = new Date(Math.round((raw - 25569) * 86400 * 1000));
            const d = String(dateObj.getDate()).padStart(2, "0");
            const m = String(dateObj.getMonth() + 1).padStart(2, "0");
            const y = dateObj.getFullYear();
            return `${d}-${m}-${y}`;
        } catch {
            return String(raw);
        }
    }
    const s = String(raw).trim().replace(/\//g, "-");
    if (!s) return "";
    const parts = s.split("-");
    if (parts.length === 3) {
        let [d, m, y] = parts;
        if (d.length === 4) {
            // YYYY-MM-DD -> DD-MM-YYYY
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        if (y.length === 2) {
            y = "20" + y; // e.g. "26" -> "2026"
        }
        return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
    }
    return s;
}

function cleanFlightNumber(raw: unknown): string {
    const s = String(raw ?? "").trim();
    if (s.toUpperCase().startsWith("WJ")) {
        return s.slice(2).trim();
    }
    return s;
}

function normalizeTimeToken(raw: unknown): string {
    if (raw == null) return "";
    if (typeof raw === "number") {
        // Excel fraction of day time format
        try {
            const totalMinutes = Math.round(raw * 24 * 60);
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        } catch {
            return String(raw);
        }
    }
    let s = String(raw).trim();
    s = s.replace(/[^0-9:]/g, "");
    if (!s) return "";
    if (s.includes(":")) {
        const [h, m] = s.split(":");
        return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
    }
    if (s.length === 3) {
        return `0${s[0]}:${s.slice(1, 3)}`;
    }
    if (s.length === 4) {
        return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
    }
    return s;
}

function parseRowsToFlights(rows: unknown[][]): Flight[] {
    const flights: Flight[] = [];
    let headerRowIndex = -1;
    let colMap: Record<string, number> = {};

    // 1. Search for header row
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;
        
        let hasDate = false;
        let hasFlt = false;
        let tempMap: Record<string, number> = {};

        for (let c = 0; c < row.length; c++) {
            const cell = String(row[c] || "").trim().toUpperCase();
            if (cell === "DATE" || cell === "FECHA") {
                hasDate = true;
                tempMap.date = c;
            } else if (cell === "FLT" || cell === "VUELO" || cell === "FLIGHT") {
                hasFlt = true;
                tempMap.flt = c;
            } else if (cell === "REG" || cell === "MATRICULA" || cell === "MATRÍCULA" || cell === "TAIL") {
                tempMap.reg = c;
            } else if (cell === "DEP" || cell === "ORIGEN" || cell === "ORIG") {
                tempMap.dep = c;
            } else if (cell === "ARR" || cell === "DESTINO" || cell === "DEST") {
                tempMap.arr = c;
            } else if (cell === "STD") {
                tempMap.std = c;
            } else if (cell === "STA") {
                tempMap.sta = c;
            } else if (cell === "ETD") {
                tempMap.etd = c;
            } else if (cell === "ETA") {
                tempMap.eta = c;
            } else if (cell === "PAX" || cell === "PASAJEROS") {
                tempMap.pax = c;
            } else if (
                cell === "ROUTE" || 
                cell === "RUTA" || 
                cell === "RUT" || 
                cell === "NRO RUTA" || 
                cell === "Nº RUTA" || 
                cell === "NRO. RUTA" || 
                cell === "NRO DE RUTA" || 
                cell === "Nº DE RUTA" || 
                cell === "NUMERO DE RUTA" || 
                cell === "NÚMERO DE RUTA" ||
                cell === "VUELO COMERCIAL"
            ) {
                tempMap.route = c;
            }
        }

        if (hasDate && hasFlt) {
            headerRowIndex = r;
            colMap = tempMap;
            break;
        }
    }

    if (headerRowIndex !== -1) {
        // Parse with mapped columns
        for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;
            
            const rawDate = row[colMap.date];
            if (rawDate == null || String(rawDate).trim() === "") continue;

            const date = normalizeDateStr(rawDate);
            const flt = cleanFlightNumber(row[colMap.flt]);
            if (!flt) continue;

            const dep = colMap.dep !== undefined ? String(row[colMap.dep] || "").trim().toUpperCase() : "";
            const arr = colMap.arr !== undefined ? String(row[colMap.arr] || "").trim().toUpperCase() : "";
            const reg = colMap.reg !== undefined ? String(row[colMap.reg] || "").trim().toUpperCase() : "";
            const std = colMap.std !== undefined ? normalizeTimeToken(row[colMap.std]) : "";
            const sta = colMap.sta !== undefined ? normalizeTimeToken(row[colMap.sta]) : "";
            
            const etd = colMap.etd !== undefined ? normalizeTimeToken(row[colMap.etd]) : "";
            const eta = colMap.eta !== undefined ? normalizeTimeToken(row[colMap.eta]) : "";
            const pax = colMap.pax !== undefined ? String(row[colMap.pax] || "").trim() : "";

            const route = colMap.route !== undefined ? String(row[colMap.route] || "").trim() : `${dep}-${arr}`;
            const flight: Flight = {
                id: uuidv4(),
                date,
                route,
                flt,
                reg,
                dep,
                arr,
                std,
                sta,
                pax
            };

            if (etd) {
                flight.etd = etd;
            }
            if (eta) {
                flight.mvtData = {
                    atd: "",
                    off: "",
                    eta: eta,
                    dlyCod1: "",
                    dlyTime1: "",
                    dlyCod2: "",
                    dlyTime2: "",
                    observaciones: "",
                    paxActual: "",
                    inf: "",
                    totalBags: "",
                    totalCarga: "",
                    load: "",
                    fob: "",
                    ssee: [],
                    infoSup: "",
                    supervisor: ""
                };
            }

            flights.push(flight);
        }
    } else {
        // Fallback to original text-based fixed index parser
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length < 9) continue;
            
            const rawDate = row[0];
            if (rawDate == null || String(rawDate).trim() === "") continue;

            const date = normalizeDateStr(rawDate);
            const flt = cleanFlightNumber(row[2]);
            const dep = String(row[4] || "").trim().toUpperCase();
            const arr = String(row[5] || "").trim().toUpperCase();
            const reg = String(row[3] || "").trim().toUpperCase();
            const std = normalizeTimeToken(row[6]);
            const sta = normalizeTimeToken(row[7]);
            const pax = String(row[8] || "").trim();
            const route = String(row[1] || "").trim();

            flights.push({
                id: uuidv4(),
                date,
                route,
                flt,
                reg,
                dep,
                arr,
                std,
                sta,
                pax
            });
        }
    }

    return flights;
}

export function ScheduleParser({ onLoadFlights, onClose, onDeleteFlightsForDate }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>("paste");
    const [text, setText] = useState("");
    const [parsedCount, setParsedCount] = useState<number | null>(null);

    // Excel states
    const [excelFlights, setExcelFlights] = useState<Flight[]>([]);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleParseText = () => {
        setError(null);
        const uppercaseText = text.toUpperCase();
        let flights: Flight[] = [];
        
        const hasHeader = (uppercaseText.includes("DATE") || uppercaseText.includes("FECHA")) && 
                          (uppercaseText.includes("FLT") || uppercaseText.includes("VUELO") || uppercaseText.includes("FLIGHT"));
        
        if (hasHeader) {
            const lines = text.split("\n").filter(line => line.trim());
            const rows = lines.map(line => line.split("\t"));
            flights = parseRowsToFlights(rows);
        } else {
            // Classical parser
            const lines = text.split("\n");
            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.split(/\t+/);
                if (parts.length >= 9) {
                    const rawDate = parts[0].trim();
                    const dateRegex = /^\d{2}[-/]\d{2}[-/]\d{2,4}/;
                    if (!dateRegex.test(rawDate)) continue;

                    flights.push({
                        id: uuidv4(),
                        date: normalizeDateStr(rawDate),
                        route: parts[1].trim(),
                        flt: cleanFlightNumber(parts[2]),
                        reg: parts[3].trim().toUpperCase(),
                        dep: parts[4].trim().toUpperCase(),
                        arr: parts[5].trim().toUpperCase(),
                        std: normalizeTimeToken(parts[6]),
                        sta: normalizeTimeToken(parts[7]),
                        pax: parts[8].trim(),
                    });
                }
            }
        }

        if (flights.length > 0) {
            setParsedCount(flights.length);
            onLoadFlights(flights);
            setTimeout(() => {
                setParsedCount(null);
                onClose();
            }, 1500);
            setText("");
        } else {
            setError("No se pudieron detectar vuelos en el texto pegado. Verifica que tenga el formato o las columnas correspondientes.");
        }
    };

    const processExcelFile = (file: File) => {
        setError(null);
        setFileName(file.name);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) {
                    setError("No se pudo leer el archivo Excel.");
                    return;
                }
                const workbook = XLSX.read(data, { type: "array" });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    setError("El archivo Excel no tiene hojas.");
                    return;
                }
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
                    header: 1,
                    defval: "",
                    raw: false,
                }) as unknown[][];

                const flights = parseRowsToFlights(rows);
                if (flights.length > 0) {
                    setExcelFlights(flights);
                } else {
                    setError("No se encontraron vuelos válidos en el archivo Excel. Verifica el formato.");
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Error al procesar el archivo Excel.");
            }
        };
        reader.onerror = () => {
            setError("Error al leer el archivo.");
        };
        reader.readAsArrayBuffer(file);
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processExcelFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
                processExcelFile(file);
            } else {
                setError("Formato de archivo no válido. Usa .xlsx, .xls o .csv.");
            }
        }
    };

    const handleConfirmExcelLoad = () => {
        if (excelFlights.length > 0) {
            setParsedCount(excelFlights.length);
            onLoadFlights(excelFlights);
            setTimeout(() => {
                setParsedCount(null);
                onClose();
            }, 1500);
            setExcelFlights([]);
            setFileName(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-950 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold mb-4 text-card-foreground flex items-center gap-2">
                    <ClipboardPaste className="w-6 h-6 text-primary" />
                    Cargar Programación de Vuelos
                </h2>
                
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6">
                    <button
                        onClick={() => {
                            setActiveTab("paste");
                            setError(null);
                        }}
                        className={`py-2 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
                            activeTab === "paste"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        Pegar Texto
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("excel");
                            setError(null);
                        }}
                        className={`py-2 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
                            activeTab === "excel"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Subir Archivo Excel
                    </button>
                </div>

                {activeTab === "paste" ? (
                    <div className="flex flex-col flex-1">
                        <p className="text-sm text-muted-foreground mb-4">
                            Copia y pega aquí la tabla de vuelos tal cual como viene en tu formato de texto. Admite el formato clásico y el nuevo formato de Excel con columnas ETD/ETA.
                        </p>

                        <textarea
                            className="w-full h-48 p-4 bg-slate-50 dark:bg-slate-900 border border-input rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none text-sm font-mono whitespace-pre"
                            placeholder="Ej: 01-04-2026   3832    3832   LV-JQE  AEP  NAT   04:10  09:45  161&#10;O con cabeceras: DATE  FLT  REG  DEP  ARR  STD  STA  ETD  ETA..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />

                        {error && (
                            <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 p-3 rounded-xl border border-red-200 dark:border-red-900/50">
                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="mt-6 flex items-center justify-between">
                            <div className="text-sm font-medium flex items-center gap-3">
                                {onDeleteFlightsForDate && (
                                    <button
                                        type="button"
                                        onClick={onDeleteFlightsForDate}
                                        className="border border-red-200 hover:border-red-500 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
                                        title="Eliminar todos los vuelos del día seleccionado"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Eliminar vuelos del día
                                    </button>
                                )}
                                {parsedCount !== null && (
                                    <span className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                                        <CheckCircle2 className="w-4 h-4" />
                                        ¡{parsedCount} vuelos cargados! Volviendo al tablero...
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleParseText}
                                disabled={!text.trim()}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-bold transition-transform hover:-translate-y-0.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                Procesar Texto
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1">
                        <p className="text-sm text-muted-foreground mb-4">
                            Sube o arrastra el archivo de Excel con el itinerario de vuelos. Se extraerán automáticamente las columnas de DATE, FLT, REG, DEP, ARR, STD, STA, ETD y ETA.
                        </p>

                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                isDragging
                                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                                    : "border-slate-300 dark:border-slate-800 hover:border-primary bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60"
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                            <p className="font-semibold text-sm text-center">
                                {fileName ? `Archivo seleccionado: ${fileName}` : "Arrastra tu archivo aquí o haz clic para buscar"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Soporta .xlsx, .xls y .csv</p>
                        </div>

                        {error && (
                            <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 p-3 rounded-xl border border-red-200 dark:border-red-900/50">
                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {excelFlights.length > 0 && (
                            <div className="mt-6 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                                <div className="bg-slate-50 dark:bg-slate-900 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        Vuelos detectados ({excelFlights.length})
                                    </span>
                                </div>
                                <div className="max-h-40 overflow-y-auto text-xs font-mono">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                                                <th className="p-2">Fecha</th>
                                                <th className="p-2">Vuelo</th>
                                                <th className="p-2">Matrícula</th>
                                                <th className="p-2">Ruta</th>
                                                <th className="p-2">STD</th>
                                                <th className="p-2">STA</th>
                                                <th className="p-2">ETD</th>
                                                <th className="p-2">ETA</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {excelFlights.slice(0, 5).map((f) => (
                                                <tr key={f.id} className="border-b border-slate-100 dark:border-slate-900/50 last:border-0">
                                                    <td className="p-2">{f.date}</td>
                                                    <td className="p-2 font-bold">{f.flt}</td>
                                                    <td className="p-2">{f.reg || "—"}</td>
                                                    <td className="p-2">{f.dep}→{f.arr}</td>
                                                    <td className="p-2">{f.std}</td>
                                                    <td className="p-2">{f.sta}</td>
                                                    <td className="p-2 text-amber-600 dark:text-amber-400 font-semibold">{f.etd || "—"}</td>
                                                    <td className="p-2 text-amber-600 dark:text-amber-400 font-semibold">{f.mvtData?.eta || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {excelFlights.length > 5 && (
                                        <div className="text-center py-2 text-muted-foreground border-t border-slate-100 dark:border-slate-900/50 text-[10px]">
                                            ... y {excelFlights.length - 5} vuelos más
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex items-center justify-between">
                            <div className="text-sm font-medium flex items-center gap-3">
                                {onDeleteFlightsForDate && (
                                    <button
                                        type="button"
                                        onClick={onDeleteFlightsForDate}
                                        className="border border-red-200 hover:border-red-500 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
                                        title="Eliminar todos los vuelos del día seleccionado"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Eliminar vuelos del día
                                    </button>
                                )}
                                {parsedCount !== null && (
                                    <span className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                                        <CheckCircle2 className="w-4 h-4" />
                                        ¡{parsedCount} vuelos cargados! Volviendo al tablero...
                                    </span>
                                )}
                            </div>
                            {excelFlights.length > 0 && (
                                <button
                                    onClick={handleConfirmExcelLoad}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-bold transition-transform hover:-translate-y-0.5 shadow-md"
                                >
                                    Confirmar y Cargar Vuelos
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
