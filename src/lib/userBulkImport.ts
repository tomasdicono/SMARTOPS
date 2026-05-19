import type { UserRole } from "../types";
import { normalizeUserRole } from "../types";

export interface BulkUserRow {
    /** Fila en el Excel (1-based, incluye encabezado) */
    rowNumber: number;
    name: string;
    email: string;
    password: string;
    role: UserRole;
}

export interface BulkUserParseError {
    rowNumber: number;
    message: string;
}

export interface BulkUserParseResult {
    rows: BulkUserRow[];
    errors: BulkUserParseError[];
}

type UserBulkColumn = "name" | "email" | "password" | "role";

const HEADER_ALIASES: Record<string, UserBulkColumn> = {
    NOMBRE: "name",
    NAME: "name",
    EMAIL: "email",
    CORREO: "email",
    MAIL: "email",
    CONTRASENA: "password",
    PASSWORD: "password",
    CLAVE: "password",
    CLAVETEMPORAL: "password",
    CONTRASEÑATEMPORAL: "password",
    ROL: "role",
    ROLE: "role",
    ROLOPERATIVO: "role",
    ROL_OPERATIVO: "role",
};

function normalizeHeaderCell(s: string): string {
    return s
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9_]/g, "");
}

function mapHeaderToColumn(cell: string): UserBulkColumn | null {
    const key = normalizeHeaderCell(cell);
    return HEADER_ALIASES[key] ?? null;
}

function cellToString(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "number") {
        if (Number.isInteger(value) && Math.abs(value) >= 1e9) {
            return String(Math.trunc(value));
        }
        return String(value);
    }
    return String(value).trim();
}

function parseRoleFromCell(raw: string): UserRole {
    const trimmed = raw.trim();
    if (!trimmed) return "CREW";
    const token = trimmed.toUpperCase().split(/[\s(/\-,;]+/)[0];
    return normalizeUserRole(token);
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Primera fila = encabezados con columnas Nombre, Email, Contraseña, Rol operativo.
 */
export function parseUserBulkSheet(rows: unknown[][]): BulkUserParseResult {
    const errors: BulkUserParseError[] = [];
    const parsed: BulkUserRow[] = [];

    if (!rows.length) {
        return { rows: [], errors: [{ rowNumber: 1, message: "El archivo está vacío." }] };
    }

    const headerRow = rows[0] ?? [];
    const columnIndex: Partial<Record<UserBulkColumn, number>> = {};

    headerRow.forEach((cell, idx) => {
        const col = mapHeaderToColumn(cellToString(cell));
        if (col && columnIndex[col] === undefined) {
            columnIndex[col] = idx;
        }
    });

    const missing: string[] = [];
    if (columnIndex.name === undefined) missing.push("Nombre");
    if (columnIndex.email === undefined) missing.push("Email");
    if (columnIndex.password === undefined) missing.push("Contraseña");
    if (columnIndex.role === undefined) missing.push("Rol operativo");

    if (missing.length) {
        return {
            rows: [],
            errors: [
                {
                    rowNumber: 1,
                    message: `Faltan columnas: ${missing.join(", ")}. Usá: Nombre, Email, Contraseña, Rol operativo.`,
                },
            ],
        };
    }

    const seenEmails = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const rowNumber = i + 1;

        const name = cellToString(row[columnIndex.name!]);
        const email = cellToString(row[columnIndex.email!]).toLowerCase();
        const password = cellToString(row[columnIndex.password!]);
        const roleRaw = cellToString(row[columnIndex.role!]);

        if (!name && !email && !password && !roleRaw) continue;

        if (!name) {
            errors.push({ rowNumber, message: "Nombre vacío." });
            continue;
        }
        if (!email) {
            errors.push({ rowNumber, message: "Email vacío." });
            continue;
        }
        if (!isValidEmail(email)) {
            errors.push({ rowNumber, message: `Email inválido: ${email}` });
            continue;
        }
        if (seenEmails.has(email)) {
            errors.push({ rowNumber, message: `Email duplicado en el archivo: ${email}` });
            continue;
        }
        seenEmails.add(email);

        if (!password) {
            errors.push({ rowNumber, message: "Contraseña vacía." });
            continue;
        }
        if (password.length < 6) {
            errors.push({ rowNumber, message: "La contraseña debe tener al menos 6 caracteres." });
            continue;
        }
        if (!roleRaw.trim()) {
            errors.push({ rowNumber, message: "Rol operativo vacío." });
            continue;
        }

        parsed.push({
            rowNumber,
            name,
            email,
            password,
            role: parseRoleFromCell(roleRaw),
        });
    }

    if (!parsed.length && !errors.length) {
        errors.push({ rowNumber: 2, message: "No hay filas de datos debajo del encabezado." });
    }

    return { rows: parsed, errors };
}

export function authErrorMessage(code: string | undefined): string {
    switch (code) {
        case "auth/email-already-in-use":
            return "El correo ya está en uso.";
        case "auth/weak-password":
            return "La contraseña debe tener al menos 6 caracteres.";
        case "auth/invalid-email":
            return "Email inválido.";
        default:
            return "Error al crear el usuario.";
    }
}
