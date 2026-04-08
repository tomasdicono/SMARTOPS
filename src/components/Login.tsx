import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { ref, get } from "firebase/database";
import { normalizeUserRole, type User } from "../types";
import { PlaneTakeoff, Loader2, AlertCircle } from "lucide-react";

interface LoginProps {
    onLoginSuccess: (user: User) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // 1. Authenticate with Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;

            // 2. Fetch User Profile & Role from Realtime DB
            const userRef = ref(db, `users/${firebaseUser.uid}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val() as User;
                onLoginSuccess({ ...userData, role: normalizeUserRole(userData.role) });
            } else {
                // If user doesn't exist in our DB, we give them a default read-only or sign out
                setError("Usuario no encontrado en la base de datos interna. Contacte a un administrador.");
                auth.signOut();
            }
        } catch (err: any) {
            console.error("Login error:", err);
            if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
                setError("Correo o contraseña incorrectos.");
            } else if (err.code === "auth/too-many-requests") {
                setError("Demasiados intentos. Intente más tarde.");
            } else {
                setError("Ocurrió un error al iniciar sesión.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-cyan-900/20">
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-slate-800 p-4 rounded-full mb-4 shadow-inner">
                        <PlaneTakeoff className="w-12 h-12 text-cyan-400" />
                    </div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-2 tracking-tight">
                        SMARTOPS
                    </h1>
                    <p className="text-slate-400 font-bold tracking-wide mt-2">Login to Management</p>
                </div>

                {error && (
                    <div className="bg-red-950/50 border border-red-500/50 text-red-200 p-4 rounded-xl flex items-start gap-3 mb-6">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                        <span className="text-sm font-semibold">{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-300 ml-1 uppercase tracking-wider">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="usuario@jetsmart.com"
                            className="bg-slate-950 border border-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-semibold shadow-inner"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-300 ml-1 uppercase tracking-wider">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="bg-slate-950 border border-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-semibold shadow-inner"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900 disabled:opacity-50 text-slate-900 disabled:text-slate-500 py-3.5 rounded-xl font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Ingresar"}
                    </button>
                </form>
            </div>
        </div>
    );
}
