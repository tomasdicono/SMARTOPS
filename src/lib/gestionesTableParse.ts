import type { Flight } from "../types";
import { flightDateToIso } from "./controlHelpers";
import { mergeMvtDataForPersist, normalizeMvtData } from "./flightDataNormalize";
import { normalizeAirportCode } from "./routeAfectaciones";

/** Columnas reconocidas en la primera fila del pegado */
export type GestionesColumn =
    | "fecha"
    | "vuelo"
    | "dep"
    | "arr"
    | "original"
    | "cambio"
    | "std"
    | "sta"
    | "etd"
    | "eta"
    | "motivo"
    | "cancelado"
    | "newDep"
    | "newArr";

export interface GestionesDataRow {
    /** Índice 1-based en el pegado (solo filas de datos) */
    rowIndex: number;
    raw: Partial<Record<GestionesColumn, string>>;
}

const HEADER_ALIASES: Record<string, GestionesColumn> = {
    FECHA: "fecha",
    DATE: "fecha",
    VUELO: "vuelo",
    FLIGHT: "vuelo",
    FLT: "vuelo",
    DEP: "dep",
    FROM: "dep",
    ORI: "dep",
    ARR: "arr",
    TO: "arr",
    DEST: "arr",
    ORIGINAL: "original",
    "MAT.ORIGINAL": "original",
    REG_ORIGINAL: "original",
    CAMBIO: "cambio",
    NUEVO: "cambio",
    NUEVA: "cambio",
    MATRICULA: "cambio",
    MATRÍCULA: "cambio",
    /** Pegados de programación / reprogramación (sin par ORIGINAL–CAMBIO) */
    TAIL: "cambio",
    REG: "cambio",
    AC: "cambio",
    MAT: "cambio",
    STD: "std",
    STA: "sta",
    ETD: "etd",
    ETA: "eta",
    MOTIVO: "motivo",
    RAZON: "motivo",
    CANCEL: "cancelado",
    CANCELADO: "cancelado",
    ANULADO: "cancelado",
    NEWARR: "newArr",
    NEWDEP: "newDep",
    "NEW.ARR": "newArr",
    "NEW.DEP": "newDep",
};

/** Orden por defecto si el pegado no trae fila de encabezados (10 columnas). */
const DEFAULT_COLUMN_ORDER: GestionesColumn[] = [
    "fecha",
    "vuelo",
    "dep",
    "arr",
    "original",
    "cambio",
    "std",
    "sta",
    "etd",
    "eta",
];

/** Tablas de reprogramación con TAIL (sin ORIGINAL): 9 columnas. */
const DEFAULT_COLUMN_ORDER_TAIL: GestionesColumn[] = [
    "fecha",
    "vuelo",
    "dep",
    "arr",
    "cambio",
    "std",
    "sta",
    "etd",
    "eta",
];

/** TAIL + ETD/ETA + NEW ARR (sin STD/STA): 8 columnas. */
const DEFAULT_COLUMN_ORDER_TAIL_ROUTE: GestionesColumn[] = [
    "fecha",
    "vuelo",
    "dep",
    "arr",
    "cambio",
    "etd",
    "eta",
    "newArr",
];

function normalizeHeaderCell(s: string): string {
    return s
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9._]/g, "");
}

/** Une celdas “NEW” + “ARR”/“DEP” cuando el pegado horizontal separó el encabezado. */
function mergeMultiWordRouteHeaders(cells: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < cells.length; i++) {
        const cur = cells[i].trim();
        const curU = normalizeHeaderCell(cur);
        const nextU = normalizeHeaderCell(cells[i + 1] ?? "");
        if (curU === "NEW" && (nextU === "ARR" || nextU === "DEP")) {
            out.push(`${cur} ${cells[i + 1].trim()}`);
            i++;
        } else {
            out.push(cur);
        }
    }
    return out;
}

function mapHeaderToColumn(cell: string): GestionesColumn | null {
    const key = normalizeHeaderCell(cell);
    if (!key) return null;
    if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
    if (key.includes("FECHA")) return "fecha";
    if (key.includes("VUELO") || key === "FLT") return "vuelo";
    if (key === "TAIL" || key === "REG" || key.includes("MATRIC") || key.includes("TAIL")) return "cambio";
    if (key === "NEWARR" || (key.startsWith("NEW") && key.includes("ARR"))) return "newArr";
    if (key === "NEWDEP" || (key.startsWith("NEW") && key.includes("DEP"))) return "newDep";
    if (key.includes("CANCEL") || key.includes("ANULA")) return "cancelado";
    if (key.includes("MOTIV")) return "motivo";
    return null;
}

/** Divide una línea en celdas: tabs primero; si no, 2+ espacios. */
export function splitTableLine(line: string): string[] {
    const t = line.trim();
    if (!t) return [];
    if (line.includes("\t")) {
        return line.split("\t").map((c) => c.trim());
    }
    return line
        .trim()
        .split(/\s{2,}|\s+(?=[A-Z]{2,3}\d)/)
        .map((c) => c.trim())
        .filter(Boolean);
}

/** Versión más tolerante: tabs o 2+ espacios. */
export function splitTableLineLoose(line: string): string[] {
    const t = line.trim();
    if (!t) return [];
    if (line.includes("\t")) {
        return line.split("\t").map((c) => c.trim());
    }
    const parts = line.trim().split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (parts.length >= 4) return parts;
    return line.trim().split(/\s+/).map((c) => c.trim()).filter(Boolean);
}

export function normalizeTimeToken(s: string): string {
    const t = String(s ?? "")
        .trim()
        .replace(/\bLT\b/gi, "")
        .replace(/\+\d+$/i, "")
        .replace(/\s+/g, "")
        .replace(/Z$/i, "");
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
        const h = m[1].padStart(2, "0");
        return `${h}:${m[2]}`;
    }
    const digits = t.replace(/\D/g, "");
    if (digits.length >= 3) {
        const mm = digits.slice(-2);
        const hh = digits.slice(0, -2);
        if (hh.length <= 2) return `${hh.padStart(2, "0")}:${mm}`;
    }
    return String(s ?? "").trim();
}

/** Convierte fecha de celda a YYYY-MM-DD */
export function parseDateToIso(raw: string): string | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
        const d = m[1].padStart(2, "0");
        const mo = m[2].padStart(2, "0");
        const y = m[3];
        return `${y}-${mo}-${d}`;
    }
    return null;
}

/** Clave numérica de vuelo para cruzar WJ3234 vs 3234 */
export function flightNumberKey(flt: string): string {
    const m = String(flt ?? "").match(/\d+/);
    return m ? m[0] : String(flt).trim().toUpperCase();
}

function isProbablyHeaderLine(cells: string[]): boolean {
    if (cells.length < 2) return false;
    let hits = 0;
    for (const c of mergeMultiWordRouteHeaders(cells)) {
        const col = mapHeaderToColumn(c);
        if (col) hits++;
    }
    return hits >= 2;
}

function rowHasDataCells(cells: string[]): boolean {
    const joined = cells.join(" ");
    return /\d{4}-\d{2}-\d{2}/.test(joined) || /\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/.test(joined) || /\b\d{3,5}\b/.test(joined);
}

export interface ParseGestionesResult {
    /** Columnas detectadas (sin duplicar índices en formato horizontal) */
    columns: GestionesColumn[];
    rows: GestionesDataRow[];
    warnings: string[];
}

/**
 * Formato vertical: una etiqueta de columna por línea (FECHA, VUELO, …) y luego
 * los valores en el mismo orden, fila a fila.
 */
function tryParseVerticalGestiones(L: string[]): ParseGestionesResult | null {
    const warnings: string[] = [];
    /** Necesitamos al menos encabezado + 1 fila (p. ej. 10 + 10 líneas, con celdas vacías incluidas). */
    if (L.length < 12) return null;

    const cols: GestionesColumn[] = [];
    let p = 0;
    while (p < L.length && p < 40) {
        const rawLine = L[p];
        const line = rawLine.trim();
        /** Línea vacía: no corta el encabezado ni cuenta como inicio de datos. */
        if (line === "") {
            p++;
            continue;
        }
        if (parseDateToIso(line)) break;
        const col = mapHeaderToColumn(line);
        if (col) {
            cols.push(col);
            p++;
        } else if (cols.length > 0) {
            break;
        } else {
            p++;
        }
    }

    if (cols.length < 4 || !cols.includes("fecha") || !cols.includes("vuelo")) {
        return null;
    }

    const numCols = cols.length;
    let rest = L.slice(p);
    /** Quitar solo líneas vacías *antes* del primer dato (después del bloque de etiquetas). */
    while (rest.length > 0 && rest[0].trim() === "") {
        rest = rest.slice(1);
    }
    if (rest.length < numCols) {
        return null;
    }

    const rows: GestionesDataRow[] = [];
    let rowNum = 0;
    let start = 0;
    while (start < rest.length) {
        while (start < rest.length && rest[start].trim() === "") {
            start++;
        }
        if (start >= rest.length) break;

        const firstCell = rest[start].trim();
        if (!parseDateToIso(firstCell)) {
            warnings.push(
                `Se omite línea que no abre una fila con fecha (¿fila incompleta o texto extra?): “${firstCell.slice(0, 48)}${firstCell.length > 48 ? "…" : ""}”`
            );
            start++;
            continue;
        }

        const chunk = rest.slice(start, start + numCols);
        if (chunk.length < numCols) {
            warnings.push(`Última fila incompleta (${chunk.length}/${numCols} celdas); no se importa.`);
            break;
        }

        rowNum++;
        const raw: Partial<Record<GestionesColumn, string>> = {};
        for (let k = 0; k < numCols; k++) {
            const key = cols[k];
            const val = chunk[k]?.trim() ?? "";
            if (key && val !== "") raw[key] = val;
        }
        rows.push({ rowIndex: rowNum, raw });
        start += numCols;
    }

    if (rows.length === 0) return null;

    warnings.unshift(
        "Formato detectado: encabezados en columna (una etiqueta por línea). Las líneas vacías entre valores se conservan (p. ej. ORIGINAL vacío antes de CAMBIO)."
    );
    return { columns: [...new Set(cols)], rows, warnings };
}

/**
 * Interpreta el texto pegado: vertical, horizontal con encabezado, u orden fijo.
 */
export function parseGestionesTable(text: string): ParseGestionesResult {
    const warnings: string[] = [];
    /** `trim()` por línea pero conservar líneas vacías: en formato vertical son celdas ORIGINAL/CAMBIO vacías. */
    const allLines = text.split(/\r?\n/).map((l) => l.trim());

    if (allLines.every((x) => x === "")) {
        return { columns: [], rows: [], warnings: ["No hay líneas para procesar."] };
    }

    const vertical = tryParseVerticalGestiones(allLines);
    if (vertical && vertical.rows.length > 0) {
        return vertical;
    }

    const L = allLines.filter((x) => x);

    if (L.length === 0) {
        return { columns: [], rows: [], warnings: ["No hay líneas para procesar."] };
    }

    let headerIdx = -1;
    let byIndex: (GestionesColumn | null)[] = [];

    for (let j = 0; j < Math.min(L.length, 8); j++) {
        const cells = splitTableLineLoose(L[j]);
        if (cells.length < 3) continue;
        if (isProbablyHeaderLine(cells)) {
            headerIdx = j;
            byIndex = mergeMultiWordRouteHeaders(cells).map((c) => mapHeaderToColumn(c));
            break;
        }
    }

    let columns: GestionesColumn[] = [];
    let dataStart = 0;

    if (headerIdx >= 0) {
        dataStart = headerIdx + 1;
        columns = byIndex.filter((c): c is GestionesColumn => c != null);
    } else {
        const first = splitTableLineLoose(L[0]);
        if (first.length >= 8) {
            const order =
                first.length === 8
                    ? DEFAULT_COLUMN_ORDER_TAIL_ROUTE
                    : first.length === 9
                      ? DEFAULT_COLUMN_ORDER_TAIL
                      : DEFAULT_COLUMN_ORDER;
            warnings.push(
                first.length === 8
                    ? "No se detectó fila de encabezados; se asume orden: FECHA, VUELO, DEP, ARR, TAIL, ETD, ETA, NEW ARR."
                    : first.length === 9
                      ? "No se detectó fila de encabezados; se asume orden: FECHA, VUELO, DEP, ARR, TAIL, STD, STA, ETD, ETA."
                      : "No se detectó fila de encabezados; se asume orden: FECHA, VUELO, DEP, ARR, ORIGINAL, CAMBIO, STD, STA, ETD, ETA."
            );
            byIndex = first.map((_, i) => order[i] ?? null);
            columns = order.slice(0, first.length);
            dataStart = 0;
        } else {
            return { columns: [], rows: [], warnings: ["No se pudo interpretar la tabla. Pegá con tabuladores o usá el formato con encabezados FECHA / VUELO / …"] };
        }
    }

    const rows: GestionesDataRow[] = [];
    let rowNum = 0;

    for (let j = dataStart; j < L.length; j++) {
        const line = L[j];
        const cells = splitTableLineLoose(line);
        if (cells.length === 0) continue;
        if (isProbablyHeaderLine(cells) && !rowHasDataCells(cells)) continue;

        rowNum++;
        const raw: Partial<Record<GestionesColumn, string>> = {};
        const n = Math.max(cells.length, byIndex.length);
        for (let k = 0; k < n; k++) {
            const col = byIndex[k];
            const val = cells[k];
            if (col && val !== undefined && val !== "") {
                raw[col] = val;
            }
        }
        rows.push({ rowIndex: rowNum, raw });
    }

    if (!columns.includes("fecha")) {
        columns = [...new Set(Object.values(byIndex).filter((c): c is GestionesColumn => c != null))];
    }
    if (!columns.some((c) => c === "fecha") || !columns.some((c) => c === "vuelo")) {
        warnings.push("Convención: deben existir columnas FECHA y VUELO (o el orden por defecto de 10 columnas).");
    }

    return { columns, rows, warnings };
}

export function findFlightForGestiones(flights: Flight[], row: GestionesDataRow): Flight | undefined {
    const iso = row.raw.fecha ? parseDateToIso(row.raw.fecha) : null;
    const fltKey = row.raw.vuelo ? flightNumberKey(row.raw.vuelo) : "";
    if (!iso || !fltKey) return undefined;

    const dep = row.raw.dep?.trim().toUpperCase();
    const arr = row.raw.arr?.trim().toUpperCase();

    const candidates = flights.filter((f) => {
        const d = flightDateToIso(f);
        if (d !== iso) return false;
        if (flightNumberKey(f.flt) !== fltKey) return false;
        return true;
    });

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    if (dep && arr) {
        const x = candidates.find((f) => f.dep?.toUpperCase() === dep && f.arr?.toUpperCase() === arr);
        if (x) return x;
    }
    return candidates[0];
}

function parseCancelToken(s: string | undefined): boolean {
    if (!s) return false;
    const u = s.trim().toUpperCase();
    return ["SI", "SÍ", "S", "1", "X", "CANCEL", "CANCELADO", "SI.", "YES"].includes(u) || u.includes("CANCEL");
}

/** Aplica una fila parseada sobre una copia del vuelo. */
export function applyGestionesRowToFlight(
    flight: Flight,
    row: GestionesDataRow,
    opts: { syncStdSta: boolean; defaultRescheduleReason: string }
): Flight {
    const { syncStdSta, defaultRescheduleReason } = opts;
    let next: Flight = { ...flight };

    const regNuevo = row.raw.cambio?.trim();
    if (regNuevo) {
        next.reg = regNuevo.toUpperCase();
    }

    if (syncStdSta) {
        if (row.raw.std?.trim()) next.std = normalizeTimeToken(row.raw.std);
        if (row.raw.sta?.trim()) next.sta = normalizeTimeToken(row.raw.sta);
    }

    const etd = row.raw.etd?.trim();
    if (etd) {
        next.etd = normalizeTimeToken(etd);
        if (!next.rescheduleReason?.trim()) {
            next.rescheduleReason = defaultRescheduleReason;
        }
    }

    const eta = row.raw.eta?.trim();
    if (eta) {
        const prev = normalizeMvtData(next.mvtData);
        next.mvtData = mergeMvtDataForPersist(prev, {
            ...prev,
            eta: normalizeTimeToken(eta),
        });
    }

    const newDep = row.raw.newDep?.trim();
    const newArr = row.raw.newArr?.trim();
    if (newDep) {
        next.dep = normalizeAirportCode(newDep);
    }
    if (newArr) {
        next.arr = normalizeAirportCode(newArr);
    }
    if (newDep || newArr) {
        next.route = `${normalizeAirportCode(next.dep)}-${normalizeAirportCode(next.arr)}`;
    }

    const motivoFila = row.raw.motivo?.trim();
    if (parseCancelToken(row.raw.cancelado)) {
        next.cancelled = true;
        next.cancellationReason = motivoFila || defaultRescheduleReason || "Gestión (pegado)";
    }

    return next;
}

export function gestionesRowHasRouteChange(row: GestionesDataRow): boolean {
    return !!(row.raw.newDep?.trim() || row.raw.newArr?.trim());
}
