const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");

initializeApp();

const ALLOWED_ADMIN_ROLES = new Set(["ADMIN", "AJS"]);

async function callerRole(uid) {
    const snap = await getDatabase().ref(`users/${uid}/role`).get();
    if (!snap.exists()) return null;
    return String(snap.val()).trim().toUpperCase();
}

exports.deleteAppUser = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Debés iniciar sesión.");
    }

    const role = await callerRole(request.auth.uid);
    if (!role || !ALLOWED_ADMIN_ROLES.has(role)) {
        throw new HttpsError("permission-denied", "Solo ADMIN o AJS pueden eliminar usuarios.");
    }

    const targetUid = request.data?.targetUid;
    if (!targetUid || typeof targetUid !== "string") {
        throw new HttpsError("invalid-argument", "Usuario inválido.");
    }

    try {
        await getAuth().deleteUser(targetUid);
    } catch (err) {
        const code = err && typeof err === "object" && "code" in err ? err.code : "";
        if (code !== "auth/user-not-found") {
            throw new HttpsError("internal", "No se pudo eliminar la cuenta de acceso.");
        }
    }

    await getDatabase().ref(`users/${targetUid}`).remove();
    return { ok: true };
});
