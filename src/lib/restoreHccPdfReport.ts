import { updateFlight } from "./flightsDb";
import type { Flight } from "../types";

export interface PdfReportRecord {
    flt: string;
    std: string;
    atd: string;
    dep: string;
    arr: string;
    reg: string;
    dlyMin: string;
    dlyCod1: string;
    dlyTime1: string;
    dlyCod2: string;
    dlyTime2: string;
    observaciones: string;
}

export const PDF_2148_RECORDS: PdfReportRecord[] = [
    {
        flt: "JES3812",
        std: "04:14",
        atd: "04:15",
        dep: "AEP",
        arr: "GIG",
        reg: "CC-DIF",
        dlyMin: "00:01",
        dlyCod1: "89",
        dlyTime1: "00:01",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "ATC espera autorizacion torre para retroceso"
    },
    {
        flt: "JES3191",
        std: "07:35",
        atd: "08:18",
        dep: "AEP",
        arr: "REL",
        reg: "CC-DIV",
        dlyMin: "00:43",
        dlyCod1: "41",
        dlyTime1: "00:43",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Aeronave regresa a posición por AIR PACK 1 REGUL FAULT. Requiere MNT y vuelve a salir."
    },
    {
        flt: "JES3813",
        std: "08:05",
        atd: "08:07",
        dep: "GIG",
        arr: "AEP",
        reg: "CC-DIF",
        dlyMin: "00:02",
        dlyCod1: "89",
        dlyTime1: "00:02",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Demora por autorización de ATC"
    },
    {
        flt: "JES3104",
        std: "09:52",
        atd: "09:55",
        dep: "AEP",
        arr: "COR",
        reg: "LV-KDP",
        dlyMin: "00:03",
        dlyCod1: "41",
        dlyTime1: "00:03",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Manto no programado demora el cierre de puerta"
    },
    {
        flt: "JES3192",
        std: "10:13",
        atd: "10:58",
        dep: "REL",
        arr: "AEP",
        reg: "CC-DIV",
        dlyMin: "00:45",
        dlyCod1: "40",
        dlyTime1: "00:45",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Reaccionario aeronave regresa a posición en AEP por AIR PACK 1 REGUL FAULT. Requiere MNT y vuelve a salir."
    },
    {
        flt: "JES3072",
        std: "12:48",
        atd: "12:58",
        dep: "EZE",
        arr: "MDZ",
        reg: "CC-AWY",
        dlyMin: "00:10",
        dlyCod1: "41",
        dlyTime1: "00:06",
        dlyCod2: "30",
        dlyTime2: "00:04",
        observaciones: "Demora en puesta en marcha por APU INIP / Reacc mayor tiempo de rodaje al arribo"
    },
    {
        flt: "JES3181",
        std: "13:00",
        atd: "17:26",
        dep: "AEP",
        arr: "CPC",
        reg: "CC-DIW",
        dlyMin: "04:26",
        dlyCod1: "46",
        dlyTime1: "04:26",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Rotacion de equipo por AOG del IVO"
    },
    {
        flt: "JES3062",
        std: "14:32",
        atd: "14:45",
        dep: "AEP",
        arr: "RES",
        reg: "LV-KDP",
        dlyMin: "00:13",
        dlyCod1: "34",
        dlyTime1: "00:13",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Falta de papa movil servicio prestado por AR a ITC"
    },
    {
        flt: "JES3073",
        std: "15:32",
        atd: "15:56",
        dep: "MDZ",
        arr: "EZE",
        reg: "CC-AWY",
        dlyMin: "00:24",
        dlyCod1: "41",
        dlyTime1: "00:10",
        dlyCod2: "30",
        dlyTime2: "00:14",
        observaciones: "Demora por por puesta en marcha con ASU / Reacc por mayor tiempo de rodaje en vuelo previo"
    },
    {
        flt: "JES3182",
        std: "15:55",
        atd: "20:31",
        dep: "CPC",
        arr: "AEP",
        reg: "CC-DIW",
        dlyMin: "04:36",
        dlyCod1: "40",
        dlyTime1: "04:36",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Reacc por AOG del IVO"
    },
    {
        flt: "JES3814",
        std: "15:55",
        atd: "15:56",
        dep: "AEP",
        arr: "GIG",
        reg: "CC-DIC",
        dlyMin: "00:01",
        dlyCod1: "65",
        dlyTime1: "00:01",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Interrupción de embarque automático por parte de la tripulación debido a la presencia de MNT en cockpit"
    },
    {
        flt: "JAT732",
        std: "16:30",
        atd: "18:04",
        dep: "AEP",
        arr: "SCL",
        reg: "CC-DOK",
        dlyMin: "01:34",
        dlyCod1: "41",
        dlyTime1: "01:34",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Manto no programado. La aeronave vuelve a posición posterior a su salida, es tomada por MNT y se realiza diferido."
    },
    {
        flt: "JES3063",
        std: "16:40",
        atd: "16:44",
        dep: "RES",
        arr: "AEP",
        reg: "LV-KDP",
        dlyMin: "00:04",
        dlyCod1: "30",
        dlyTime1: "00:04",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Reacc por demora con papamovil en AEP"
    },
    {
        flt: "JES3203",
        std: "17:00",
        atd: "17:49",
        dep: "AEP",
        arr: "USH",
        reg: "CC-AWN",
        dlyMin: "00:49",
        dlyCod1: "41",
        dlyTime1: "00:49",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Mantto no programado"
    },
    {
        flt: "JES3018",
        std: "18:10",
        atd: "18:36",
        dep: "EZE",
        arr: "SLA",
        reg: "CC-AWY",
        dlyMin: "00:26",
        dlyCod1: "30",
        dlyTime1: "00:16",
        dlyCod2: "41",
        dlyTime2: "00:10",
        observaciones: "Reaccionario por rodaje extendo de arribo en EZE por trafico en plataforma #87 / Puesta en marcha con ASU"
    },
    {
        flt: "JAT721",
        std: "18:40",
        atd: "19:14",
        dep: "MDZ",
        arr: "SCL",
        reg: "CC-DII",
        dlyMin: "00:34",
        dlyCod1: "60",
        dlyTime1: "00:34",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "60 00:34 Reaccionario Tripulacion de vuelo JA720 SCL-MDZ, no firmo recibiendo de aeronave en SCL, por lo que tripulacion de JA721, se pone en contacto con jefe de pilotos para poder finalizar proceso de interchange."
    },
    {
        flt: "JES3051",
        std: "18:55",
        atd: "18:57",
        dep: "AEP",
        arr: "BRC",
        reg: "LV-KDP",
        dlyMin: "00:02",
        dlyCod1: "30",
        dlyTime1: "00:02",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "30 00:04 Reacc por demora con papamovil en AEP"
    },
    {
        flt: "JES3146",
        std: "19:20",
        atd: "19:24",
        dep: "EZE",
        arr: "IGR",
        reg: "CC-DIV",
        dlyMin: "00:04",
        dlyCod1: "41",
        dlyTime1: "00:04",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "MNT no programado"
    },
    {
        flt: "JES3044",
        std: "21:10",
        atd: "21:13",
        dep: "BRC",
        arr: "AEP",
        reg: "CC-DIH",
        dlyMin: "00:03",
        dlyCod1: "66",
        dlyTime1: "00:03",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "0003 COD.66// ACOMODACIÓN DE PASAJEROS EN CABINA DESPUES DEL CP"
    },
    {
        flt: "JES3152",
        std: "21:14",
        atd: "21:15",
        dep: "AEP",
        arr: "IGR",
        reg: "CC-DIY",
        dlyMin: "00:01",
        dlyCod1: "89",
        dlyTime1: "00:01",
        dlyCod2: "",
        dlyTime2: "",
        observaciones: "Atc espera de auth de transito"
    }
];

function normalizeNum(s: string): string {
    const clean = String(s || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
    const match = clean.match(/\d+/);
    return match ? match[0] : clean;
}

export async function restoreHccPdfReport(flights: Flight[]): Promise<{ count: number; unmatched: string[] }> {
    let updatedCount = 0;
    const unmatched: string[] = [];

    for (const rec of PDF_2148_RECORDS) {
        const targetNum = normalizeNum(rec.flt);
        const targetDep = rec.dep.toUpperCase();
        const targetArr = rec.arr.toUpperCase();

        const match = flights.find((f) => {
            const num = normalizeNum(f.flt);
            const dep = String(f.dep || "").toUpperCase();
            const arr = String(f.arr || "").toUpperCase();
            return num === targetNum && dep === targetDep && arr === targetArr;
        });

        if (match) {
            const existingMvt = match.mvtData || {
                atd: "", off: "", eta: "", dlyCod1: "", dlyTime1: "",
                dlyCod2: "", dlyTime2: "", observaciones: "", paxActual: "",
                inf: "", totalBags: "", totalCarga: "", load: ""
            };

            const updatedMvt = {
                ...existingMvt,
                atd: rec.atd || existingMvt.atd || "",
                dlyCod1: rec.dlyCod1 || existingMvt.dlyCod1 || "",
                dlyTime1: rec.dlyTime1 || existingMvt.dlyTime1 || "",
                dlyCod2: rec.dlyCod2 || existingMvt.dlyCod2 || "",
                dlyTime2: rec.dlyTime2 || existingMvt.dlyTime2 || "",
                observaciones: rec.observaciones || existingMvt.observaciones || "",
            };

            await updateFlight(match.id, {
                mvtData: updatedMvt,
                dailyReportObs: rec.observaciones,
            });
            updatedCount++;
        } else {
            unmatched.push(`${rec.flt} (${rec.dep}->${rec.arr})`);
        }
    }

    return { count: updatedCount, unmatched };
}
