import { endAt, get, orderByKey, query, ref, set, startAt } from "firebase/database";
import { db } from "./firebase";
import {
    clampIsoRangeToToday,
    eachIsoInRange,
    fetchFlightsByDateIso,
    fetchFlightsForIso,
    isIsoDate,
} from "./flightsByDate";
import { flightWithoutInlinePhoto, syncFlightReadModel } from "./flightsDb";
import { flightDateToIso } from "./controlHelpers";
import { isFlightSummaryRecord, summaryToFlight, type FlightSummaryRecord } from "./flightSummary";
import type { Flight } from "../types";

export type LightPrep = { done: number; total: number };

const listeners = new Set<(prep: LightPrep | null) => void>();
let prepDone = 0;
let prepTotal = 0;
let prepJobs = 0;
const dayInflight = new Map<string, Promise<Flight[]>>();
let tail: Promise<void> = Promise.resolve();

function emitPrep() {
    const snap = prepJobs > 0 ? { done: prepDone, total: prepTotal } : null;
    for (const listener of listeners) listener(snap);
}

export function subscribeLightPrep(listener: (prep: LightPrep | null) => void): () => void {
    listeners.add(listener);
    listener(prepJobs > 0 ? { done: prepDone, total: prepTotal } : null);
    return () => listeners.delete(listener);
}

const touchedIds = new Set<string>();

/** Saca la foto de memoria y, si el vuelo todavía está pesado, la mueve en segundo plano. */
export function touchFlightLight(flight: Flight): Flight {
    const photo = String(flight.mvtData?.briefingPhoto ?? "").trim();
    const id = String(flight.id ?? "").trim();
    const needsMove = Boolean(photo) || !flight.dateIso;
    if (needsMove && id && !touchedIds.has(id)) {
        touchedIds.add(id);
        void syncFlightReadModel(flight, photo ? "save" : "keep", photo).catch((err) => {
            touchedIds.delete(id);
            console.error("No se pudo aligerar el vuelo", id, err);
        });
    }
    return flightWithoutInlinePhoto(flight);
}

async function missingLightDays(isos: string[]): Promise<string[]> {
    const days = [...new Set(isos)].filter(isIsoDate).sort();
    if (days.length === 0) return [];
    const snap = await get(
        query(ref(db, "flightLightDays"), orderByKey(), startAt(days[0]), endAt(days[days.length - 1])),
    );
    const done = new Set(Object.keys((snap.val() as Record<string, unknown> | null) ?? {}));
    return days.filter((iso) => !done.has(iso));
}

async function migrateDay(iso: string): Promise<Flight[]> {
    const existing = dayInflight.get(iso);
    if (existing) return existing;
    const job = (async () => {
        const raw = await fetchFlightsForIso(iso);
        const stripped: Flight[] = [];
        for (let i = 0; i < raw.length; i += 4) {
            const chunk = raw.slice(i, i + 4);
            const done = await Promise.all(
                chunk.map(async (flight) => {
                    const photo = String(flight.mvtData?.briefingPhoto ?? "").trim();
                    await syncFlightReadModel(flight, photo ? "save" : "keep", photo);
                    return flightWithoutInlinePhoto({
                        ...flight,
                        dateIso: iso,
                        hasBriefingPhoto: Boolean(photo || flight.hasBriefingPhoto),
                    });
                }),
            );
            stripped.push(...done);
        }
        await set(ref(db, `flightLightDays/${iso}`), true);
        return stripped;
    })().catch((err) => {
        dayInflight.delete(iso);
        throw err;
    });
    dayInflight.set(iso, job);
    return job;
}

/** Mueve fotos y arma el resumen de los días que todavía no se procesaron. */
export function ensureLightDays(
    isos: string[],
    onDay?: (iso: string, flights: Flight[]) => void,
): Promise<{ ready: Map<string, Flight[]>; failed: string[] }> {
    const run = async () => {
        const missing = await missingLightDays(isos);
        const ready = new Map<string, Flight[]>();
        const failed: string[] = [];
        if (missing.length === 0) return { ready, failed };
        prepJobs += 1;
        prepTotal += missing.length;
        emitPrep();
        let cursor = 0;
        const worker = async () => {
            while (cursor < missing.length) {
                const iso = missing[cursor];
                cursor += 1;
                try {
                    const flights = await migrateDay(iso);
                    ready.set(iso, flights);
                    onDay?.(iso, flights);
                } catch (err) {
                    failed.push(iso);
                    console.error("No se pudo preparar el día", iso, err);
                } finally {
                    prepDone += 1;
                    emitPrep();
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, missing.length) }, () => worker()));
        prepJobs -= 1;
        if (prepJobs <= 0) {
            prepJobs = 0;
            prepDone = 0;
            prepTotal = 0;
        }
        emitPrep();
        return { ready, failed };
    };
    const job = tail.then(run, run);
    tail = job.then(
        () => undefined,
        () => undefined,
    );
    return job;
}

export async function fetchSummaryFlights(from: string, to: string): Promise<Record<string, Flight[]>> {
    const { lo, hi } = clampIsoRangeToToday(from, to);
    if (!lo || !hi) return {};
    const snap = await get(query(ref(db, "flightSummaries"), orderByKey(), startAt(lo), endAt(hi)));
    const days = snap.val() as Record<string, Record<string, FlightSummaryRecord>> | null;
    const out: Record<string, Flight[]> = {};
    if (!days || typeof days !== "object") return out;
    for (const [iso, day] of Object.entries(days)) {
        if (!day || typeof day !== "object") continue;
        const list: Flight[] = [];
        for (const [key, raw] of Object.entries(day)) {
            if (!isFlightSummaryRecord(raw)) continue;
            list.push(summaryToFlight({ ...raw, id: raw.id || key }));
        }
        out[iso] = list;
    }
    return out;
}

/** Vuelos operativos de esos días, sin la foto. La primera vez los prepara; después es una sola lectura. */
export async function loadOperationalDays(isos: string[]): Promise<Record<string, Flight[]>> {
    const days = [...new Set(isos)].filter(isIsoDate).sort();
    const { lo, hi } = clampIsoRangeToToday(days[0] ?? "", days[days.length - 1] ?? "");
    const wanted = days.filter((iso) => lo && hi && iso >= lo && iso <= hi);
    const grouped: Record<string, Flight[]> = {};
    for (const iso of wanted) grouped[iso] = [];
    if (wanted.length === 0) return grouped;

    const { ready, failed } = await ensureLightDays(wanted);
    const failedSet = new Set(failed);
    for (const [iso, list] of ready) grouped[iso] = list;

    const pending = wanted.filter((iso) => !ready.has(iso) && !failedSet.has(iso));
    if (pending.length === 0) {
        for (const iso of failed) delete grouped[iso];
        return grouped;
    }

    try {
        const fetched = await fetchFlightsByDateIso(pending[0], pending[pending.length - 1]);
        const want = new Set(pending);
        for (const flight of fetched) {
            const iso = flight.dateIso || flightDateToIso(flight);
            if (want.has(iso)) grouped[iso].push(flight);
        }
    } catch (err) {
        console.error("Lectura por dateIso no disponible; se pide cada día", err);
        for (const iso of pending) {
            grouped[iso] = (await fetchFlightsForIso(iso)).map(flightWithoutInlinePhoto);
        }
    }
    for (const iso of failed) delete grouped[iso];
    return grouped;
}

export function summaryDaysInRange(from: string, to: string): string[] {
    const { lo, hi } = clampIsoRangeToToday(from, to);
    if (!lo || !hi) return [];
    return eachIsoInRange(lo, hi);
}
