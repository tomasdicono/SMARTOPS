import type { Flight } from "../types";
import { validateMvtPax } from "./mvtPaxLimits";
import { validateMvtSendRequired } from "./mvtRequiredFields";
import { validateMvtSendDelays } from "./mvtTime";

type MvtPayload = NonNullable<Flight["mvtData"]>;

export type MvtSendGateResult =
    | { ok: true }
    | { ok: false; message: string };

export interface MvtSendGateInput {
    mvt: MvtPayload;
    std: string;
    reg: string | undefined | null;
    /** Corrección HCC post-envío: solo demoras, sin campos obligatorios ni PAX. */
    delayOnlyMode: boolean;
    userRole?: import("../types").UserRole;
}

/** Única validación para habilitar envío / guardar MVT en el formulario. */
export function evaluateMvtSendGate(input: MvtSendGateInput): MvtSendGateResult {
    const { mvt, std, reg, delayOnlyMode } = input;

    const delayCheck = validateMvtSendDelays(
        std,
        mvt.atd,
        mvt.dlyCod1,
        mvt.dlyTime1,
        mvt.dlyCod2,
        mvt.dlyTime2,
    );

    if (delayOnlyMode) {
        if (delayCheck.ok && (mvt.dlyCod1 === "66" || mvt.dlyCod2 === "66")) {
            if (!mvt.briefingPhoto || mvt.briefingPhoto.trim() === "") {
                return { ok: false, message: "Con el código de demora 66 es obligatorio adjuntar la foto del briefing operacional." };
            }
        }
        return delayCheck.ok ? { ok: true } : { ok: false, message: delayCheck.message };
    }

    const requiredCheck = validateMvtSendRequired(mvt);
    if (!requiredCheck.ok) {
        return requiredCheck;
    }

    const paxCheck = validateMvtPax(mvt.paxActual, reg);
    if (!paxCheck.ok) {
        return paxCheck;
    }

    if (!delayCheck.ok) {
        return { ok: false, message: delayCheck.message };
    }

    if (mvt.dlyCod1 === "66" || mvt.dlyCod2 === "66") {
        if (!mvt.briefingPhoto || mvt.briefingPhoto.trim() === "") {
            return { ok: false, message: "Con el código de demora 66 es obligatorio adjuntar la foto del briefing operacional." };
        }
    }

    return { ok: true };
}
