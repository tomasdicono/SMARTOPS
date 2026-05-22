export interface Aircraft {
    registration: string;
    model: string;
    capacity: number;
}

export type FleetModelOption = "A320-232" | "A320-271" | "A321-271";

export const FLEET_MODEL_OPTIONS: { value: FleetModelOption; label: string }[] = [
    { value: "A320-232", label: "A320-232" },
    { value: "A320-271", label: "A320-271" },
    { value: "A321-271", label: "A321-271" },
];

const rawData: [string, FleetModelOption][] = [
    ["CC-AWA", "A320-232"], ["CC-AWC", "A320-232"], ["CC-AWE", "A320-232"], ["CC-AWJ", "A320-271"],
    ["CC-AWK", "A320-271"], ["CC-AWL", "A320-271"], ["CC-AWN", "A320-271"], ["CC-AWO", "A320-271"],
    ["CC-AWQ", "A320-271"], ["CC-AWR", "A320-271"], ["CC-AWS", "A321-271"], ["CC-AWT", "A321-271"],
    ["CC-AWU", "A321-271"], ["CC-AWV", "A320-271"], ["CC-AWW", "A321-271"], ["CC-AWX", "A320-271"],
    ["CC-AWY", "A321-271"], ["CC-AWZ", "A320-271"], ["CC-DIA", "A320-271"], ["CC-DIB", "A321-271"],
    ["CC-DIC", "A321-271"], ["CC-DID", "A320-271"], ["CC-DIE", "A321-271"], ["CC-DIF", "A321-271"],
    ["CC-DIG", "A320-271"], ["CC-DIH", "A320-271"], ["CC-DII", "A320-271"], ["CC-DIJ", "A320-271"],
    ["CC-DIK", "A320-271"], ["CC-DIL", "A320-271"], ["CC-DIM", "A320-271"], ["CC-DIN", "A320-271"],
    ["CC-DIO", "A320-271"], ["CC-DIP", "A320-271"], ["CC-DIQ", "A321-271"], ["CC-DIR", "A320-271"],
    ["CC-DIS", "A321-271"], ["CC-DIT", "A320-271"], ["CC-DIU", "A320-271"], ["CC-DIV", "A320-271"],
    ["CC-DIW", "A320-271"], ["CC-DIX", "A320-271"], ["LV-HEK", "A320-232"], ["LV-HVT", "A320-232"],
    ["LV-IVN", "A320-232"], ["LV-IVO", "A320-232"], ["LV-JQE", "A320-232"], ["LV-KDP", "A320-232"],
    ["LV-KFX", "A320-232"], ["LV-KJA", "A320-232"],
];

function capacityForModel(model: string): number {
    return model.includes("321") ? 240 : 186;
}

export function normalizeFleetReg(reg: string): string {
    return String(reg ?? "").trim().toUpperCase();
}

export function coerceFleetModel(model: unknown): FleetModelOption | null {
    const m = String(model ?? "").trim().toUpperCase();
    if (m.includes("321")) return "A321-271";
    if (m.includes("232")) return "A320-232";
    if (m.includes("320")) return "A320-271";
    return null;
}

export function buildAircraft(reg: string, model: FleetModelOption | string): Aircraft {
    const registration = normalizeFleetReg(reg);
    const modelNorm = coerceFleetModel(model) ?? "A320-271";
    return {
        registration,
        model: modelNorm,
        capacity: capacityForModel(modelNorm),
    };
}

function buildDefaultFleet(): Record<string, Aircraft> {
    const out: Record<string, Aircraft> = {};
    for (const [reg, model] of rawData) {
        out[normalizeFleetReg(reg)] = buildAircraft(reg, model);
    }
    return out;
}

/** Flota en memoria (base + overrides Firebase). */
export const FLEET_DATA: Record<string, Aircraft> = buildDefaultFleet();

function replaceFleetData(next: Record<string, Aircraft>): void {
    for (const key of Object.keys(FLEET_DATA)) {
        delete FLEET_DATA[key];
    }
    Object.assign(FLEET_DATA, next);
}

/** Mezcla flota base con `fleet/{matrícula}` en Realtime Database. */
export function applyFleetFromFirebase(data: Record<string, unknown> | null): void {
    const merged = buildDefaultFleet();
    if (data && typeof data === "object") {
        for (const [regKey, raw] of Object.entries(data)) {
            if (!raw || typeof raw !== "object") continue;
            const model = coerceFleetModel((raw as { model?: unknown }).model);
            const reg = normalizeFleetReg(regKey);
            if (!reg || !model) continue;
            merged[reg] = buildAircraft(reg, model);
        }
    }
    replaceFleetData(merged);
}

export function getAircraftInfo(reg: string | undefined | null): Aircraft | null {
    if (reg == null || String(reg).trim() === "") return null;
    return FLEET_DATA[normalizeFleetReg(reg)] || null;
}

export function listFleetAircraftSorted(): Aircraft[] {
    return Object.values(FLEET_DATA).sort((a, b) => a.registration.localeCompare(b.registration));
}

export function fleetFamilyLabel(model: string): "A320" | "A321" {
    return model.includes("321") ? "A321" : "A320";
}

export function fleetRegExists(reg: string): boolean {
    return normalizeFleetReg(reg) in FLEET_DATA;
}
