import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PernocteRowState } from "../types";
import type { PernocteTableRow } from "./pernocteHelpers";
import { coercePernocteRow, defaultPernocteRow } from "./pernocteHelpers";

const HEADER_H_MM = 34;

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

export async function downloadPernoctePdf(
    rows: PernocteTableRow[],
    pernocteByReg: Record<string, PernocteRowState>,
    dateLabel: string
): Promise<void> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Draw header background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, HEADER_H_MM - 1.2, "F");

    // Add Logo
    const logoData = await fetchLogoAsDataUrl();
    if (logoData) {
        doc.addImage(logoData, "PNG", 10, 9, 52, 12);
    } else {
        doc.setTextColor(...JS.navy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("JetSMART", 12, 17);
    }

    // Title
    doc.setTextColor(...JS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text("INFORME DE PERNOCTE", pageW / 2, 17, { align: "center" });

    // Meta details
    doc.setTextColor(...JS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const rightX = pageW - 12;
    doc.text(`Fecha: ${dateLabel}`, rightX, 10, { align: "right" });
    doc.text(`Generado: ${new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`, rightX, 16.5, {
        align: "right",
    });

    // Red separator line
    doc.setDrawColor(...JS.red);
    doc.setLineWidth(1.1);
    doc.line(0, HEADER_H_MM - 0.2, pageW, HEADER_H_MM - 0.2);

    // Prepare table headers and body
    const head = [
        [
            "Matrícula",
            "ATO",
            "Salida",
            "Posición",
            "Limpieza",
            "Precarga",
            "Avión listo"
        ]
    ];

    const body = rows.map(({ reg, ato, salidaFlt, salidaArr }) => {
        const row = coercePernocteRow(pernocteByReg[reg] ?? defaultPernocteRow());
        
        const salidaText = salidaFlt 
            ? `${salidaFlt}${salidaArr ? ` -> ${salidaArr}` : ""}`
            : "—";
            
        const posicionText = row.posicion.trim() || "—";
        const limpiezaText = row.limpieza ? "Sí" : "Pendiente";
        const precargaText = row.precargaQ.trim() || "—";
        const listoText = row.limpieza ? "Sí" : "Pendiente Limpieza";

        return [
            reg,
            ato,
            salidaText,
            posicionText,
            limpiezaText,
            precargaText,
            listoText
        ];
    });

    // Render table
    autoTable(doc, {
        startY: HEADER_H_MM + 8,
        head,
        body,
        theme: "striped",
        headStyles: {
            fillColor: JS.navy as [number, number, number],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            halign: "left"
        },
        bodyStyles: {
            textColor: JS.text as [number, number, number],
            fontSize: 9
        },
        columnStyles: {
            0: { fontStyle: "bold" }, // Matrícula
            4: { halign: "left" },
            5: { halign: "left" },
            6: { fontStyle: "bold" }
        },
        didParseCell: (data) => {
            // Apply green or red colors to "Avión listo"
            if (data.column.index === 6 && data.section === "body") {
                const val = String(data.cell.raw);
                if (val === "Sí") {
                    data.cell.styles.textColor = [5, 150, 105]; // Green
                    data.cell.styles.fontStyle = "bold";
                } else {
                    data.cell.styles.textColor = [185, 28, 28]; // Red
                    data.cell.styles.fontStyle = "bold";
                }
            }
        }
    });

    // Save/Download PDF
    const filename = `Pernoctes JetSMART - ${dateLabel}.pdf`;
    doc.save(filename);
}
