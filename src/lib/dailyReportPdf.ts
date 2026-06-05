import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Flight } from "../types";
import { getAirlinePrefix } from "./flightHelpers";
import type { StatusDiaDaySummary } from "./controlHelpers";
import type { DailyReportOtp } from "./dailyReportOtp";
import { formatOtpPercentForReport } from "./dailyReportOtp";
import { formatDelayCodeDisplay } from "./delayCodes";
import {
    totalDelayMinutes,
    formatDelayCell,
    isDelayTimeAtLeast15Minutes,
} from "./dailyReportHelpers";
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
    /** Mismo criterio que Reporte diario en pantalla (DLY TIME ≥ 15 min). */
    delayCellBg: [254, 226, 226] as const,
    delayCellText: [153, 27, 27] as const,
};

/** Columnas «Min» (DLY TIME 1 y 2) en la tabla principal del informe. */
const PDF_DLY_TIME_COL_INDEXES = [7, 9] as const;

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
    /** Indicadores de status día (ocupación, reprogramaciones, etc.). OTP va en `manualOtp`. */
    statusDia: StatusDiaDaySummary;
    /** OTP0 y OTP15 ingresados a mano en Reporte diario. */
    manualOtp: DailyReportOtp;
}

function buildStatusDiaPdfRows(s: StatusDiaDaySummary, manualOtp: DailyReportOtp): string[][] {
    const otp0Display = formatOtpPercentForReport(manualOtp.otp0) ?? "—";
    const otp15Display = formatOtpPercentForReport(manualOtp.otp15) ?? "—";
    const rows: string[][] = [
        ["Vuelos programados", String(s.totalVuelosDia)],
        ["Vuelos operados (MVT enviado)", String(s.countVuelosOperados)],
        ["Vuelos JES con MVT (base OTP)", s.nMvtOtp > 0 ? String(s.nMvtOtp) : "—"],
        ["OTP0", otp0Display],
        ["OTP15", otp15Display],
        [
            "Factor de ocupación programado",
            s.factorOcupacionProgramadoPct != null ? `${s.factorOcupacionProgramadoPct.toFixed(1)}%` : "—",
        ],
        [
            "Factor de ocupación ejecutado",
            s.factorOcupacionRealPct != null ? `${s.factorOcupacionRealPct.toFixed(1)}%` : "—",
        ],
        ["Pasajeros embarcados", s.pasajerosEmbarcados.toLocaleString("es-AR")],
        ["Vuelos reprogramados", String(s.countVuelosReprogramados)],
        ["PAX afectados (reprogramación)", String(s.paxAfectadosReprogramacion)],
        ["Afectaciones de ruta", String(s.countAfectacionesRuta)],
        ["Cancelaciones / PAX cancelados", `${s.countCancelados} / ${s.paxCancelados}`],
    ];
    if (s.demoraCodigos.length > 0) {
        rows.push([
            "Códigos demora MVT (participación en el día)",
            s.demoraCodigos
                .map((d) => `${formatDelayCodeDisplay(d.code)} (${d.pct.toFixed(0)}%)`)
                .join(" · "),
        ]);
    }
    return rows;
}

/**
 * PDF horizontal (A4 apaisado) con tabla legible para compartir / imprimir.
 */
export async function downloadDailyReportPdf(
    rows: Flight[],
    dateLabel: string,
    options: DailyReportPdfOptions,
): Promise<void> {
    const { responsibleName, statusDia, manualOtp } = options;
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
            textColor: [...JS.text] as [number, number, number],
            lineColor: [...JS.border] as [number, number, number],
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
        didParseCell: (data) => {
            if (data.section !== "body") return;
            if (data.column.index !== PDF_DLY_TIME_COL_INDEXES[0] && data.column.index !== PDF_DLY_TIME_COL_INDEXES[1]) {
                return;
            }
            const f = rows[data.row.index];
            const m = f?.mvtData;
            if (!m) return;
            const raw = data.column.index === 7 ? m.dlyTime1 : m.dlyTime2;
            if (!isDelayTimeAtLeast15Minutes(raw)) return;
            data.cell.styles.fillColor = [...JS.delayCellBg];
            data.cell.styles.textColor = [...JS.delayCellText];
            data.cell.styles.fontStyle = "bold";
        },
    });

    const pageH = doc.internal.pageSize.getHeight();
    const docExt = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    let yAfterMain = (docExt.lastAutoTable?.finalY ?? HEADER_H_MM + 30) + 10;
    const minSpaceMm = 42;
    if (yAfterMain > pageH - minSpaceMm) {
        doc.addPage();
        yAfterMain = 14;
    } else {
        yAfterMain += 2;
    }

    doc.setTextColor(...JS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("STATUS DÍA (RESUMEN)", 10, yAfterMain);

    autoTable(doc, {
        startY: yAfterMain + 4,
        head: [["Indicador", "Valor"]],
        body: buildStatusDiaPdfRows(statusDia, manualOtp),
        theme: "striped",
        tableWidth: "auto",
        styles: {
            font: "helvetica",
            fontSize: 7,
            cellPadding: 2,
            overflow: "linebreak",
            valign: "top",
            textColor: [...JS.text] as [number, number, number],
            lineColor: [...JS.border] as [number, number, number],
            lineWidth: 0.15,
        },
        headStyles: {
            fillColor: [...JS.navy],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
        },
        alternateRowStyles: { fillColor: [...JS.rowAlt] },
        columnStyles: {
            0: { cellWidth: 62 },
            1: { cellWidth: "auto" },
        },
        margin: { left: 10, right: 10 },
    });

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footY = doc.internal.pageSize.getHeight() - 7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...JS.muted);
        doc.text(`Página ${i} de ${totalPages}`, pageW / 2, footY, { align: "center" });
    }
    doc.setPage(totalPages);

    const safeName = dateLabel.replace(/[^\d-]/g, "") || "fecha";
    doc.save(`reporte-diario-demoras-${safeName}.pdf`);
}
