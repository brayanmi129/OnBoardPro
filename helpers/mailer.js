// Envío de correo con dos implementaciones detrás de la misma función.
//
// El proveedor se elige por entorno para que el flujo de recuperación se pueda
// desarrollar y demostrar sin depender de que haya una cuenta configurada: en
// modo consola el enlace se imprime en el log del servidor y no se envía nada.
//
//   MAIL_PROVIDER=brevo    + BREVO_API_KEY + MAIL_FROM   → envía de verdad
//   MAIL_PROVIDER=consola  (o sin BREVO_API_KEY)         → solo imprime
const PROVEEDOR = (
  process.env.MAIL_PROVIDER || (process.env.BREVO_API_KEY ? "brevo" : "consola")
).toLowerCase();

async function porConsola({ para, asunto, texto }) {
  console.log("\n─────────── correo en modo consola (no se envió nada) ───────────");
  console.log("para  :", para);
  console.log("asunto:", asunto);
  console.log(texto);
  console.log("─────────────────────────────────────────────────────────────────\n");
  return { enviado: false, proveedor: "consola" };
}

async function porBrevo({ para, asunto, html, texto }) {
  if (!process.env.BREVO_API_KEY) throw new Error("Falta BREVO_API_KEY.");
  if (!process.env.MAIL_FROM) throw new Error("Falta MAIL_FROM.");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.MAIL_FROM_NAME || "OnBoardPro",
        email: process.env.MAIL_FROM,
      },
      to: [{ email: para }],
      subject: asunto,
      htmlContent: html,
      textContent: texto,
    }),
    // Sin límite, un proveedor caído dejaría la petición del usuario colgada.
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`Brevo respondió ${res.status}: ${detalle.slice(0, 300)}`);
  }
  return { enviado: true, proveedor: "brevo" };
}

async function enviarCorreo(mensaje) {
  if (PROVEEDOR === "brevo") return porBrevo(mensaje);
  return porConsola(mensaje);
}

module.exports = { enviarCorreo, PROVEEDOR };
