import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Flight } from "../types";
import { getAirlinePrefix } from "./flightHelpers";
import { totalDelayMinutes, formatDelayCell } from "./dailyReportHelpers";
import { formatMinutesToHHMM, parseTimeToMinutes } from "./mvtTime";

/** Altura del bloque de encabezado (logo + título + meta). Estilo jetsmart.com: claro, navy + acento rojo. */
const HEADER_H_MM = 34;

/** Paleta cercana a [jetsmart.com/ar/es](https://jetsmart.com/ar/es/): navy corporativo, rojo marca, fondos claros. */
const JS = {
    navy: [20, 60, 108] as const,
    red: [200, 32, 48] as const,
    text: [30, 41, 59] as const,
    muted: [82, 100, 118] as const,
    rowAlt: [244, 247, 251] as const,
    border: [226, 232, 240] as const,
};

async function fetchLogoAsDataUrl(): Promise<string | null> {
    try {
        const base = import.meta.env.BASE_URL ?? "/";
        const path = `${base.replace(/\/?$/, "/")}jetsmart-logo.png`;
        const res = await fetch(path);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export interface DailyReportPdfOptions {
    /** Nombre del usuario que genera el PDF (columna derecha). */
    responsibleName: string;
}

/**
 * PDF horizontal (A4 apaisado) con tabla legible para compartir / imprimir.
 */
export async function downloadDailyReportPdf(
    rows: Flight[],
    dateLabel: string,
    options: DailyReportPdfOptions,
): Promise<void> {
    const { responsibleName } = options;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, HEADER_H_MM - 1.2, "F");

    const logoData = await fetchLogoAsDataUrl();
    if (logoData) {
        doc.addImage(logoData, "PNG", 10, 9, 52, 12);
    } else {
        doc.setTextColor(...JS.navy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("JetSMART", 12, 17);
    }

    doc.setTextColor(...JS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text("INFORME DE TURNO HCC ARG", pageW / 2, 17, { align: "center" });

    doc.setTextColor(...JS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const rightX = pageW - 12;
    doc.text(`Fecha: ${dateLabel}`, rightX, 10, { align: "right" });
    doc.text(`Generado: ${new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`, rightX, 16.5, {
        align: "right",
    });
    const resp = (responsibleName || "").trim() || "—";
    doc.text(`Responsable: ${resp}`, rightX, 23, { align: "right" });

    doc.setDrawColor(...JS.red);
    doc.setLineWidth(1.1);
    doc.line(0, HEADER_H_MM - 0.2, pageW, HEADER_H_MM - 0.2);

    const head = [
        [
            "DLY TTL",
            "FLT",
            "STD",
            "ATD",
            "From",
            "To",
            "Reg",
            "Min",
            "1° Code",
            "Min",
            "2° Code",
            "Observaciones",
        ],
    ];

    const body = rows.map((f) => {
        const m = f.mvtData!;
        const ttl = formatMinutesToHHMM(totalDelayMinutes(f));
        const atd = m.atd ? formatMinutesToHHMM(parseTimeToMinutes(m.atd)) : "—";
        const obs = (f.dailyReportObs || "").trim();
        return [
            ttl,
            `${getAirlinePrefix(f.flt)}${f.flt}`,
            f.std || "—",
            atd,
            f.dep,
            f.arr,
            f.reg,
            formatDelayCell(m.dlyTime1),
            m.dlyCod1 || "—",
            formatDelayCell(m.dlyTime2),
            m.dlyCod2 || "—",
            obs || "—",
        ];
    });

    autoTable(doc, {
        head,
        body,
        startY: HEADER_H_MM + 5,
        theme: "striped",
        tableWidth: "auto",
        styles: {
            font: "helvetica",
            fontSize: 7,
            cellPadding: 2,
            overflow: "linebreak",
            valign: "middle",
            minCellHeight: 4.5,
            textColor: JS.text,
            lineColor: JS.border,
            lineWidth: 0.15,
        },
        headStyles: {
            fillColor: [...JS.navy],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
            cellPadding: 2,
        },
        alternateRowStyles: { fillColor: [...JS.rowAlt] },
        columnStyles: {
            0: { cellWidth: 18, halign: "center" },
            1: { cellWidth: 22 },
            2: { cellWidth: 14, halign: "center" },
            3: { cellWidth: 14, halign: "center" },
            4: { cellWidth: 16, halign: "center" },
            5: { cellWidth: 16, halign: "center" },
            6: { cellWidth: 18 },
            7: { cellWidth: 14, halign: "center" },
            8: { cellWidth: 16, halign: "center" },
            9: { cellWidth: 14, halign: "center" },
            10: { cellWidth: 16, halign: "center" },
            11: { cellWidth: "auto" },
        },
        margin: { left: 10, right: 10 },
        didDrawPage: (data) => {
            const footY = doc.internal.pageSize.getHeight() - 7;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(...JS.muted);
            doc.text(`Página ${data.pageNumber}`, pageW / 2, footY, { align: "center" });
        },
    });

    const safeName = dateLabel.replace(/[^\d-]/g, "") || "fecha";
    doc.save(`reporte-diario-demoras-${safeName}.pdf`);
}
