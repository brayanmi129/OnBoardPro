const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const UserService = require("./userService.js");
const { enviarCorreo } = require("../helpers/mailer.js");

const VIGENCIA_MINUTOS = 60;
const MIN_PASSWORD = 8;
// Sin esta espera, cualquiera podría pedir cientos de correos seguidos a la
// dirección de un cliente. No reemplaza a un límite de intentos general
// (HU-013), solo evita el caso más obvio.
const ESPERA_ENTRE_SOLICITUDES_SEG = 60;

// El token va en el correo; lo que se guarda es su SHA-256. Si alguien lee la
// base no puede restablecer contraseñas ajenas. SHA-256 y no bcrypt a propósito:
// bcrypt es lento por diseño para proteger secretos de baja entropía, y un token
// de 256 bits aleatorios no lo necesita.
const hashear = (token) => crypto.createHash("sha256").update(token).digest("hex");

function plantilla(nombre, enlace) {
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  const texto = [
    saludo,
    "",
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta de OnBoardPro.",
    "Abrí este enlace para elegir una nueva:",
    "",
    enlace,
    "",
    `El enlace vence en ${VIGENCIA_MINUTOS} minutos y sirve una sola vez.`,
    "Si no pediste esto, podés ignorar este correo: tu contraseña no cambia.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1f2330">
      <h2 style="font-size:20px;font-weight:600;margin:0 0 16px">Restablecer tu contraseña</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${saludo}</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 22px">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta de OnBoardPro.
      </p>
      <p style="margin:0 0 22px">
        <a href="${enlace}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
           padding:12px 22px;border-radius:9px;font-size:15px;font-weight:600">Elegir una nueva contraseña</a>
      </p>
      <p style="font-size:13.5px;line-height:1.6;color:#6b7280;margin:0 0 6px">
        El enlace vence en ${VIGENCIA_MINUTOS} minutos y sirve una sola vez.
      </p>
      <p style="font-size:13.5px;line-height:1.6;color:#6b7280;margin:0">
        Si no pediste esto, podés ignorar este correo: tu contraseña no cambia.
      </p>
    </div>`;

  return { texto, html };
}

class PasswordResetService {
  /**
   * Paso 1: el usuario pide el enlace.
   *
   * Devuelve siempre lo mismo, exista o no el correo. Si respondiera distinto
   * para los correos que no existen, cualquiera podría usar este endpoint para
   * averiguar quién tiene cuenta en la plataforma, que en un producto B2B
   * equivale a filtrar la nómina de un cliente.
   */
  async solicitar(email) {
    const generico = {
      estado: 200,
      message: "Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.",
    };

    const omitido = (aQuien, motivo) => {
      console.log(`[recuperación] no se envió a ${aQuien}: ${motivo}`);
      return generico;
    };

    if (!email || typeof email !== "string") return omitido(email, "correo vacío o inválido");

    try {
      const user = await UserService._getForAuth(email.trim().toLowerCase());

      // Cada rama corta en silencio: el que pide nunca se entera del motivo.
      // El motivo sí queda en el log del servidor, porque si no es imposible
      // distinguir "no se envió a propósito" de "el envío está roto".
      if (!user) return omitido(email, "no existe ese correo");
      if (user.status !== "Active") return omitido(email, "la cuenta está inactiva");
      // Cuenta de Google o Microsoft: no tiene contraseña que restablecer.
      if (!user.password) {
        return omitido(email, "la cuenta entra por Google o Microsoft, no tiene contraseña");
      }

      const desde = new Date(Date.now() - ESPERA_ENTRE_SOLICITUDES_SEG * 1000).toISOString();
      const { data: reciente } = await supabase
        .from("password_resets")
        .select("id")
        .eq("user_id", user.id)
        .is("used_at", null)
        .gte("created_at", desde)
        .limit(1)
        .maybeSingle();
      if (reciente) {
        return omitido(email, `ya se envió uno hace menos de ${ESPERA_ENTRE_SOLICITUDES_SEG}s`);
      }

      const token = crypto.randomBytes(32).toString("hex");
      const { error } = await supabase.from("password_resets").insert({
        id: crypto.randomBytes(8).toString("hex"),
        user_id: user.id,
        token_hash: hashear(token),
        expires_at: new Date(Date.now() + VIGENCIA_MINUTOS * 60 * 1000).toISOString(),
      });
      if (error) throw new Error(error.message);

      const front = process.env.URL_FRONT || "http://localhost:5173";
      const enlace = `${front}/reset-password?token=${token}`;
      const { texto, html } = plantilla(user.firstname, enlace);

      const envio = await enviarCorreo({
        para: user.email,
        asunto: "Restablecer tu contraseña de OnBoardPro",
        texto,
        html,
      });

      // Queda rastro de que se envió, sin el token: el log no debe alcanzar
      // para restablecer la contraseña de nadie.
      console.log(
        `[recuperación] enlace para ${user.email} vía ${envio.proveedor}` +
          (envio.enviado ? "" : " (no se envió, modo consola)")
      );
    } catch (err) {
      // Un fallo del proveedor de correo no debe delatar que el usuario existe,
      // así que se registra acá y el que pidió recibe la misma respuesta.
      console.error("Error al generar el enlace de recuperación:", err.message);
    }

    return generico;
  }

  /**
   * Paso 2: el usuario llega desde el correo con el token y elige contraseña.
   * No se pide la actual: el que llega es justamente quien no la recuerda, y el
   * token es la prueba de identidad.
   */
  async restablecer(token, nueva) {
    if (!token || !nueva) {
      return { estado: 400, message: "Debe enviar el token y la nueva contraseña." };
    }
    if (typeof nueva !== "string" || nueva.length < MIN_PASSWORD) {
      return {
        estado: 400,
        message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      };
    }

    const { data: fila } = await supabase
      .from("password_resets")
      .select("*")
      .eq("token_hash", hashear(token))
      .maybeSingle();

    // Mismo mensaje para token inexistente y token ya usado: distinguirlos le
    // diría a quien prueba tokens al azar cuándo acertó uno.
    if (!fila || fila.used_at) {
      return { estado: 400, message: "El enlace no es válido o ya fue utilizado." };
    }
    if (new Date(fila.expires_at) < new Date()) {
      return { estado: 400, message: "El enlace venció. Pedí uno nuevo." };
    }

    const resultado = await UserService.updateUser(fila.user_id, { password: nueva });
    if (resultado?.error) return { estado: 500, message: resultado.error };

    await supabase
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", fila.id);

    // Los demás enlaces pendientes de esta persona dejan de servir: si pidió
    // varios, o si alguien más los pidió por ella, ninguno sigue vivo.
    await supabase
      .from("password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", fila.user_id)
      .is("used_at", null);

    return { estado: 200, message: "Contraseña restablecida. Ya podés iniciar sesión." };
  }
}

module.exports = new PasswordResetService();
