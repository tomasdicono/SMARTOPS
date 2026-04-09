/**
 * Genera src/data/iataToIcao.json desde OpenFlights airports.dat (IATA → ICAO).
 * Ejecutar: node scripts/generateIataIcao.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "src", "data");
const outFile = join(outDir, "iataToIcao.json");

const url = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const text = await res.text();

/** @type {Record<string, string>} */
const map = {};
for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  const m = line.match(/^(\d+),("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),/);
  if (!m) continue;
  const unquote = (s) => s.replace(/^"|"$/g, "").replace(/""/g, '"');
  const iata = unquote(m[5]).trim();
  const icao = unquote(m[6]).trim();
  if (iata.length === 3 && /^[A-Z0-9]{3}$/i.test(iata) && icao.length === 4 && /^[A-Z]{4}$/i.test(icao)) {
    map[iata.toUpperCase()] = icao.toUpperCase();
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(map, null, 0) + "\n", "utf8");
console.log(`Wrote ${Object.keys(map).length} entries to ${outFile}`);
