export function loginErrorMessage(err: unknown): string {
    const code =
        err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    const msg = err instanceof Error ? err.message : String(err ?? "");

    if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        return "Correo o contraseña incorrectos. Si recreaste el usuario, usá la contraseña temporal que te dio el administrador.";
    }
    if (code === "auth/too-many-requests") {
        return "Demasiados intentos fallidos. Esperá 15–60 minutos y volvé a probar, o pedile a un administrador que envíe recuperación de contraseña desde Gestión de usuarios.";
    }
    if (code === "auth/user-disabled") {
        return "Esta cuenta está deshabilitada en Firebase Authentication. Un administrador debe habilitarla en la consola de Firebase.";
    }
    if (msg.includes("permission") || msg.includes("PERMISSION_DENIED")) {
        return "Sin permiso para leer tu perfil en Smartops. Contactá a un administrador (reglas de Firebase en users/{tu uid}).";
    }
    return "Ocurrió un error al iniciar sesión. Probá de nuevo en unos minutos.";
}

export const PROFILE_NOT_IN_SMARTOPS_MESSAGE =
    "La contraseña en Firebase es válida, pero no hay perfil en Smartops para esta cuenta. " +
    "Un administrador debe: (1) buscar el correo en Gestión de usuarios y eliminar el perfil viejo si aparece; " +
    "(2) borrar el usuario en Firebase Console → Authentication si hace falta; " +
    "(3) crear el usuario de nuevo solo desde Gestión de usuarios en Smartops (no solo en la consola de Firebase).";
