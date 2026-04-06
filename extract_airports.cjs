const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('airports.json', 'utf8'));
    const airportMap = {};

    for (const key in data) {
        const apt = data[key];
        if (apt.iata && apt.iata !== '\\N') {
            airportMap[apt.iata] = { lat: apt.lat, lon: apt.lon };
        }
    }

    const output = `export const AIRPORT_COORDS: Record<string, {lat: number, lon: number}> = ${JSON.stringify(airportMap, null, 2)};
  
export const getAirportCoords = (iata: string) => AIRPORT_COORDS[iata.toUpperCase()] || null;
`;

    fs.writeFileSync('src/lib/airportCoords.ts', output);
    console.log("Successfully generated src/lib/airportCoords.ts with " + Object.keys(airportMap).length + " airports");
} catch (e) {
    console.error("Error generating coords file:", e);
}
