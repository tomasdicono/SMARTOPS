/**
 * ANEXO A — Checklist por tipo de limpieza.
 * - Tránsito & escala: vuelos con bloque > 03:30 h (no último JES del día).
 * - Pernocte / escala larga: último sector JES del día (pernocte).
 */
export type LimpiezaChecklistMode = "transito" | "pernocte";

/** `si` = tarea completa; `foco` = solo si hay foco visible de suciedad (tránsito). */
export type TransitoTask = false | "si" | "foco";

export interface LimpiezaChecklistTaskDef {
    id: string;
    section: string;
    label: string;
    transito: TransitoTask;
    pernocte: boolean;
}

export const LIMPIEZA_CHECKLIST_TASKS: LimpiezaChecklistTaskDef[] = [
    // CABINA DE PILOTO
    {
        id: "cp_vaciar_contenedores",
        section: "CABINA DE PILOTO",
        label: "Vaciar contenedores de residuos",
        transito: "si",
        pernocte: true,
    },
    {
        id: "cp_retirar_residuos",
        section: "CABINA DE PILOTO",
        label: "Retirar cualquier residuo visible",
        transito: "si",
        pernocte: true,
    },
    {
        id: "cp_asientos_apoyabrazos",
        section: "CABINA DE PILOTO",
        label: "Limpiar asientos y apoyabrazos",
        transito: false,
        pernocte: true,
    },
    {
        id: "cp_cinturones_hebillas",
        section: "CABINA DE PILOTO",
        label: "Limpiar cinturones de seguridad y hebillas",
        transito: false,
        pernocte: true,
    },
    {
        id: "cp_asientos_plegables",
        section: "CABINA DE PILOTO",
        label: "Extender y limpiar los asientos plegables",
        transito: false,
        pernocte: true,
    },
    {
        id: "cp_puerta_manillas",
        section: "CABINA DE PILOTO",
        label: "Limpiar puerta por dentro y por fuera incluyendo manillas",
        transito: false,
        pernocte: true,
    },
    {
        id: "cp_suelo_aspirar",
        section: "CABINA DE PILOTO",
        label: "Limpiar el suelo, aspirar alfombra, vaciar las papeleras, limpiar los estantes",
        transito: false,
        pernocte: true,
    },

    // ASIENTOS TRIPULACIÓN DE CABINA Y PANELES
    {
        id: "at_aspirar_asiento",
        section: "ASIENTOS TRIPULACIÓN DE CABINA Y PANELES",
        label: "Limpiar y/o aspirar asiento de tripulación y cinturones de seguridad",
        transito: false,
        pernocte: true,
    },
    {
        id: "at_intercomunicador",
        section: "ASIENTOS TRIPULACIÓN DE CABINA Y PANELES",
        label: "Limpiar el intercomunicador de la tripulación de cabina de pasajeros",
        transito: false,
        pernocte: true,
    },
    {
        id: "at_bolsillos",
        section: "ASIENTOS TRIPULACIÓN DE CABINA Y PANELES",
        label: "Vaciar y limpiar los bolsillos del asiento",
        transito: false,
        pernocte: true,
    },

    // GALLEY
    {
        id: "gal_vaciar_contenedores",
        section: "GALLEY",
        label: "Vaciar contenedores de residuos",
        transito: "si",
        pernocte: true,
    },
    {
        id: "gal_limpiar_contenedores",
        section: "GALLEY",
        label: "Limpiar contenedores por dentro y por fuera",
        transito: false,
        pernocte: true,
    },
    {
        id: "gal_bolsas_basura",
        section: "GALLEY",
        label: "Colocar nuevas bolsas de basura (2 por cada contenedor)*",
        transito: "si",
        pernocte: true,
    },
    {
        id: "gal_carros_trolleys",
        section: "GALLEY",
        label: "Limpiar carros o trolleys de residuos por dentro y fuera",
        transito: false,
        pernocte: true,
    },
    {
        id: "gal_superficies_mesones",
        section: "GALLEY",
        label: "Limpiar todas las superficies y mesones del galley",
        transito: "foco",
        pernocte: true,
    },
    {
        id: "gal_paneles_pantallas",
        section: "GALLEY",
        label: "Limpiar paneles/pantallas de tripulación",
        transito: false,
        pernocte: true,
    },
    {
        id: "gal_telefonos",
        section: "GALLEY",
        label: "Limpiar teléfonos / sistema de comunicación",
        transito: false,
        pernocte: true,
    },
    {
        id: "gal_piso",
        section: "GALLEY",
        label: "Limpieza de piso, barrido, aspirado y remoción de manchas",
        transito: "foco",
        pernocte: true,
    },

    // CABINA DE PASAJEROS
    {
        id: "pax_bolsillos_aspirar",
        section: "CABINA DE PASAJEROS",
        label: "Retirar desperdicios de los bolsillos de respaldos, limpiar y aspirar",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_derrames",
        section: "CABINA DE PASAJEROS",
        label: "Remover derrames visibles de comida y bebida",
        transito: "si",
        pernocte: true,
    },
    {
        id: "pax_apoyabrazos",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar apoyabrazos parte superior, inferior y costados",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_cinturones",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar cinturones de asientos y hebillas",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_asientos_respaldos",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar asientos y respaldos incluyendo parte superior y costados",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_desperdicios_piso",
        section: "CABINA DE PASAJEROS",
        label: "Retirar desperdicios del piso (barrer/aspirar alfombra solo foco evidente de suciedad donde aplique)",
        transito: "si",
        pernocte: true,
    },
    {
        id: "pax_barrer_aspirar_completo",
        section: "CABINA DE PASAJEROS",
        label: "Barrer y/o aspirar la alfombra de piso (limpieza completa)",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_panel_superior",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar panel superior (luces y botón de asistencia)",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_ventanas",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar ventanas y sus marcos",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_bandejas",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar bandejas por ambos lados",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_paredes",
        section: "CABINA DE PASAJEROS",
        label: "Limpiar paredes y paneles divisores",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_persianas",
        section: "CABINA DE PASAJEROS",
        label: "Persianas abiertas",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_cinturones_cruzados",
        section: "CABINA DE PASAJEROS",
        label: "Cinturones de asientos cruzados",
        transito: false,
        pernocte: true,
    },
    {
        id: "pax_compartimentos",
        section: "CABINA DE PASAJEROS",
        label: "Compartimentos de equipaje cerrados",
        transito: false,
        pernocte: true,
    },

    // BAÑOS
    {
        id: "ban_vaciar_contenedores",
        section: "BAÑOS",
        label: "Vaciar contenedores de residuos",
        transito: "si",
        pernocte: true,
    },
    {
        id: "ban_limpiar_bolsas",
        section: "BAÑOS",
        label: "Limpiar contenedores de basura y reemplazar bolsas de basura*",
        transito: "si",
        pernocte: true,
    },
    {
        id: "ban_espejo",
        section: "BAÑOS",
        label: "Limpiar espejo",
        transito: false,
        pernocte: true,
    },
    {
        id: "ban_paneles_dispensadores",
        section: "BAÑOS",
        label: "Limpiar paneles alrededor de los dispensadores de papel",
        transito: "foco",
        pernocte: true,
    },
    {
        id: "ban_desinfectar",
        section: "BAÑOS",
        label: "Limpiar y desinfectar receptáculo/taza del baño por dentro y por fuera",
        transito: false,
        pernocte: true,
    },
    {
        id: "ban_puertas_manijas",
        section: "BAÑOS",
        label: "Limpiar puertas por dentro y fuera, incluyendo manijas y cerraduras",
        transito: false,
        pernocte: true,
    },
    {
        id: "ban_mesa_panales",
        section: "BAÑOS",
        label: "Limpiar mesa para cambiar pañales",
        transito: "si",
        pernocte: true,
    },
    {
        id: "ban_piso",
        section: "BAÑOS",
        label: "Limpieza de piso, barrido, aspirado y remoción de manchas",
        transito: "foco",
        pernocte: true,
    },
];
