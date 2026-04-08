import type { Flight } from "../types";
import { parse, addHours, isAfter } from "date-fns";

export function isFlightIncompleteAndLate(flight: Flight): boolean {
    if (flight.cancelled) return false;
    if (flight.mvtData) return false;

    try {
        // Flight date format is "DD-MM-YYYY", e.g., "01-04-2026"
        // STD format is "HH:mm", e.g., "04:10"
        const flightDateStr = `${flight.date} ${flight.std}`;

        // Parse it to a localized Date object
        const stdDate = parse(flightDateStr, "dd-MM-yyyy HH:mm", new Date());

        if (isNaN(stdDate.getTime())) return false;

        // "diferencia entre el horario actual y el STD sea menor a 1 hora"
        // "posterior a eso, si los datos ... no fueron cargados se colorerará de rojo"
        // Which means: if current time > STD + 1 hour, it is late.
        const deadline = addHours(stdDate, 1);
        const now = new Date(); // Uses browser current time

        return isAfter(now, deadline);
    } catch (e) {
        return false;
    }
}
