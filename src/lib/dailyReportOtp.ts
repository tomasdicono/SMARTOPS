import { ref, set } from "firebase/database";
import { db } from "./firebase";

/** OTP 0 / OTP 15 ingresados a mano para el PDF del reporte diario (por fecha). */
export interface DailyReportOtp {
    otp0: string;
    otp15: string;
}

export function emptyDailyReportOtp(): DailyReportOtp {
    return { otp0: "", otp15: "" };
}

export function coerceDailyReportOtp(raw: unknown): DailyReportOtp {
    if (!raw || typeof raw !== "object") return emptyDailyReportOtp();
    const o = raw as Record<string, unknown>;
    return {
        otp0: String(o.otp0 ?? "").trim(),
        otp15: String(o.otp15 ?? "").trim(),
    };
}

/** Normaliza a texto tipo `87.5%` para PDF; null si vacío o inválido. */
export function formatOtpPercentForReport(raw: string): string | null {
    const s = String(raw ?? "")
        .trim()
        .replace(",", ".")
        .replace(/%/g, "");
    if (!s) return null;
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return `${n.toFixed(1)}%`;
}

export function isDailyReportOtpComplete(otp: DailyReportOtp): boolean {
    return formatOtpPercentForReport(otp.otp0) != null && formatOtpPercentForReport(otp.otp15) != null;
}

export async function saveDailyReportOtp(dateIso: string, otp: DailyReportOtp): Promise<void> {
    const iso = String(dateIso ?? "").trim();
    if (!iso) return;
    await set(ref(db, `dailyReportOtp/${iso}`), {
        otp0: String(otp.otp0 ?? "").trim(),
        otp15: String(otp.otp15 ?? "").trim(),
    });
}

/** Mensaje legible según el error de Firebase al persistir OTP. */
export function dailyReportOtpSaveErrorMessage(err: unknown): string {
    const code = (err as { code?: string })?.code;
    if (code === "PERMISSION_DENIED") {
        return "Sin permiso en Firebase para guardar OTP (ruta dailyReportOtp). El administrador debe desplegar las reglas: npm run firebase:deploy-rules";
    }
    if (code === "NETWORK_ERROR" || code === "UNAVAILABLE") {
        return "Sin conexión con el servidor. Los valores sirven para el PDF en esta pantalla, pero no se guardaron para otros usuarios.";
    }
    return "No se pudo guardar OTP 0 / OTP 15. Revisá la conexión.";
}
