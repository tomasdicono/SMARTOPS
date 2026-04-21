import type { Flight } from "../types";
import { flightNeedsCleaningWarning } from "./flightHelpers";
import { isPernocteLastJesSector } from "./pernocteHelpers";
import {
    LIMPIEZA_CHECKLIST_TASKS,
    type LimpiezaChecklistMode,
    type LimpiezaChecklistTaskDef,
} from "./limpiezaChecklistData";

export type { LimpiezaChecklistMode };

/** Trámite ANEXO A: pernocte gana sobre tránsito si ambos aplican. */
export function getLimpiezaChecklistMode(
    f: Flight,
    dayFlights: Flight[],
    selectedIso: string
): LimpiezaChecklistMode | null {
    if (f.cancelled || !String(selectedIso).trim()) return null;
    if (isPernocteLastJesSector(f, dayFlights, selectedIso)) return "pernocte";
    if (flightNeedsCleaningWarning(f)) return "transito";
    return null;
}

export function getTasksForLimpiezaMode(mode: LimpiezaChecklistMode): LimpiezaChecklistTaskDef[] {
    return LIMPIEZA_CHECKLIST_TASKS.filter((t) => {
        if (mode === "pernocte") return t.pernocte;
        return t.transito === "si" || t.transito === "foco";
    });
}

export function buildDefaultItemsForMode(mode: LimpiezaChecklistMode): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const t of getTasksForLimpiezaMode(mode)) {
        out[t.id] = false;
    }
    return out;
}

export function mergeChecklistItems(
    mode: LimpiezaChecklistMode,
    stored: Record<string, boolean> | undefined
): Record<string, boolean> {
    const defaults = buildDefaultItemsForMode(mode);
    if (!stored || typeof stored !== "object") return defaults;
    for (const id of Object.keys(defaults)) {
        if (typeof stored[id] === "boolean") defaults[id] = stored[id];
    }
    return defaults;
}

/** Todos los ítems del modo actual están marcados (checklist completo). */
export function areAllLimpiezaChecklistItemsDone(
    items: Record<string, boolean>,
    mode: LimpiezaChecklistMode
): boolean {
    const taskIds = getTasksForLimpiezaMode(mode).map((t) => t.id);
    if (taskIds.length === 0) return false;
    return taskIds.every((id) => items[id] === true);
}
