import type { DiferidoEntry } from "../types";

export function normalizeRegDiferido(reg: string): string {
    return String(reg ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

export function coerceDiferido(raw: unknown): DiferidoEntry {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
        text: String(o.text ?? "").trim(),
        updatedAt: o.updatedAt != null ? String(o.updatedAt) : undefined,
        updatedBy: o.updatedBy != null ? String(o.updatedBy) : undefined,
    };
}

export function getDiferidoTextForReg(map: Record<string, DiferidoEntry>, reg: string | undefined | null): string | undefined {
    const k = normalizeRegDiferido(String(reg ?? ""));
    if (!k) return undefined;
    const t = map[k]?.text?.trim();
    return t || undefined;
}
