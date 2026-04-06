const https = require('https');
const fs = require('fs');

console.log("Downloading airports.json...");
https.get('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            const airportMap = {};
            for (const key in parsed) {
                const apt = parsed[key];
                if (apt.iata && apt.iata !== '\\N') {
                    airportMap[apt.iata] = { lat: apt.lat, lon: apt.lon };
                }
            }
            const output = `export const AIRPORT_COORDS: Record<string, {lat: number, lon: number}> = ${JSON.stringify(airportMap, null, 2)};
export const getAirportCoords = (iata: string) => AIRPORT_COORDS[iata.toUpperCase()] || null;
`;
            fs.writeFileSync('src/lib/airportCoords.ts', output);
            console.log("Successfully generated src/lib/airportCoords.ts with " + Object.keys(airportMap).length + " airports.");
        } catch (e) { console.error("Parse Error:", e); }
    });
}).on('error', console.error);
