import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export function deleteAppUserErrorMessage(code: string | undefined): string {
    switch (code) {
        case "functions/permission-denied":
            return "No tenés permiso para eliminar usuarios.";
        case "functions/not-found":
            return "La función no está desplegada. Ejecutá: npm run firebase:deploy-functions";
        case "functions/unauthenticated":
            return "Debés iniciar sesión.";
        case "functions/invalid-argument":
            return "Usuario inválido.";
        case "functions/internal":
            return "No se pudo eliminar la cuenta en Firebase Authentication.";
        default:
            return "No se pudo eliminar el usuario. Verificá que las Cloud Functions estén desplegadas.";
    }
}

/** Elimina usuario en Auth + perfil en Realtime Database (solo ADMIN/AJS). */
export async function deleteAppUser(targetUid: string): Promise<void> {
    const fn = httpsCallable<{ targetUid: string }, { ok: boolean }>(functions, "deleteAppUser");
    await fn({ targetUid });
}
