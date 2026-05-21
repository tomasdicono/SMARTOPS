import type { Flight } from "../types";

type MvtPayload = NonNullable<Flight["mvtData"]>;

function isTimeFieldFilled(value: string | undefined | null): boolean {
    return String(value ?? "").replace(/\D/g, "").length >= 3;
}

function isNumericFieldFilled(value: string | undefined | null): boolean {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length > 0;
}

function isTextFieldFilled(value: string | undefined | null): boolean {
    return String(value ?? "").trim() !== "";
}

const REQUIRED_CHECKS: { label: string; test: (m: MvtPayload) => boolean }[] = [
    { label: "ATD", test: (m) => isTimeFieldFilled(m.atd) },
    { label: "OFF", test: (m) => isTimeFieldFilled(m.off) },
    { label: "ETA", test: (m) => isTimeFieldFilled(m.eta) },
    { label: "PAX", test: (m) => isNumericFieldFilled(m.paxActual) },
    { label: "INF", test: (m) => isNumericFieldFilled(m.inf) },
    { label: "TOTAL BAGS", test: (m) => isNumericFieldFilled(m.totalBags) },
    { label: "LOAD", test: (m) => isTextFieldFilled(m.load) },
    { label: "FOB", test: (m) => isNumericFieldFilled(m.fob) },
    { label: "Supervisor a cargo", test: (m) => isTextFieldFilled(m.supervisor) },
];

/** Campos obligatorios para enviar o actualizar el MVT (no aplica a corrección HCC post-envío). */
export function validateMvtSendRequired(
    mvt: MvtPayload | undefined | null,
): { ok: true } | { ok: false; message: string } {
    const m = mvt ?? ({} as MvtPayload);
    const missing = REQUIRED_CHECKS.filter((c) => !c.test(m)).map((c) => c.label);

    if (missing.length === 0) return { ok: true };

    return {
        ok: false,
        message: `Completá antes de enviar el MVT: ${missing.join(", ")}.`,
    };
}
