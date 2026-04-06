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
const cache: Record<string, any> = {};

export async function fetchWeatherAlert(iata: string, date: string, time: string): Promise<WeatherAlert> {
    const coords = getAirportCoords(iata);
    if (!coords) return { hasAlert: false, messages: [] };

    const isoDate = parseDate(date);
    const cacheKey = `${iata}-${isoDate}`;

    let data = cache[cacheKey];

    if (!data) {
        try {
            // Fetch exact day using open-meteo hourly endpoints
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=weather_code,visibility,wind_speed_10m,wind_gusts_10m&timezone=auto&start_date=${isoDate}&end_date=${isoDate}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("API Error");
            data = await res.json();
            cache[cacheKey] = data;
        } catch (e) {
            console.error("Weather API error", e);
            return { hasAlert: false, messages: [] };
        }
    }

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
