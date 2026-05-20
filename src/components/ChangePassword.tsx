import { useState } from "react";
import { updatePassword, signOut } from "firebase/auth";
import { ref, update } from "firebase/database";
import { auth, db } from "../lib/firebase";
import { loadUserProfile } from "../lib/loadUserProfile";
import type { User } from "../types";
import { PlaneTakeoff, Loader2, AlertCircle, KeyRound, LogOut } from "lucide-react";

interface ChangePasswordProps {
    user: User;
    onComplete: (user: User) => void;
}

function passwordChangeErrorMessage(code: string | undefined): string {
    switch (code) {
        case "auth/weak-password":
            return "La contraseña debe tener al menos 6 caracteres.";
        case "auth/requires-recent-login":
            return "Por seguridad, cerrá sesión e ingresá de nuevo con la clave temporal.";
        default:
            return "No se pudo actualizar la contraseña. Intentá de nuevo.";
    }
}

export function ChangePassword({ user, onComplete }: ChangePasswordProps) {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        setLoading(true);
        try {
            const firebaseUser = auth.currentUser;
            if (!firebaseUser) {
                setError("Sesión expirada. Volvé a ingresar.");
                return;
            }

            await updatePassword(firebaseUser, newPassword);
            await update(ref(db, `users/${user.id}`), { mustChangePassword: false });

            const refreshed = await loadUserProfile(user.id);
            if (refreshed) {
                onComplete({ ...refreshed, mustChangePassword: false });
            } else {
                onComplete({ ...user, mustChangePassword: false });
            }
        } catch (err: unknown) {
            console.error("Change password error:", err);
            const code =
                err && typeof err === "object" && "code" in err
                    ? String((err as { code?: string }).code)
                    : undefined;
            setError(passwordChangeErrorMessage(code));
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-cyan-900/20">
                <div className="flex flex-col items-center mb-6">
                    <div className="bg-slate-800 p-4 rounded-full mb-4 shadow-inner">
                        <KeyRound className="w-12 h-12 text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight text-center">
                        Definí tu contraseña
                    </h1>
                    <p className="text-slate-400 font-semibold text-sm text-center mt-2 leading-relaxed">
                        Hola, {user.name}. Por seguridad, elegí una contraseña personal que solo vos conozcas
                        antes de continuar.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-950/50 border border-red-500/50 text-red-200 p-4 rounded-xl flex items-start gap-3 mb-6">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                        <span className="text-sm font-semibold">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-300 ml-1 uppercase tracking-wider">
                            Nueva contraseña
                        </label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            placeholder="Mínimo 6 caracteres"
                            className="bg-slate-950 border border-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-semibold shadow-inner"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-300 ml-1 uppercase tracking-wider">
                            Confirmar contraseña
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            placeholder="Repetí la contraseña"
                            className="bg-slate-950 border border-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-semibold shadow-inner"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900 disabled:opacity-50 text-slate-900 disabled:text-slate-500 py-3.5 rounded-xl font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            "Guardar y continuar"
                        )}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-slate-400 hover:text-white text-sm font-bold transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Cerrar sesión
                </button>

                <div className="mt-6 flex justify-center opacity-40">
                    <PlaneTakeoff className="w-6 h-6 text-cyan-400" />
                </div>
            </div>
        </div>
    );
}
