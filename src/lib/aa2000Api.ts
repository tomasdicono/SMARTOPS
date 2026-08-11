export interface Aa2000FlightData {
    id: string;
    stda: string;
    arpt: string;
    idaerolinea: string;
    aerolinea: string;
    mov: string;
    nro: string;
    logo: string;
    destorig: string;
    IATAdestorig: string;
    etda: string;
    atda: string;
    sector: string;
    termsec: string;
    gate: string;
    estes: string;
    estin: string;
    estbr: string;
    color: string;
    matricula: string;
    chk_from: string | null;
    chk_to: string | null;
    belt: string;
    chk_lyf: string | null;
    sdtempunit: string | null;
    sdtemp: string | number | null;
    sdphrase: string | null;
    idclimaicono: string | number | null;
    tipoVuelo: string | null;
    id_flight_tp: string;
    id_flight_tra: string;
    id_flight_reg: string;
    idshared: string;
    acftype: string | null;
    pasajeros: string;
    posicion: string;
    term: string | null;
    checkins: string;
    via: string;
    blockon: string;
    blockoff: string;
    acft_body: string;
    rot: string;
}

export async function fetchAa2000Flights(airportIata: string, dateStr: string): Promise<Aa2000FlightData[]> {
    // dateStr in DD-MM-YYYY format or YYYY-MM-DD
    let formattedDate = dateStr;
    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
        // convert YYYY-MM-DD to DD-MM-YYYY
        const [y, m, d] = dateStr.split('-');
        formattedDate = `${d}-${m}-${y}`;
    }

    const allFlights: Aa2000FlightData[] = [];

    // Fetch Arrivals and Departures
    for (const movtp of ["A", "D"]) {
        const url = `https://webaa-api-h4d5amdfcze7hthn.a02.azurefd.net/web-prod/v1/api-aa/all-flights?c=900&idarpt=${airportIata}&movtp=${movtp}&f=${formattedDate}`;
        try {
            const res = await fetch(url, {
                headers: {
                    "Origin": "https://www.aeropuertosargentina.com",
                    "Key": "HieGcY2nFreIsNLuo5EbXCwE7g0aRzTN",
                    "Accept-Language": "es-AR",
                }
            });
            if (!res.ok) {
                console.error(`AA2000 API Error ${res.status}: ${res.statusText}`);
                continue;
            }
            const json = await res.json();
            if (Array.isArray(json)) {
                allFlights.push(...json);
            }
        } catch (e) {
            console.error("Failed to fetch AA2000 flights", e);
        }
    }

    return allFlights;
}
