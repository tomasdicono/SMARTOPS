import React, { useState, useEffect } from "react";
import type { User, UserRole } from "../types";
import { db } from "../lib/firebase";
import { ref, onValue, set, remove } from "firebase/database";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { Users, UserPlus, Trash2, Loader2, X } from "lucide-react";

// Initialize a secondary app so we can create new users without signing out the admin
const firebaseConfig = {
    apiKey: "AIzaSyDpjFwp9YNOtQvFbTHYioUSSwmLQ03a1Ik",
    authDomain: "smartops-c22de.firebaseapp.com",
    databaseURL: "https://smartops-c22de-default-rtdb.firebaseio.com",
    projectId: "smartops-c22de",
    storageBucket: "smartops-c22de.firebasestorage.app",
    messagingSenderId: "823379296889",
    appId: "1:823379296889:web:10342091c7a60069f58aa8",
    measurementId: "G-7C59YMNW2Y"
};
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

interface UserManagementProps {
    onClose: () => void;
}

export function UserManagement({ onClose }: UserManagementProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const [formName, setFormName] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formPassword, setFormPassword] = useState("");
    const [formRole, setFormRole] = useState<UserRole>("CREW");

    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const usersRef = ref(db, 'users');
        const unsubscribe = onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const usersList = Object.values(data) as User[];
                setUsers(usersList);
            } else {
                setUsers([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError(null);

        try {
            // 1. Create in Auth (does not sign out current admin because we use secondary app)
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formEmail, formPassword);
            const newUid = userCredential.user.uid;

            // Immediately sign out from secondary app to clean up state
            await secondaryAuth.signOut();

            // 2. Create in Realtime DB
            const newUser: User = {
                id: newUid,
                name: formName,
                email: formEmail,
                role: formRole,
                createdAt: new Date().toISOString()
            };

            await set(ref(db, `users/${newUid}`), newUser);

            // Reset Form
            setFormName("");
            setFormEmail("");
            setFormPassword("");
            setFormRole("CREW");

        } catch (err: any) {
            console.error("Error creating user:", err);
            if (err.code === "auth/email-already-in-use") {
                setError("El correo ya está en uso.");
            } else if (err.code === "auth/weak-password") {
                setError("La contraseña debe tener al menos 6 caracteres.");
            } else {
                setError("Ocurrió un error al crear el usuario.");
            }
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (!window.confirm(`¿Estás seguro de eliminar a ${user.name} (${user.email})?`)) return;

        try {
            // We can easily remove from RTDB.
            await remove(ref(db, `users/${user.id}`));
            // Note: to fully delete from Authentication requires either admin SDK, cloud functions, 
            // or signing in as the user. We will just remove from DB to restrict their access.
            alert("Usuario eliminado de la base de datos de Smartops.");
        } catch (err) {
            console.error("Error deleting user from DB", err);
            alert("Hubo un problema al eliminar al usuario.");
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <h2 className="text-xl font-black text-white flex items-center gap-3">
                        <Users className="w-6 h-6 text-cyan-400" />
                        Gestión de Usuarios
                    </h2>
                    <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-slate-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col md:flex-row gap-8">
                    {/* Form Section */}
                    <div className="w-full md:w-1/3 flex flex-col gap-6">
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                                <UserPlus className="w-5 h-5 text-emerald-400" />
                                Nuevo Usuario
                            </h3>

                            {error && (
                                <div className="text-red-400 bg-red-950/50 p-3 rounded-lg text-sm mb-4 border border-red-900/50 font-semibold">{error}</div>
                            )}

                            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="Ej. Juan Pérez"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={formEmail}
                                        onChange={e => setFormEmail(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="usuario@jetsmart.com"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Contraseña temporal</label>
                                    <input
                                        type="text"
                                        required
                                        minLength={6}
                                        value={formPassword}
                                        onChange={e => setFormPassword(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="Min 6 caracteres"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Rol Operativo</label>
                                    <select
                                        value={formRole}
                                        onChange={e => setFormRole(e.target.value as UserRole)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-emerald-400 font-bold text-sm focus:outline-none focus:border-cyan-400 transition-colors appearance-none"
                                    >
                                        <option value="ADMIN">ADMIN</option>
                                        <option value="HCC">HCC</option>
                                        <option value="SC">SC (Servicios al Cliente)</option>
                                        <option value="CREW">CREW</option>
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-md flex justify-center items-center gap-2"
                                >
                                    {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Crear Usuario"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* List Section */}
                    <div className="w-full md:w-2/3 flex flex-col">
                        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl flex-1 overflow-hidden flex flex-col">
                            {loading ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                                </div>
                            ) : users.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                                    <Users className="w-12 h-12 mb-4 opacity-50" />
                                    <p>No hay usuarios registrados</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900/50 border-b border-slate-700/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                <th className="p-4">Nombre / Email</th>
                                                <th className="p-4">Rol</th>
                                                <th className="p-4 text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(u => (
                                                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                                                    <td className="p-4">
                                                        <div className="font-bold text-white">{u.name}</div>
                                                        <div className="text-xs text-slate-400">{u.email}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`text-xs font-black px-2.5 py-1 rounded-md shadow-sm uppercase ${u.role === 'ADMIN' ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50' :
                                                            u.role === 'HCC' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50' :
                                                                u.role === 'SC' ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50' :
                                                                    'bg-slate-800 text-slate-300 border border-slate-700'
                                                            }`}>
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button
                                                            onClick={() => handleDeleteUser(u)}
                                                            className="p-2 bg-red-950/30 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors inline-block"
                                                            title="Eliminar acceso"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
