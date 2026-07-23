import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

admin.initializeApp();

// You should set these using Firebase environment variables:
// firebase functions:config:set smtp.user="your-email@outlook.com" smtp.pass="your-password"
// Or use process.env if you prefer the newer v2 secrets / env approach.
const smtpUser = process.env.SMTP_USER || functions.config().smtp?.user;
const smtpPass = process.env.SMTP_PASS || functions.config().smtp?.pass;

export const sendDailyDelayReport = functions.pubsub.schedule("0 23 * * *")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    if (!smtpUser || !smtpPass) {
        console.error("Missing SMTP credentials (SMTP_USER/SMTP_PASS or functions.config().smtp)");
        return null;
    }

    const transporter = nodemailer.createTransport({
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
          ciphers: "SSLv3"
      }
    });

    const now = new Date();
    // UTC to Argentina time (UTC-3)
    const argTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayStr = argTime.toISOString().split("T")[0]; // YYYY-MM-DD

    const db = admin.database();
    const flightsRef = db.ref("flights");
    
    // Fetch all flights for the date
    const snapshot = await flightsRef.orderByChild("date").equalTo(todayStr).once("value");
    
    if (!snapshot.exists()) {
        console.log(`No flights found for date ${todayStr}`);
        return null;
    }

    const flights = snapshot.val();
    const delayedFlights: any[] = [];

    // Filter flights
    Object.keys(flights).forEach(key => {
        const flight = flights[key];
        
        const mvt = flight.mvtData || {};
        const isDly87 = mvt.dlyCod1 === "87" || mvt.dlyCod2 === "87";
        
        const obs = (flight.dailyReportObs || "").toLowerCase();
        const hasMangaOrPuente = obs.includes("manga") || obs.includes("puente");

        if (isDly87 && hasMangaOrPuente) {
            delayedFlights.push(flight);
        }
    });

    if (delayedFlights.length === 0) {
        console.log("No delayed flights matched the criteria today.");
        return null;
    }

    // Build email HTML
    let html = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Resumen diario de demoras (DLY 87 - Manga/Puente)</h2>
        <p>Fecha de operación: <strong>${todayStr}</strong></p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 800px;">
          <thead>
            <tr style="background-color: #f2f2f2; text-align: left;">
              <th>Vuelo</th>
              <th>Matrícula</th>
              <th>Ruta</th>
              <th>Demoras</th>
              <th>Observaciones (Reporte Diario)</th>
            </tr>
          </thead>
          <tbody>
    `;

    delayedFlights.forEach(f => {
        const mvt = f.mvtData || {};
        const demoras = [mvt.dlyCod1, mvt.dlyCod2].filter(d => d).join(" / ");
        html += `
          <tr>
            <td><strong>${f.flt || ""}</strong></td>
            <td>${f.reg || ""}</td>
            <td>${f.route || ""}</td>
            <td>${demoras}</td>
            <td>${f.dailyReportObs || ""}</td>
          </tr>
        `;
    });

    html += `
          </tbody>
        </table>
        <br>
        <p style="font-size: 12px; color: #777;">Este es un mensaje generado automáticamente por el sistema SMARTOPS.</p>
      </div>
    `;

    try {
        await transporter.sendMail({
            from: `"SMARTOPS Notificaciones" <${smtpUser}>`,
            to: "tomas.dicono@jetsmart.com",
            subject: `SMARTOPS - Vuelos con DLY 87 (Manga/Puente) - ${todayStr}`,
            html: html,
        });
        console.log("Email sent successfully!");
    } catch (error) {
        console.error("Error sending email:", error);
    }

    return null;
  });
