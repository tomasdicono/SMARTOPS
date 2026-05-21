import { useState, useEffect, useRef, useMemo } from "react";
import type { User, UserRole } from "../types";
import { normalizeUserRole } from "../types";
import { db } from "../lib/firebase";
import { ref, onValue, set, remove } from "firebase/database";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, type Auth } from "firebase/auth";
import {
    Users,
    UserPlus,
    Trash2,
    Loader2,
    X,
    FileSpreadsheet,
    Upload,
    AlertCircle,
    Mail,
    Search,
} from "lucide-react";
import {
    sendUserPasswordResetEmail,
    passwordResetEmailErrorMessage,
} from "../lib/sendPasswordResetEmail";
import * as XLSX from "xlsx";
import {
    parseUserBulkSheet,
    authErrorMessage,
    type BulkUserParseResult,
} from "../lib/userBulkImport";

const firebaseConfig = {
    apiKey: "AIzaSyDpjFwp9YNOtQvFbTHYioUSSwmLQ03a1Ik",
    authDomain: "smartops-c22de.firebaseapp.com",
    databaseURL: "https://smartops-c22de-default-rtdb.firebaseio.com",
    projectId: "smartops-c22de",
    storageBucket: "smartops-c22de.firebasestorage.app",
    messagingSenderId: "823379296889",
    appId: "1:823379296889:web:10342091c7a60069f58aa8",
    measurementId: "G-7C59YMNW2Y",
};
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

interface UserManagementProps {
    onClose: () => void;
}

interface BulkImportProgress {
    total: number;
    done: number;
    currentEmail: string;
}

interface BulkImportOutcome {
    created: number;
    failed: { rowNumber: number; email: string; message: string }[];
}

async function createAppUser(
    auth: Auth,
    input: { name: string; email: string; password: string; role: UserRole },
): Promise<void> {
    const userCredential = await createUserWithEmailAndPassword(
        auth,
        input.email.trim(),
        input.password,
    );
    const newUid = userCredential.user.uid;
    await auth.signOut();

    const newUser: User = {
        id: newUid,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        createdAt: new Date().toISOString(),
        mustChangePassword: true,
    };

    await set(ref(db, `users/${newUid}`), newUser);
}

function readExcelFile(file: File): Promise<unknown[][]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) {
                    reject(new Error("No se pudo leer el archivo."));
                    return;
                }
                const workbook = XLSX.read(data, { type: "array" });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    reject(new Error("El archivo no tiene hojas."));
                    return;
                }
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
                    header: 1,
                    defval: "",
                    raw: false,
                }) as unknown[][];
                resolve(rows);
            } catch {
                reject(new Error("Formato de archivo no válido. Usá .xlsx o .xls."));
            }
        };
        reader.onerror = () => reject(new Error("Error al leer el archivo."));
        reader.readAsArrayBuffer(file);
    });
}

function usersFromSnapshot(data: Record<string, unknown> | null): User[] {
    if (!data) return [];
    const list: User[] = [];
    for (const [uid, raw] of Object.entries(data)) {
        if (!raw || typeof raw !== "object") continue;
        const u = raw as Partial<User>;
        list.push({
            id: u.id ?? uid,
            name: String(u.name ?? ""),
            email: String(u.email ?? ""),
            role: normalizeUserRole(u.role),
            ...(u.createdAt ? { createdAt: u.createdAt } : {}),
            ...(u.mustChangePassword === true ? { mustChangePassword: true } : {}),
        });
    }
    return list;
}

const ROLE_SELECT = (
    <>
        <option value="ADMIN">ADMIN</option>
        <option value="HCC">HCC</option>
        <option value="SC">SC (Supervisor de Carga)</option>
        <option value="CREW">CREW</option>
        <option value="AJS">AJS (Aeropuertos JetSMART)</option>
        <option value="LIMPIEZA">LIMPIEZA (tablero filtrado, sin PAX)</option>
    </>
);

export function UserManagement({ onClose }: UserManagementProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [formName, setFormName] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formPassword, setFormPassword] = useState("");
    const [formRole, setFormRole] = useState<UserRole>("CREW");

    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [bulkFileName, setBulkFileName] = useState<string | null>(null);
    const [bulkParse, setBulkParse] = useState<BulkUserParseResult | null>(null);
    const [bulkParseError, setBulkParseError] = useState<string | null>(null);
    const [bulkImporting, setBulkImporting] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<BulkImportProgress | null>(null);
    const [bulkOutcome, setBulkOutcome] = useState<BulkImportOutcome | null>(null);

    const [deletingUid, setDeletingUid] = useState<string | null>(null);
    const [sendingResetUid, setSendingResetUid] = useState<string | null>(null);
    const [resetEmailSuccess, setResetEmailSuccess] = useState<string | null>(null);
    const [userSearch, setUserSearch] = useState("");

    const filteredUsers = useMemo(() => {
        const q = userSearch.trim().toLowerCase();
        if (!q) return users;
        return users.filter(
            (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        );
    }, [users, userSearch]);

    useEffect(() => {
        const usersRef = ref(db, "users");
        const unsubscribe = onValue(
            usersRef,
            (snapshot) => {
                setLoadError(null);
                setUsers(usersFromSnapshot(snapshot.val() as Record<string, unknown> | null));
                setLoading(false);
            },
            (err) => {
                console.error("Error loading users:", err);
                setUsers([]);
                setLoadError(
                    "No se pudo cargar la lista de usuarios. Verificá que tu rol sea ADMIN o AJS y que las reglas de Firebase estén actualizadas.",
                );
                setLoading(false);
            },
        );
        return () => unsubscribe();
    }, []);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError(null);
        try {
            await createAppUser(secondaryAuth, {
                name: formName,
                email: formEmail,
                password: formPassword,
                role: formRole,
            });
            setFormName("");
            setFormEmail("");
            setFormPassword("");
            setFormRole("CREW");
        } catch (err: unknown) {
            console.error("Error creating user:", err);
            setError(authErrorMessage((err as { code?: string })?.code));
        } finally {
            setCreating(false);
        }
    };

    const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        setBulkOutcome(null);
        setBulkParse(null);
        setBulkParseError(null);
        if (!file) return;

        setBulkFileName(file.name);
        try {
            const rows = await readExcelFile(file);
            const result = parseUserBulkSheet(rows);
            setBulkParse(result);
            if (result.rows.length === 0 && result.errors.length > 0) {
                setBulkParseError(result.errors.map((x) => `Fila ${x.rowNumber}: ${x.message}`).join("\n"));
            }
        } catch (err: unknown) {
            setBulkFileName(null);
            setBulkParseError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
        }
    };

    const handleBulkImport = async () => {
        if (!bulkParse?.rows.length) return;

        const existingEmails = new Set(users.map((u) => u.email.trim().toLowerCase()));
        const alreadyInDb = bulkParse.rows.filter((r) => existingEmails.has(r.email));
        if (alreadyInDb.length) {
            const list = alreadyInDb.map((r) => r.email).join(", ");
            if (
                !window.confirm(
                    `${alreadyInDb.length} correo(s) ya existen en Smartops (${list}). ¿Crear solo los que faltan?`,
                )
            ) {
                return;
            }
        }

        const toCreate = bulkParse.rows.filter((r) => !existingEmails.has(r.email));
        if (!toCreate.length) {
            alert("Todos los correos del archivo ya están registrados.");
            return;
        }

        if (
            !window.confirm(
                `¿Crear ${toCreate.length} usuario${toCreate.length === 1 ? "" : "s"} en Firebase?`,
            )
        ) {
            return;
        }

        setBulkImporting(true);
        setBulkOutcome(null);
        setBulkProgress({ total: toCreate.length, done: 0, currentEmail: "" });

        const failed: BulkImportOutcome["failed"] = [];
        let created = 0;

        for (let i = 0; i < toCreate.length; i++) {
            const row = toCreate[i];
            setBulkProgress({ total: toCreate.length, done: i, currentEmail: row.email });
            try {
                await createAppUser(secondaryAuth, row);
                created++;
            } catch (err: unknown) {
                failed.push({
                    rowNumber: row.rowNumber,
                    email: row.email,
                    message: authErrorMessage((err as { code?: string })?.code),
                });
            }
        }

        setBulkProgress({ total: toCreate.length, done: toCreate.length, currentEmail: "" });
        setBulkOutcome({ created, failed });
        setBulkImporting(false);
    };

    const handleSendPasswordReset = async (user: User) => {
        if (
            !window.confirm(
                `¿Enviar correo de recuperación de contraseña a ${user.name} (${user.email})?\n\nEl usuario recibirá un enlace de Firebase para definir una nueva clave. Vos no verás la contraseña nueva.`,
            )
        ) {
            return;
        }

        setSendingResetUid(user.id);
        setError(null);
        setResetEmailSuccess(null);
        try {
            await sendUserPasswordResetEmail(user.email);
            setResetEmailSuccess(
                `Se envió el correo de recuperación a ${user.email}. Revisá también spam.`,
            );
        } catch (err: unknown) {
            console.error("Send password reset error:", err);
            const code =
                err && typeof err === "object" && "code" in err
                    ? String((err as { code?: string }).code)
                    : undefined;
            setError(passwordResetEmailErrorMessage(code));
        } finally {
            setSendingResetUid(null);
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (
            !window.confirm(
                `¿Eliminar a ${user.name} (${user.email}) de Smartops?\n\nEl acceso en Firebase Authentication no se borra solo. Si no vas a usar más ese correo, eliminalo también en Firebase Console → Authentication.`,
            )
        ) {
            return;
        }

        setDeletingUid(user.id);
        setError(null);
        try {
            await remove(ref(db, `users/${user.id}`));
            alert(
                "Usuario eliminado de Smartops. Si necesitás reutilizar el mismo correo, borralo también en Firebase Console → Authentication.",
            );
        } catch (err) {
            console.error("Error deleting user from DB", err);
            setError("Hubo un problema al eliminar al usuario en Smartops.");
        } finally {
            setDeletingUid(null);
        }
    };

    const bulkReadyCount = bulkParse?.rows.length ?? 0;
    const bulkErrorCount = bulkParse?.errors.length ?? 0;

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 shrink-0">
                    <h2 className="text-xl font-black text-white flex items-center gap-3">
                        <Users className="w-6 h-6 text-cyan-400" />
                        Gestión de Usuarios
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-slate-300"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col md:flex-row gap-8 min-h-0">
                    <div className="w-full md:w-1/3 flex flex-col gap-6 shrink-0">
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                                <UserPlus className="w-5 h-5 text-emerald-400" />
                                Nuevo Usuario
                            </h3>

                            {error && (
                                <div className="text-red-400 bg-red-950/50 p-3 rounded-lg text-sm mb-4 border border-red-900/50 font-semibold">
                                    {error}
                                </div>
                            )}
                            {resetEmailSuccess && (
                                <div className="text-emerald-300 bg-emerald-950/50 p-3 rounded-lg text-sm mb-4 border border-emerald-900/50 font-semibold">
                                    {resetEmailSuccess}
                                </div>
                            )}

                            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                                        Nombre
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="Ej. Juan Pérez"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={formEmail}
                                        onChange={(e) => setFormEmail(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="usuario@jetsmart.com"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                                        Contraseña temporal
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        minLength={6}
                                        value={formPassword}
                                        onChange={(e) => setFormPassword(e.target.value)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="Min 6 caracteres"
                                    />
                                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                                        El usuario la usará una sola vez; en el primer ingreso elegirá su propia
                                        contraseña.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                                        Rol Operativo
                                    </label>
                                    <select
                                        value={formRole}
                                        onChange={(e) => setFormRole(e.target.value as UserRole)}
                                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-emerald-400 font-bold text-sm focus:outline-none focus:border-cyan-400 transition-colors appearance-none"
                                    >
                                        {ROLE_SELECT}
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    disabled={creating || bulkImporting}
                                    className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-60"
                                >
                                    {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Crear Usuario"}
                                </button>
                            </form>
                        </div>

                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                                <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                                Carga masiva (Excel)
                            </h3>
                            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                                Primera fila: <span className="text-slate-300 font-semibold">Nombre</span>,{" "}
                                <span className="text-slate-300 font-semibold">Email</span>,{" "}
                                <span className="text-slate-300 font-semibold">Contraseña</span>,{" "}
                                <span className="text-slate-300 font-semibold">Rol operativo</span>. Roles: ADMIN,
                                HCC, SC, CREW, AJS, LIMPIEZA.
                            </p>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={handleBulkFileChange}
                            />
                            <button
                                type="button"
                                disabled={bulkImporting}
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full border border-dashed border-slate-600 hover:border-cyan-500/60 bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:text-white font-bold text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                <Upload className="w-4 h-4" />
                                {bulkFileName ?? "Seleccionar archivo Excel"}
                            </button>

                            {bulkParseError && (
                                <pre className="mt-3 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3 whitespace-pre-wrap font-medium max-h-32 overflow-y-auto">
                                    {bulkParseError}
                                </pre>
                            )}

                            {bulkParse && bulkReadyCount > 0 && (
                                <p className="mt-3 text-sm text-emerald-400 font-semibold">
                                    {bulkReadyCount} listo{bulkReadyCount === 1 ? "" : "s"} para crear
                                    {bulkErrorCount > 0 && (
                                        <span className="text-amber-400">
                                            {" "}
                                            · {bulkErrorCount} con error
                                        </span>
                                    )}
                                </p>
                            )}

                            {bulkParse && bulkErrorCount > 0 && (
                                <ul className="mt-2 text-xs text-amber-300/90 max-h-24 overflow-y-auto space-y-0.5">
                                    {bulkParse.errors.map((err) => (
                                        <li key={`${err.rowNumber}-${err.message}`}>
                                            Fila {err.rowNumber}: {err.message}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {bulkParse && bulkReadyCount > 0 && (
                                <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-slate-700/50 text-xs">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-slate-900/80 text-slate-500 uppercase tracking-wider">
                                                <th className="p-2 text-left">Nombre</th>
                                                <th className="p-2 text-left">Rol</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkParse.rows.map((r) => (
                                                <tr key={r.email} className="border-t border-slate-800/50">
                                                    <td
                                                        className="p-2 text-slate-300 truncate max-w-[8rem]"
                                                        title={r.email}
                                                    >
                                                        {r.name}
                                                    </td>
                                                    <td className="p-2 text-cyan-400 font-bold">{r.role}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {bulkProgress && bulkImporting && (
                                <div className="mt-3">
                                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                                        <span>Creando…</span>
                                        <span>
                                            {bulkProgress.done}/{bulkProgress.total}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-cyan-500 transition-all"
                                            style={{
                                                width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`,
                                            }}
                                        />
                                    </div>
                                    {bulkProgress.currentEmail && (
                                        <p className="text-xs text-slate-500 mt-1 truncate">
                                            {bulkProgress.currentEmail}
                                        </p>
                                    )}
                                </div>
                            )}

                            {bulkOutcome && (
                                <div className="mt-3 text-sm rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                                    <p className="text-emerald-400 font-bold">Creados: {bulkOutcome.created}</p>
                                    {bulkOutcome.failed.length > 0 && (
                                        <ul className="mt-2 text-xs text-red-400 space-y-1 max-h-24 overflow-y-auto">
                                            {bulkOutcome.failed.map((f) => (
                                                <li key={`${f.rowNumber}-${f.email}`}>
                                                    Fila {f.rowNumber} ({f.email}): {f.message}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <button
                                type="button"
                                disabled={!bulkParse?.rows.length || bulkImporting || creating}
                                onClick={() => void handleBulkImport()}
                                className="mt-4 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {bulkImporting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <FileSpreadsheet className="w-4 h-4" />
                                        Crear desde Excel
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="w-full md:w-2/3 flex flex-col min-h-0 gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                            <input
                                type="search"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Buscar por nombre o email…"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                                aria-label="Buscar usuarios por nombre o email"
                            />
                        </div>
                        {!loading && !loadError && users.length > 0 ? (
                            <p className="text-xs text-slate-500 px-1 font-semibold">
                                {userSearch.trim()
                                    ? `${filteredUsers.length} de ${users.length} usuario${users.length === 1 ? "" : "s"}`
                                    : `${users.length} usuario${users.length === 1 ? "" : "s"}`}
                            </p>
                        ) : null}
                        <p className="text-xs text-slate-500 leading-relaxed px-1">
                            Eliminar aquí solo quita el perfil en Smartops. Para liberar el correo, borrá el usuario en{" "}
                            <span className="text-slate-400 font-semibold">Firebase Console → Authentication</span>.
                        </p>
                        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl flex-1 overflow-hidden flex flex-col min-h-[12rem]">
                            {loading ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                                </div>
                            ) : loadError ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-red-400 p-6 text-center">
                                    <AlertCircle className="w-10 h-10 mb-3 opacity-80" />
                                    <p className="text-sm font-semibold max-w-md">{loadError}</p>
                                </div>
                            ) : users.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                                    <Users className="w-12 h-12 mb-4 opacity-50" />
                                    <p>No hay usuarios registrados</p>
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                                    <Search className="w-10 h-10 mb-3 opacity-50" />
                                    <p className="font-semibold">Sin resultados para &quot;{userSearch.trim()}&quot;</p>
                                    <p className="text-xs mt-1 text-slate-600">Probá otro nombre o correo</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto overflow-y-auto flex-1">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-slate-900/95 border-b border-slate-700/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                <th className="p-4">Nombre / Email</th>
                                                <th className="p-4">Rol</th>
                                                <th className="p-4 text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUsers.map((u) => (
                                                <tr
                                                    key={u.id}
                                                    className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors"
                                                >
                                                    <td className="p-4">
                                                        <div className="font-bold text-white">{u.name}</div>
                                                        <div className="text-xs text-slate-400">{u.email}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span
                                                            className={`text-xs font-black px-2.5 py-1 rounded-md shadow-sm uppercase ${
                                                                u.role === "ADMIN"
                                                                    ? "bg-purple-900/50 text-purple-300 border border-purple-700/50"
                                                                    : u.role === "HCC"
                                                                      ? "bg-cyan-900/50 text-cyan-300 border border-cyan-700/50"
                                                                      : u.role === "SC"
                                                                        ? "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50"
                                                                        : u.role === "AJS"
                                                                          ? "bg-blue-900/50 text-blue-300 border border-blue-700/50"
                                                                          : u.role === "LIMPIEZA"
                                                                            ? "bg-violet-900/50 text-violet-300 border border-violet-700/50"
                                                                            : "bg-slate-800 text-slate-300 border border-slate-700"
                                                            }`}
                                                        >
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    sendingResetUid === u.id ||
                                                                    bulkImporting ||
                                                                    creating
                                                                }
                                                                onClick={() => void handleSendPasswordReset(u)}
                                                                className="p-2 bg-cyan-950/30 hover:bg-cyan-500 text-cyan-400 hover:text-slate-900 rounded-lg transition-colors inline-block disabled:opacity-50"
                                                                title="Enviar recuperación por email"
                                                            >
                                                                {sendingResetUid === u.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Mail className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    deletingUid === u.id ||
                                                                    sendingResetUid === u.id ||
                                                                    bulkImporting ||
                                                                    creating
                                                                }
                                                                onClick={() => void handleDeleteUser(u)}
                                                                className="p-2 bg-red-950/30 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors inline-block disabled:opacity-50"
                                                                title="Eliminar de Smartops (Auth: Firebase Console)"
                                                            >
                                                                {deletingUid === u.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Trash2 className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        </div>
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
