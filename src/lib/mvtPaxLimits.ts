import { getAircraftInfo } from "./fleetData";

export const MVT_MAX_PAX_A320 = 186;
export const MVT_MAX_PAX_A321 = 240;

/** Máximo PAX del MVT según matrícula (INF aparte). */
export function getMvtMaxPax(reg: string | undefined | null): number | null {
    const ac = getAircraftInfo(reg);
    if (!ac) return null;
    return ac.model.includes("321") ? MVT_MAX_PAX_A321 : MVT_MAX_PAX_A320;
}

export function getMvtMaxPaxLabel(reg: string | undefined | null): string | null {
    const ac = getAircraftInfo(reg);
    if (!ac) return null;
    const max = ac.model.includes("321") ? MVT_MAX_PAX_A321 : MVT_MAX_PAX_A320;
    const family = ac.model.includes("321") ? "A321" : "A320";
    return `Máx. ${max} PAX (${family}, INF aparte)`;
}

export function validateMvtPax(
    paxActual: string | undefined | null,
    reg: string | undefined | null,
): { ok: true } | { ok: false; message: string; max: number } {
    const max = getMvtMaxPax(reg);
    if (max == null) return { ok: true };

    const raw = String(paxActual ?? "").replace(/\D/g, "");
    if (!raw) return { ok: true };

    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n <= max) return { ok: true };

    const ac = getAircraftInfo(reg);
    const family = ac?.model.includes("321") ? "A321" : "A320";
    return {
        ok: false,
        max,
        message: `PAX no puede superar ${max} en ${family} (matrícula ${String(reg ?? "").trim() || "—"}). Los INF van aparte.`,
    };
}
