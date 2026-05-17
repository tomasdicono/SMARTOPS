/** Documento descargable para rol SC (archivos en `public/documentos-sc/`). */
export interface ScUsefulDocument {
    id: string;
    title: string;
    description?: string;
    /** Ruta pública, ej. `/documentos-sc/archivo.pdf` */
    href: string;
    /** Nombre sugerido al descargar */
    fileName: string;
}

function docPath(fileName: string): string {
    return `/documentos-sc/${encodeURIComponent(fileName)}`;
}

/**
 * Archivos en `public/documentos-sc/`. El `fileName` debe coincidir con el nombre del archivo en disco.
 */
export const SC_USEFUL_DOCUMENTS: ScUsefulDocument[] = [
    {
        id: "notoc-weap",
        title: "NOTOC Weap",
        href: docPath("Notoc Weap.pdf"),
        fileName: "Notoc Weap.pdf",
    },
    {
        id: "notoc-silla-litio",
        title: "NOTOC Silla de rueda — Batería litio",
        href: docPath("NOTOC SILLA DE RUEDA - BATERIA LITIO.pdf"),
        fileName: "NOTOC SILLA DE RUEDA - BATERIA LITIO.pdf",
    },
    {
        id: "notoc-silla-no-derramable",
        title: "NOTOC Silla de rueda — Batería no derramable",
        href: docPath("NOTOC SILLA DE RUEDA - BATERIA NO DERRAMABLE.pdf"),
        fileName: "NOTOC SILLA DE RUEDA - BATERIA NO DERRAMABLE.pdf",
    },
    {
        id: "resumen-ayudas-motrices",
        title: "Resumen ayudas motrices",
        href: docPath("Resumen Ayudas motrices.png"),
        fileName: "Resumen Ayudas motrices.png",
    },
];
