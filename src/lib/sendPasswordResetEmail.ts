import { sendPasswordResetEmail as firebaseSendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";

export function passwordResetEmailErrorMessage(code: string | undefined): string {
    switch (code) {
        case "auth/user-not-found":
            return "No hay cuenta de acceso con ese correo en Firebase.";
        case "auth/invalid-email":
            return "Email inválido.";
        case "auth/too-many-requests":
            return "Demasiados intentos. Intente más tarde.";
        default:
            return "No se pudo enviar el correo de recuperación.";
    }
}

/** Envía enlace de restablecimiento al correo del usuario (plan Spark, sin Cloud Functions). */
export async function sendUserPasswordResetEmail(email: string): Promise<void> {
    await firebaseSendPasswordResetEmail(auth, email.trim().toLowerCase());
}
