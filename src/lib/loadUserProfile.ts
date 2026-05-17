import { ref, get } from "firebase/database";
import { db } from "./firebase";
import { normalizeUserRole, type User } from "../types";

function coerceUser(raw: unknown, uid: string): User | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  return {
    id: typeof u.id === "string" && u.id ? u.id : uid,
    email: typeof u.email === "string" ? u.email : "",
    name: typeof u.name === "string" ? u.name : "",
    role: normalizeUserRole(u.role),
    createdAt: typeof u.createdAt === "string" ? u.createdAt : undefined,
  };
}

/** Perfil en Realtime Database: `users/{auth.uid}`. */
export async function loadUserProfile(uid: string): Promise<User | null> {
  const snapshot = await get(ref(db, `users/${uid}`));
  if (!snapshot.exists()) return null;
  return coerceUser(snapshot.val(), uid);
}
