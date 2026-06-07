/**
 * Quita una entrada del historial QRF de un vuelo en Firebase.
 *
 * Uso:
 *   set SMARTOPS_EMAIL=usuario@jetsmart.com
 *   set SMARTOPS_PASSWORD=...
 *   node scripts/prune-qrf-history.mjs --flt 3039 --date 2026-06-07 --index 1
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, ref, get, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDpjFwp9YNOtQvFbTHYioUSSwmLQ03a1Ik",
  authDomain: "smartops-c22de.firebaseapp.com",
  databaseURL: "https://smartops-c22de-default-rtdb.firebaseio.com",
  projectId: "smartops-c22de",
};

function parseArgs(argv) {
  const out = { flt: "", date: "", index: -1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--flt") out.flt = String(argv[++i] ?? "").replace(/\D/g, "");
    else if (arg === "--date") out.date = String(argv[++i] ?? "").trim();
    else if (arg === "--index") out.index = Number(argv[++i]);
  }
  return out;
}

function normalizeQrfHistory(raw) {
  if (raw == null) return [];
  const items = Array.isArray(raw) ? raw : Object.values(raw);
  return items
    .map((ev) => {
      if (ev == null || typeof ev !== "object") return null;
      const reason = String(ev.reason ?? "").trim();
      const at = String(ev.at ?? "").trim();
      if (!reason && !at) return null;
      const resolvedAt = String(ev.resolvedAt ?? "").trim();
      return { reason: reason || "—", at, ...(resolvedAt ? { resolvedAt } : {}) };
    })
    .filter(Boolean)
    .sort((a, b) => a.at.localeCompare(b.at));
}

function flightDateToIso(f) {
  const raw = String(f.date ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return raw;
}

const { flt, date, index } = parseArgs(process.argv.slice(2));
const email = process.env.SMARTOPS_EMAIL ?? "";
const password = process.env.SMARTOPS_PASSWORD ?? "";

if (!flt || !date || index < 0) {
  console.error("Uso: node scripts/prune-qrf-history.mjs --flt 3039 --date 2026-06-07 --index 1");
  process.exit(1);
}
if (!email || !password) {
  console.error("Definí SMARTOPS_EMAIL y SMARTOPS_PASSWORD.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

await signInWithEmailAndPassword(auth, email, password);
const snap = await get(ref(db, "flights"));
const data = snap.val();
if (!data || typeof data !== "object") {
  console.error("Sin vuelos en Firebase.");
  process.exit(1);
}

const entries = Array.isArray(data) ? data.map((raw, i) => [String(i), raw]) : Object.entries(data);
let targetId = "";
let targetHistory = [];

for (const [id, raw] of entries) {
  if (raw == null || typeof raw !== "object") continue;
  const digits = String(raw.flt ?? "").replace(/\D/g, "");
  if (digits !== flt) continue;
  if (flightDateToIso(raw) !== date) continue;
  targetId = String(raw.id ?? id).trim() || id;
  targetHistory = normalizeQrfHistory(raw.qrfHistory);
  break;
}

if (!targetId) {
  console.error(`No se encontró vuelo ${flt} en ${date}.`);
  process.exit(1);
}
if (index >= targetHistory.length) {
  console.error(`Índice ${index} fuera de rango (${targetHistory.length} entradas).`);
  process.exit(1);
}

const pruned = targetHistory.filter((_, i) => i !== index);
await update(ref(db, `flights/${targetId}`), { qrfHistory: pruned });
console.log(`OK: vuelo ${targetId} (${flt}) — quedan ${pruned.length} QRF(s).`);
