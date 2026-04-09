import { getIcaoFromIata } from "./iataIcao";

export interface WeatherAlert {
    hasAlert: boolean;
    messages: string[];
}

/** Base URL hacia aviationweather.gov (mismo path que en el servidor NOAA). */
function aviationWeatherOrigin(): string {
    const env = import.meta.env.VITE_AVIATION_WEATHER_BASE?.trim();
    if (env) return env.replace(/\/$/, "");
    return "/api/aviation";
}

/** Los navegadores no permiten fijar User-Agent en fetch; el proxy de Vite lo añade hacia NOAA. */
const jsonHeaders = {
    Accept: "application/json",
} as const;

/** Cache en memoria METAR por estación (evita duplicar al cambiar de pestaña). */
const cacheMetar = new Map<string, { at: number; data: unknown }>();
const METAR_TTL_MS = 8 * 60 * 1000;

const inflightMetar = new Map<string, Promise<unknown>>();

let fetchChain: Promise<void> = Promise.resolve();
const MIN_MS_BETWEEN_REQUESTS = 450;

function enqueueFetch<T>(run: () => Promise<T>): Promise<T> {
    const next = fetchChain.then(
        () =>
            new Promise<T>((resolve, reject) => {
                setTimeout(() => {
                    run().then(resolve, reject);
                }, MIN_MS_BETWEEN_REQUESTS);
            })
    );
    fetchChain = next.then(
        () => undefined,
        () => undefined
    );
    return next;
}

async function fetchJson(url: string): Promise<unknown | null> {
    try {
        const res = await enqueueFetch(() =>
            fetch(url, { headers: jsonHeaders })
        );
        if (res.status === 204 || res.status === 404) return null;
        if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 5000));
            const retry = await enqueueFetch(() => fetch(url, { headers: jsonHeaders }));
            if (!retry.ok) return null;
            return retry.json();
        }
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

interface MetarRow {
    rawOb?: string;
}

/**
 * Solo fenómenos/nubes que operativamente interesan (sin TEMPO/BECMG del TAF: aquí solo METAR).
 * Códigos: DZ, SN, RA y variantes, SHRA, TSRA, FG, BR, OVC.
 */
function metarMessages(m: MetarRow): string[] {
    const raw = (m.rawOb ?? "").toUpperCase();
    const msgs: string[] = [];
    const add = (text: string) => {
        msgs.push(text);
    };

    // Tormenta con lluvia (antes de SHRA/RA para no tomar solo "RA" de TSRA)
    if (/\+TSRA\b/.test(raw)) add("Tormenta con lluvia fuerte (+TSRA)");
    else if (/-TSRA\b/.test(raw)) add("Tormenta con lluvia débil (-TSRA)");
    else if (/\bTSRA\b/.test(raw)) add("Tormenta con lluvia (TSRA)");

    // Chubascos (independiente de TSRA)
    if (/\+SHRA\b/.test(raw)) add("Chubascos de lluvia fuerte (+SHRA)");
    else if (/-SHRA\b/.test(raw)) add("Chubascos de lluvia débil (-SHRA)");
    else if (/\bSHRA\b/.test(raw)) add("Chubascos de lluvia (SHRA)");

    // Lluvia (no mezclar con SHRA ya cubierto arriba)
    if (/\+RA\b/.test(raw)) add("Lluvia fuerte (+RA)");
    else if (/-RA\b/.test(raw)) add("Lluvia débil (-RA)");
    else if (/\bRA\b/.test(raw)) add("Lluvia (RA)");

    if (/\+DZ\b/.test(raw)) add("Llovizna fuerte (+DZ)");
    else if (/-DZ\b/.test(raw)) add("Llovizna débil (-DZ)");
    else if (/\bDZ\b/.test(raw)) add("Llovizna (DZ)");

    if (/\+SN\b/.test(raw)) add("Nieve fuerte (+SN)");
    else if (/-SN\b/.test(raw)) add("Nieve débil (-SN)");
    else if (/\bSN\b/.test(raw)) add("Nieve (SN)");

    if (/\bFG\b/.test(raw)) add("Niebla (FG)");
    if (/\bBR\b/.test(raw)) add("Neblina (BR)");

    if (/\bOVC\d{3}\b/.test(raw) || /\bOVC\/\//.test(raw)) {
        add("Cielo cubierto (OVC)");
    }

    return msgs;
}

async function getMetar(icao: string): Promise<MetarRow | null> {
    const now = Date.now();
    const hit = cacheMetar.get(icao);
    if (hit && now - hit.at < METAR_TTL_MS) {
        const row = Array.isArray(hit.data) ? (hit.data as MetarRow[])[0] : null;
        return row ?? null;
    }

    const url = `${aviationWeatherOrigin()}/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`;

    let data: unknown;
    const existing = inflightMetar.get(icao);
    if (existing) {
        data = await existing;
    } else {
        const p = fetchJson(url);
        inflightMetar.set(icao, p);
        try {
            data = await p;
            if (data) cacheMetar.set(icao, { at: Date.now(), data });
        } finally {
            inflightMetar.delete(icao);
        }
    }

    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as MetarRow;
}

/**
 * Alertas a partir del METAR actual (NOAA / aviationweather.gov).
 * Requiere proxy en dev (`vite`) o en hosting; ver `vite.config.ts` y `netlify.toml`.
 */
export async function fetchWeatherAlert(iata: string, date: string, time: string): Promise<WeatherAlert> {
    void date;
    void time;
    const icao = getIcaoFromIata(iata);
    if (!icao) return { hasAlert: false, messages: [] };

    const metar = await getMetar(icao);
    if (!metar) return { hasAlert: false, messages: [] };

    const messages = metarMessages(metar);

    return {
        hasAlert: messages.length > 0,
        messages,
    };
}
