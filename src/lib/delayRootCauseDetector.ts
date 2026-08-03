import type { Flight, HitosData } from "../types";
import type { GanttChart } from "./hitosData";
import { getMilestoneTargetMinutes, parseToMins } from "./hitosReference";

export interface DelayFactor {
    name: string;
    delayMinutes: number;
    description: string;
    groupName: string;
    delayPastDeparture: number; // Net delay past STD/ETD
}

export interface RootCauseAnalysis {
    hasDelay: boolean;
    primaryCause: DelayFactor | null;
    contributingFactors: DelayFactor[];
    summary: string;
}

// Define the logical process groups
const GROUPS = [
    {
        name: "Pasajeros y Cabina",
        milestones: [
            "Llegada crew",
            "Apertura puerta principal",
            "Inicio Embarque",
            "Fin embarque",
            "Cierre de puerta principal"
        ]
    },
    {
        name: "Combustible",
        milestones: [
            "Inicio Abastecimiento de Combustible",
            "Fin Abastecimiento de Combustible"
        ]
    },
    {
        name: "Rampa y Bodegas",
        milestones: [
            "Apertura puerta bodega",
            "Inicio Descarga de Bodegas",
            "Fin Descarga de Bodegas",
            "Inicio Cargue de Bodegas",
            "Fin Cargue de Bodegas",
            "Cierre puerta bodega"
        ]
    }
];

function getGroupFinalMilestone(groupMilestones: string[], chart: GanttChart): string | null {
    let lastActiveName: string | null = null;
    let maxIdx = -1;
    groupMilestones.forEach((name) => {
        const idx = chart.milestones.findIndex(x => x.name === name);
        if (idx > maxIdx) {
            maxIdx = idx;
            lastActiveName = name;
        }
    });
    return lastActiveName;
}

export function analyzeDelayRootCause(
    flight: Flight,
    data: HitosData,
    chart: GanttChart
): RootCauseAnalysis {
    const entries = data.entries || {};
    const groupCauses: DelayFactor[] = [];
    const depRef = flight.etd?.trim() || flight.std;
    const depRefMins = parseToMins(depRef);

    // Analyze each logical group
    for (const group of GROUPS) {
        const finalName = getGroupFinalMilestone(group.milestones, chart);
        if (!finalName) continue;

        const finalVal = entries[finalName];
        if (!finalVal || finalVal.length < 3) continue;

        let finalValMins = parseToMins(finalVal.padStart(4, "0"));
        // Midnight crossing check
        if (finalValMins < depRefMins - 240) {
            finalValMins += 24 * 60;
        }

        const delayPastDeparture = finalValMins - depRefMins;

        // A group only affects the flight delay if its final step finished AFTER scheduled departure time (STD/ETD)
        if (delayPastDeparture > 0) {
            // Find the root cause (first delayed milestone in this group)
            const delayedInGroup: { name: string; delayMinutes: number; index: number; targetMins: number; valMins: number }[] = [];

            group.milestones.forEach((mName) => {
                const mIndex = chart.milestones.findIndex(x => x.name === mName);
                if (mIndex === -1) return;

                const val = entries[mName];
                if (!val || val.length < 3) return;

                const mDef = chart.milestones[mIndex];
                const targetMins = getMilestoneTargetMinutes(flight, data, chart, mDef);
                if (targetMins == null) return;

                let valMins = parseToMins(val.padStart(4, "0"));
                if (valMins < targetMins && targetMins - valMins > 12 * 60) {
                    valMins += 24 * 60;
                }

                const delay = valMins - targetMins;
                if (delay > 0) {
                    delayedInGroup.push({
                        name: mName,
                        delayMinutes: delay,
                        index: mIndex,
                        targetMins,
                        valMins
                    });
                }
            });

            if (delayedInGroup.length > 0) {
                // Sort chronologically
                delayedInGroup.sort((a, b) => a.index - b.index);
                const rootItem = delayedInGroup[0];
                let desc = "";

                switch (rootItem.name) {
                    case "Llegada crew":
                        desc = `Presentación tardía de la tripulación (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Apertura puerta principal":
                        desc = `Demora en la apertura de la puerta principal (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Inicio Embarque":
                        desc = `Embarque de pasajeros iniciado tarde (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Fin embarque":
                        desc = `El proceso de embarque en puerta fue lento (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Cierre de puerta principal":
                        desc = `Cierre demorado de la puerta principal (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Inicio Abastecimiento de Combustible":
                        desc = `Inicio demorado de la carga de combustible (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Fin Abastecimiento de Combustible":
                        desc = `El abastecimiento de combustible finalizó tarde (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Apertura puerta bodega":
                        desc = `Apertura de bodegas demorada (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Inicio Descarga de Bodegas":
                        desc = `Inicio demorado de la descarga de bodegas (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Fin Descarga de Bodegas":
                        desc = `Descarga de bodegas finalizada con retraso (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Inicio Cargue de Bodegas":
                        desc = `Inicio demorado de la estiba/cargue de bodegas (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Fin Cargue de Bodegas":
                        desc = `Cargue de bodegas finalizado tarde (+${rootItem.delayMinutes} min).`;
                        break;
                    case "Cierre puerta bodega":
                        desc = `Cierre demorado de bodegas (+${rootItem.delayMinutes} min).`;
                        break;
                    default:
                        desc = `Desviación en ${rootItem.name} (+${rootItem.delayMinutes} min).`;
                }

                if (delayedInGroup.length > 1 && rootItem.name !== finalName) {
                    desc += ` Afectó el resto del flujo, finalizando el proceso después de la hora de salida programada (+${delayPastDeparture} min en ${finalName}).`;
                }

                groupCauses.push({
                    name: rootItem.name,
                    delayMinutes: rootItem.delayMinutes,
                    description: desc,
                    groupName: group.name,
                    delayPastDeparture
                });
            }
        }
    }

    if (groupCauses.length === 0) {
        return {
            hasDelay: false,
            primaryCause: null,
            contributingFactors: [],
            summary: "Todos los procesos operacionales principales finalizaron a tiempo o antes de la hora de salida programada."
        };
    }

    // Sort by delayPastDeparture descending: the process that finished LATEST past scheduled departure is the primary bottleneck
    groupCauses.sort((a, b) => b.delayPastDeparture - a.delayPastDeparture);
    const primary = groupCauses[0];
    const contributing = groupCauses.slice(1);

    let summary = `Causa raíz principal: Flujo de ${primary.groupName} (afectó la salida en +${primary.delayPastDeparture} min, originado en "${primary.name}").`;

    return {
        hasDelay: true,
        primaryCause: primary,
        contributingFactors: contributing,
        summary
    };
}
