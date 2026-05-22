import type { Flight } from "../types";
import { normalizeMvtData } from "./flightDataNormalize";

const PREFIX = "smartops-mvt-draft-v1-";

export function mvtDraftStorageKey(flightId: string): string {
    return `${PREFIX}${flightId}`;
}

/** Lee borrador legacy (antes del auto-guardado en Firebase). */
export function readLegacyMvtDraft(flightId: string): NonNullable<Flight["mvtData"]> | null {
    try {
        const raw = localStorage.getItem(mvtDraftStorageKey(flightId));
        if (!raw) return null;
        return normalizeMvtData(JSON.parse(raw) as Flight["mvtData"]);
    } catch {
        return null;
    }
}

export function clearMvtDraft(flightId: string): void {
    try {
        localStorage.removeItem(mvtDraftStorageKey(flightId));
    } catch {
        /* ignore */
    }
}
