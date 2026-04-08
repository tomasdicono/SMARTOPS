import { getAirportCoords } from "./airportCoords";

export interface WeatherAlert {
    hasAlert: boolean;
    messages: string[];
}

// Convert "01-04-2026" to "2026-04-01"
const parseDate = (d: string) => d.split("-").reverse().join("-");

// Convert "04:10" to closest hour "04:00"
const getClosestHourTime = (dateStr: string, timeStr: string) => {
    const isoDate = parseDate(dateStr);
    const hour = timeStr.split(":")[0];
    return `${isoDate}T${hour}:00`;
};

// Application memory cache to avoid unnecessary calls to the API when switching tabs/render trees.
const cache: Record<string, unknown> = {};
/** Same key in flight → share one network request (many cards, one airport/day). */
const inflight = new Map<string, Promise<unknown>>();

/** Space out requests so Open-Meteo is not hit with dozens of parallel calls (429 + misleading CORS errors). */
let fetchChain: Promise<void> = Promise.resolve();
const MIN_MS_BETWEEN_REQUESTS = 450;

function enqueueWeatherFetch<T>(run: () => Promise<T>): Promise<T> {
    const next = fetchChain.then(() => new Promise<T>((resolve, reject) => {
        setTimeout(() => {
            run().then(resolve, reject);
        }, MIN_MS_BETWEEN_REQUESTS);
    }));
    fetchChain = next.then(
        () => undefined,
        () => undefined
    );
    return next;
}

async function fetchForecastJson(lat: number, lon: number, isoDate: string): Promise<unknown> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=weather_code,visibility,wind_speed_10m,wind_gusts_10m&timezone=auto&start_date=${isoDate}&end_date=${isoDate}`;

    const attempt = async (): Promise<Response> => {
        return enqueueWeatherFetch(() => fetch(url));
    };

    let res = await attempt();
    // 429: rate limited — wait and retry once (server may omit CORS headers on errors, so the browser shows CORS).
    if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000;
        await new Promise((r) => setTimeout(r, waitMs));
        res = await attempt();
    }

    if (!res.ok) {
        throw new Error(`Weather API ${res.status}`);
    }
    return res.json();
}

export async function fetchWeatherAlert(iata: string, date: string, time: string): Promise<WeatherAlert> {
    const coords = getAirportCoords(iata);
    if (!coords) return { hasAlert: false, messages: [] };

    const isoDate = parseDate(date);
    const cacheKey = `${iata.toUpperCase()}-${isoDate}`;

    let data = cache[cacheKey] as { hourly?: { time?: string[] } } | undefined;

    if (!data) {
        const existing = inflight.get(cacheKey);
        if (existing) {
            data = (await existing) as typeof data;
        } else {
            const p = (async () => {
                try {
                    return await fetchForecastJson(coords.lat, coords.lon, isoDate);
                } catch {
                    return null;
                }
            })();
            inflight.set(cacheKey, p);
            try {
                const json = await p;
                if (json) cache[cacheKey] = json;
                data = json as typeof data;
            } finally {
                inflight.delete(cacheKey);
            }
        }
    }

    if (!data) return { hasAlert: false, messages: [] };

    if (!data.hourly || !data.hourly.time) return { hasAlert: false, messages: [] };

    const targetTime = getClosestHourTime(date, time);
    const index = data.hourly.time.indexOf(targetTime);

    if (index === -1) return { hasAlert: false, messages: [] };

    const code = data.hourly.weather_code[index];
    const vis = data.hourly.visibility[index];
    const wind = data.hourly.wind_speed_10m[index];
    const gusts = data.hourly.wind_gusts_10m[index];

    const messages: string[] = [];

    // WMO Weather interpretation codes mapping
    if ([65, 67].includes(code)) messages.push("Lluvia fuerte detectada");
    if ([71, 73, 75, 77].includes(code)) messages.push("Nevada moderada/fuerte");
    if ([95, 96, 99].includes(code)) messages.push("Tormentas eléctricas esperadas");
    if ([45, 48].includes(code)) messages.push("Niebla pesada (Escarcha)");

    if (vis !== null && vis < 1500) messages.push(`Baja visibilidad (${vis}m)`);
    if (wind !== null && wind > 40) messages.push(`Vientos fuertes sostenidos (${wind} km/h)`);
    if (gusts !== null && gusts > 60) messages.push(`Ráfagas intensas (${gusts} km/h)`);

    return {
        hasAlert: messages.length > 0,
        messages
    };
}
