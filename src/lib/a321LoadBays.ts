import type { Flight } from "../types";
import { getAircraftInfo } from "./fleetData";

/** Familia Airbus con layout LDM por posición en MVT. */
export type LoadBayFamily = "A320" | "A321";

export const A320_BAY_GROUPS: { title: string; codes: string[] }[] = [
    { title: "Delantera", codes: ["11", "12", "13"] },
    { title: "Trasera", codes: ["31", "32", "41", "42"] },
    { title: "Bulk", codes: ["51", "52", "53"] },
];

export const A321_BAY_GROUPS: { title: string; codes: string[] }[] = [
    { title: "Delantera", codes: ["11", "12", "21", "22", "23"] },
    { title: "Trasera", codes: ["31", "32", "33", "41", "42"] },
    { title: "Bulk", codes: ["51", "52", "53"] },
];

export const A320_BAY_CODES = A320_BAY_GROUPS.flatMap((g) => g.codes);
export const A321_BAY_CODES = A321_BAY_GROUPS.flatMap((g) => g.codes);

const UNION_BAY_CODES = [...new Set([...A320_BAY_CODES, ...A321_BAY_CODES])];

export function loadBaysFamilyFromReg(reg: string | undefined | null): LoadBayFamily | null {
    const ac = getAircraftInfo(reg);
    if (!ac) return null;
    if (ac.model.includes("321")) return "A321";
    if (ac.model.includes("320") && !ac.model.includes("321")) return "A320";
    return null;
}

/** Suma de PCS cargados en todas las posiciones del layout. */
export function sumLoadBaysForFamily(merged: Record<string, string>, family: LoadBayFamily): number {
    const codes = family === "A321" ? A321_BAY_CODES : A320_BAY_CODES;
    let s = 0;
    for (const c of codes) {
        const raw = String(merged[c] ?? "").trim();
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n)) s += n;
    }
    return s;
}

export function mergeLoadBays(raw: Record<string, string> | null | undefined, family: LoadBayFamily): Record<string, string> {
    const codes = family === "A321" ? A321_BAY_CODES : A320_BAY_CODES;
    const base = Object.fromEntries(codes.map((c) => [c, ""]));
    if (!raw) return base;
    for (const c of codes) {
        const v = raw[c];
        base[c] = v == null ? "" : String(v).trim();
    }
    return base;
}

function mergeLoadBaysUnion(raw: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const c of UNION_BAY_CODES) {
        const v = raw[c];
        merged[c] = v == null ? "" : String(v).trim();
    }
    return merged;
}

function loadBaysUnionHasAnyValue(merged: Record<string, string>): boolean {
    return UNION_BAY_CODES.some((c) => merged[c].trim() !== "");
}

/**
 * Heurística si no hay matrícula: claves propias de cada layout.
 */
export function inferLoadBaysFamily(merged: Record<string, string>): LoadBayFamily {
    const has321Only = ["21", "22", "23", "33"].some((c) => merged[c]?.trim());
    if (has321Only) return "A321";
    const has320Only = ["13"].some((c) => merged[c]?.trim());
    if (has320Only) return "A320";
    return "A320";
}

/**
 * Desde Firebase / borrador: claves por posición; si todo vacío → no persistir.
 */
export function normalizeLoadBays(raw: unknown): Record<string, string> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const merged = mergeLoadBaysUnion(raw as Record<string, string>);
    return loadBaysUnionHasAnyValue(merged) ? merged : undefined;
}

/**
 * LOAD operativo por posición LDM, p. ej. `POS12//32PCS  POS11//20PCS`
 * (orden: delantera → trasera → bulk según layout A320/A321).
 */
export function formatLoadBaysForMessage(loadBays: Record<string, string>, family: LoadBayFamily): string {
    const groups = family === "A321" ? A321_BAY_GROUPS : A320_BAY_GROUPS;
    const parts: string[] = [];
    for (const g of groups) {
        for (const c of g.codes) {
            const v = loadBays[c]?.trim();
            if (!v) continue;
            const onlyDigits = /^\d+$/.test(v);
            parts.push(onlyDigits ? `POS${c}//${v}PCS` : `POS${c}//${v}`);
        }
    }
    return parts.join("  ");
}

/** Una sola línea LOAD para mensajes (bodegas o campo libre). */
export function mvtLoadLineForMessage(
    m: Pick<NonNullable<Flight["mvtData"]>, "load" | "loadBays">,
    reg?: string | null,
): string {
    if (m.loadBays && typeof m.loadBays === "object") {
        const merged = normalizeLoadBays(m.loadBays);
        if (merged) {
            const fam = loadBaysFamilyFromReg(reg ?? undefined) ?? inferLoadBaysFamily(merged);
            const formatted = formatLoadBaysForMessage(merged, fam);
            if (formatted) return formatted;
        }
    }
    return (m.load ?? "").trim();
}
