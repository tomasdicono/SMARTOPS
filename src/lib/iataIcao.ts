import iataToIcao from "../data/iataToIcao.json";

/** Resuelve código IATA (3 letras) → ICAO (4 letras) para APIs de aviación. */
export function getIcaoFromIata(iata: string): string | null {
    const k = iata.trim().toUpperCase();
    if (k.length !== 3) return null;
    const icao = (iataToIcao as Record<string, string>)[k];
    return icao ?? null;
}
