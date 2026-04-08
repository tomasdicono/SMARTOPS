import type { Flight } from "../types";
import { GANTT_CHARTS } from "./hitosData";
import {
    parseToMins,
    formatMins,
    refMinutesForHitos,
    demoraOperacional,
    getCrewTargetInfo,
} from "./hitosReference";

/** Debe coincidir con HitosCrewTab */
const CREW_HITO_LABELS = [
    "Llegada crew",
    "Inicio embarque",
    "Fin embarque",
    "Cierre puertas",
] as const;

function formatAtaForDisplay(ata: string): string {
    const d = String(ata ?? "").replace(/\D/g, "");
    if (d.length >= 3) return formatMins(parseToMins(d.padStart(4, "0").slice(-4)));
    return ata || "—";
}

type DemoraKind = "ok" | "late" | "neutral";

function demoraKind(demora: string): DemoraKind {
    if (demora === "—" || demora.trim() === "") return "neutral";
    if (demora === "A tiempo") return "ok";
    if (demora.startsWith("+")) return "late";
    return "neutral";
}

interface HitosSummaryRow {
    hito: string;
    esperado: string;
    real: string;
    demora: string;
    demoraKind: DemoraKind;
}

interface HitosSummaryPayload {
    meta: {
        date: string;
        flt: string;
        dep: string;
        arr: string;
        reg: string;
        std: string;
        sta: string;
    };
    operational: {
        hasData: boolean;
        chartName?: string;
        ata?: string;
        rows: HitosSummaryRow[];
        fallbackNote?: string;
    };
    crew: {
        subtitle: string;
        rows: HitosSummaryRow[];
    };
}

function row(hito: string, esperado: string, real: string, demora: string): HitosSummaryRow {
    return { hito, esperado, real, demora, demoraKind: demoraKind(demora) };
}

function buildHitosSummaryPayload(flight: Flight): HitosSummaryPayload {
    const meta = {
        date: flight.date,
        flt: flight.flt,
        dep: flight.dep,
        arr: flight.arr,
        reg: flight.reg || "—",
        std: flight.std,
        sta: flight.sta,
    };

    const h = flight.hitosData;
    let operational: HitosSummaryPayload["operational"];

    if (!h?.ganttChartName) {
        operational = {
            hasData: false,
            rows: [],
        };
    } else {
        const chart = GANTT_CHARTS.find((c) => c.name === h.ganttChartName);
        if (!chart) {
            const rows: HitosSummaryRow[] = [];
            const entries = h.entries || {};
            for (const k of Object.keys(entries).sort()) {
                const v = entries[k];
                const real =
                    v && String(v).trim() !== "" && String(v).replace(/\D/g, "").length >= 3
                        ? formatMins(parseToMins(String(v).replace(/\D/g, "").padStart(4, "0").slice(-4)))
                        : "—";
                rows.push(row(k, "—", real, "—"));
            }
            operational = {
                hasData: true,
                chartName: h.ganttChartName,
                ata: h.ata,
                rows,
                fallbackNote: "Carta no encontrada en definiciones; solo valores registrados.",
            };
        } else {
            const refM = refMinutesForHitos(flight, h, chart);
            const rows: HitosSummaryRow[] = [];
            for (const m of chart.milestones.filter((x) => x.offsetMinutes !== null)) {
                const targetMins = refM - m.offsetMinutes!;
                const esperado = formatMins(targetMins);
                const val = h.entries[m.name] || "";
                let real = "—";
                let demora = "—";
                if (val.length >= 3) {
                    const valMins = parseToMins(val.padStart(4, "0"));
                    real = formatMins(valMins);
                    demora = demoraOperacional(valMins, targetMins);
                }
                rows.push(row(m.name, esperado, real, demora));
            }
            const known = new Set(chart.milestones.map((x) => x.name));
            const extra = Object.keys(h.entries || {}).filter((k) => !known.has(k));
            for (const k of extra.sort()) {
                const v = h.entries![k];
                const real =
                    v && String(v).trim() !== "" && String(v).replace(/\D/g, "").length >= 3
                        ? formatMins(parseToMins(String(v).replace(/\D/g, "").padStart(4, "0").slice(-4)))
                        : "—";
                rows.push(row(k, "—", real, "—"));
            }
            operational = {
                hasData: true,
                chartName: h.ganttChartName,
                ata: h.ata,
                rows,
            };
        }
    }

    const crewRows: HitosSummaryRow[] = [];
    const crew = flight.hitosCrewData || {};
    const hData = flight.hitosData;
    const opChartResolved = hData?.ganttChartName
        ? GANTT_CHARTS.find((c) => c.name === hData.ganttChartName)
        : null;

    for (const label of CREW_HITO_LABELS) {
        const v = crew[label];
        const targetInfo = getCrewTargetInfo(flight, hData, label);
        let esperado = "—";
        let real = "—";
        let demora = "—";
        if (targetInfo) {
            esperado = targetInfo.esperado;
        }
        if (v && String(v).trim() !== "" && String(v).replace(/\D/g, "").length >= 3) {
            const valMins = parseToMins(String(v).replace(/\D/g, "").padStart(4, "0").slice(-4));
            real = formatMins(valMins);
            if (targetInfo) {
                demora = demoraOperacional(valMins, targetInfo.targetMins);
            }
        }
        crewRows.push(row(label, esperado, real, demora));
    }
    const knownCrew = new Set<string>(CREW_HITO_LABELS);
    const extraKeys = Object.keys(crew).filter((k) => !knownCrew.has(k));
    for (const k of extraKeys.sort()) {
        const v = crew[k];
        const targetInfo = getCrewTargetInfo(flight, hData, k);
        let esperado = "—";
        let real = "—";
        let demora = "—";
        if (targetInfo) {
            esperado = targetInfo.esperado;
        }
        if (v && String(v).trim() !== "" && String(v).replace(/\D/g, "").length >= 3) {
            const valMins = parseToMins(String(v).replace(/\D/g, "").padStart(4, "0").slice(-4));
            real = formatMins(valMins);
            if (targetInfo) {
                demora = demoraOperacional(valMins, targetInfo.targetMins);
            }
        }
        crewRows.push(row(k, esperado, real, demora));
    }

    const crewSubtitle = opChartResolved
        ? "Los horarios esperados coinciden con la carta Gantt y la referencia del vuelo (mismo criterio que hitos operacionales)."
        : "Definí hitos operacionales con carta Gantt para obtener horarios esperados y demoras de referencia en tripulación.";

    return {
        meta,
        operational,
        crew: {
            subtitle: crewSubtitle,
            rows: crewRows,
        },
    };
}

export function buildHitosSummaryText(flight: Flight): string {
    const p = buildHitosSummaryPayload(flight);
    const lines: string[] = [];
    lines.push("SMARTOPS — Resumen de hitos");
    lines.push("");
    lines.push(`Fecha: ${p.meta.date}`);
    lines.push(`Vuelo: ${p.meta.flt}`);
    lines.push(`Ruta: ${p.meta.dep} → ${p.meta.arr}`);
    lines.push(`Matrícula: ${p.meta.reg}`);
    lines.push(`STD ${p.meta.std}  STA ${p.meta.sta}`);
    lines.push("");
    lines.push("=== Hitos operacionales ===");
    if (!p.operational.hasData) {
        lines.push("(sin datos de hitos operacionales)");
    } else {
        if (p.operational.chartName) lines.push(`Carta Gantt: ${p.operational.chartName}`);
        if (p.operational.ata !== undefined) lines.push(`ATA: ${p.operational.ata ? formatAtaForDisplay(p.operational.ata) : "—"}`);
        if (p.operational.fallbackNote) lines.push(`(${p.operational.fallbackNote})`);
        lines.push("");
        lines.push("Hito | Esperado | Real | Demora");
        for (const r of p.operational.rows) {
            lines.push(`${r.hito} | ${r.esperado} | ${r.real} | ${r.demora}`);
        }
    }
    lines.push("");
    lines.push("=== Hitos tripulación ===");
    lines.push(`(${p.crew.subtitle})`);
    lines.push("Hito | Esperado | Real | Demora");
    for (const r of p.crew.rows) {
        lines.push(`${r.hito} | ${r.esperado} | ${r.real} | ${r.demora}`);
    }
    lines.push("");
    return lines.join("\n");
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function demoraCellHtml(demora: string, kind: DemoraKind): string {
    const t = escapeHtml(demora);
    if (kind === "ok") {
        return `<span class="pill pill-ok">${t}</span>`;
    }
    if (kind === "late") {
        return `<span class="pill pill-late">${t}</span>`;
    }
    return `<span class="muted">${t}</span>`;
}

export function buildHitosSummaryHtml(flight: Flight): string {
    const p = buildHitosSummaryPayload(flight);
    const m = p.meta;

    const opRowsHtml = p.operational.rows
        .map(
            (r) => `
      <tr>
        <td class="col-hito">${escapeHtml(r.hito)}</td>
        <td class="mono">${escapeHtml(r.esperado)}</td>
        <td class="mono">${escapeHtml(r.real)}</td>
        <td class="col-dem">${demoraCellHtml(r.demora, r.demoraKind)}</td>
      </tr>`
        )
        .join("");

    const crewRowsHtml = p.crew.rows
        .map(
            (r) => `
      <tr>
        <td class="col-hito">${escapeHtml(r.hito)}</td>
        <td class="mono">${escapeHtml(r.esperado)}</td>
        <td class="mono">${escapeHtml(r.real)}</td>
        <td class="col-dem">${demoraCellHtml(r.demora, r.demoraKind)}</td>
      </tr>`
        )
        .join("");

    const opSection =
        !p.operational.hasData
            ? `<p class="empty">Sin datos de hitos operacionales.</p>`
            : `
    <div class="card">
      <h2>Hitos operacionales</h2>
      ${p.operational.chartName ? `<p class="meta-line"><strong>Carta Gantt</strong> · ${escapeHtml(p.operational.chartName)}</p>` : ""}
      ${p.operational.ata !== undefined ? `<p class="meta-line"><strong>ATA</strong> · ${escapeHtml(p.operational.ata ? formatAtaForDisplay(p.operational.ata) : "—")}</p>` : ""}
      ${p.operational.fallbackNote ? `<p class="warn">${escapeHtml(p.operational.fallbackNote)}</p>` : ""}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hito</th>
              <th>Esperado</th>
              <th>Real</th>
              <th>Demora</th>
            </tr>
          </thead>
          <tbody>${opRowsHtml}</tbody>
        </table>
      </div>
    </div>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SMARTOPS — Hitos ${escapeHtml(m.flt)}</title>
  <style>
    :root {
      --bg: #f1f5f9;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --cyan: #0891b2;
      --cyan-soft: #ecfeff;
      --ok: #059669;
      --ok-bg: #d1fae5;
      --late: #c2410c;
      --late-bg: #ffedd5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(180deg, var(--cyan-soft) 0%, var(--bg) 320px);
      color: var(--text);
      line-height: 1.5;
      padding: 24px 16px 48px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .shell {
      max-width: 880px;
      margin: 0 auto;
    }
    .hero {
      background: linear-gradient(135deg, #0e7490 0%, #06b6d4 50%, #22d3ee 100%);
      color: #fff;
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px -10px rgba(8, 145, 178, 0.45);
    }
    .hero h1 {
      margin: 0 0 4px;
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .hero p.tag {
      margin: 0 0 16px;
      opacity: 0.92;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .kv {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px 20px;
      font-size: 0.9rem;
    }
    .kv div span:first-child {
      display: block;
      font-size: 0.65rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.85;
      margin-bottom: 2px;
    }
    .kv .v {
      font-weight: 700;
      font-size: 1rem;
    }
    .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 22px 8px;
      margin-bottom: 18px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 1rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0e7490;
    }
    .meta-line { margin: 0 0 8px; font-size: 0.9rem; color: var(--text); }
    .meta-line strong { color: #0f172a; }
    .warn {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      color: #92400e;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 0.85rem;
      margin-bottom: 12px;
    }
    .sub {
      font-size: 0.8rem;
      color: var(--muted);
      margin: -4px 0 14px;
    }
    .table-wrap { overflow-x: auto; margin: 0 -6px 12px; padding: 0 6px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      background: #f8fafc;
      border-bottom: 2px solid var(--border);
      font-size: 0.65rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    td {
      padding: 11px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) { background: #fafbfc; }
    tbody tr:hover { background: #f0fdfa; }
    .col-hito { font-weight: 600; max-width: 280px; }
    .col-dem { white-space: nowrap; }
    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .pill-ok {
      background: var(--ok-bg);
      color: var(--ok);
    }
    .pill-late {
      background: var(--late-bg);
      color: var(--late);
    }
    .muted { color: var(--muted); font-weight: 600; }
    .empty {
      padding: 16px;
      color: var(--muted);
      text-align: center;
      background: var(--card);
      border-radius: 14px;
      border: 1px dashed var(--border);
    }
    footer {
      text-align: center;
      font-size: 0.75rem;
      color: var(--muted);
      margin-top: 24px;
    }
    @media print {
      body { background: #fff; padding: 12px; }
      .hero { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <h1>Resumen de hitos</h1>
      <p class="tag">SMARTOPS · Generado para revisión operacional</p>
      <div class="kv">
        <div><span>Fecha</span><span class="v">${escapeHtml(m.date)}</span></div>
        <div><span>Vuelo</span><span class="v">${escapeHtml(m.flt)}</span></div>
        <div><span>Ruta</span><span class="v">${escapeHtml(m.dep)} → ${escapeHtml(m.arr)}</span></div>
        <div><span>Matrícula</span><span class="v mono">${escapeHtml(m.reg)}</span></div>
        <div><span>STD</span><span class="v mono">${escapeHtml(m.std)}</span></div>
        <div><span>STA</span><span class="v mono">${escapeHtml(m.sta)}</span></div>
      </div>
    </header>
    ${opSection}
    <div class="card">
      <h2>Hitos tripulación</h2>
      <p class="sub">${escapeHtml(p.crew.subtitle)}</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hito</th>
              <th>Esperado</th>
              <th>Real</th>
              <th>Demora</th>
            </tr>
          </thead>
          <tbody>${crewRowsHtml}</tbody>
        </table>
      </div>
    </div>
    <footer>SMARTOPS — Los horarios operacionales usan la misma referencia que el control de hitos en la aplicación.</footer>
  </div>
</body>
</html>`;
}

function safeFilePart(s: string): string {
    return s.replace(/[^\w.-]+/g, "_").slice(0, 40) || "vuelo";
}

export function downloadHitosSummary(flight: Flight): void {
    const html = buildHitosSummaryHtml(flight);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const flt = safeFilePart(flight.flt);
    const date = safeFilePart(flight.date);
    a.download = `hitos_${flt}_${date}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
