import type { Flight } from "../types";
import { normalizeMvtData } from "./flightDataNormalize";

const PREFIX = "smartops-mvt-draft-v1-";

export function mvtDraftStorageKey(flightId: string): string {
    return `${PREFIX}${flightId}`;
}

/**
 * Estado inicial del formulario MVT: si en servidor ya hay ATD (MVT enviado), manda el servidor y borra borrador local.
 * Si no, restaura borrador del navegador si existe.
 */
export function getInitialMvtFormData(flight: Flight): NonNullable<Flight["mvtData"]> {
    const server = normalizeMvtData(flight.mvtData);
    const hasSubmittedAtd = (server.atd ?? "").length >= 3;
    if (hasSubmittedAtd) {
        try {
            localStorage.removeItem(mvtDraftStorageKey(flight.id));
        } catch {
            /* ignore */
        }
        return server;
    }
    try {
        const raw = localStorage.getItem(mvtDraftStorageKey(flight.id));
        if (raw) {
            const parsed = JSON.parse(raw) as Flight["mvtData"];
            return normalizeMvtData(parsed);
        }
    } catch {
        /* ignore */
    }
    return server;
}

export function persistMvtDraft(flightId: string, data: NonNullable<Flight["mvtData"]>): void {
    try {
        localStorage.setItem(mvtDraftStorageKey(flightId), JSON.stringify(data));
    } catch {
        /* quota / modo privado */
    }
}

export function clearMvtDraft(flightId: string): void {
    try {
        localStorage.removeItem(mvtDraftStorageKey(flightId));
    } catch {
        /* ignore */
    }
}
