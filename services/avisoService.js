const { supabase } = require("../helpers/supabaseHelper.js");
const { enviarCorreo } = require("../helpers/mailer.js");

/**
 * Avisos por correo cuando aparece algo nuevo para hacer.
 *
 * Solo dos eventos, los dos de creación:
 *
 *   curso asignado    → "tenés este curso nuevo"
 *   actividad nueva   → "se agregó contenido al curso que ya tenías"
 *
 * Son infrecuentes y accionables. Un correo por cada cosa que pasa se silencia
 * en una semana, y como salen de la misma cuenta que manda la recuperación de
 * contraseña, si empiezan a caer en spam nadie puede recuperar su clave.
 *
 * Nada de esto bloquea la operación: si el correo falla, el curso ya está
 * asignado y la actividad ya está creada. Se registra y sigue.
 */

function envoltorio(titulo, cuerpoHtml) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1f2330">
      <h2 style="font-size:20px;font-weight:600;margin:0 0 16px">${titulo}</h2>
      ${cuerpoHtml}
      <p style="font-size:12.5px;color:#9ca3af;margin:26px 0 0;border-top:1px solid #e5e7eb;padding-top:12px">
        OnBoardPro
      </p>
    </div>`;
}

const FRONT = () => process.env.URL_FRONT || "http://localhost:5173";

function boton(texto) {
  return `<p style="margin:0">
    <a href="${FRONT()}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
       padding:11px 20px;border-radius:9px;font-size:14.5px;font-weight:600">${texto}</a>
  </p>`;
}

/** Aprendices activos de un conjunto de equipos, sin repetir. */
async function aprendicesDe(groupIds) {
  if (!groupIds?.length) return [];
  const { data: ug } = await supabase
    .from("users_groups").select("id_user").in("id_group", groupIds);
  if (!ug?.length) return [];

  const { data } = await supabase
    .from("users").select("id, email, firstname")
    .in("id", [...new Set(ug.map((u) => u.id_user))])
    .eq("role", "student").eq("status", "Active");
  return data || [];
}

class AvisoService {
  /**
   * Un curso quedó asignado a uno o varios equipos (HU-024).
   *
   * El aviso va acá y no al crear el curso: un curso recién creado no lo tiene
   * nadie todavía, así que no habría a quién avisarle. El momento en que
   * alguien gana acceso es cuando se le asigna a su equipo.
   */
  static async cursoAsignado({ courseIds, groupIds }) {
    try {
      const personas = await aprendicesDe(groupIds);
      if (!personas.length) return;

      const { data: cursos } = await supabase
        .from("courses").select("id, name, instructor").in("id", courseIds);
      if (!cursos?.length) return;

      const lista = cursos.map((c) => c.name);
      const uno = lista.length === 1;
      const asunto = uno ? `Tenés un curso nuevo: ${lista[0]}` : `Tenés ${lista.length} cursos nuevos`;

      for (const p of personas) {
        const saludo = p.firstname ? `Hola ${p.firstname},` : "Hola,";
        await enviarCorreo({
          para: p.email,
          asunto,
          texto: [
            saludo, "",
            uno
              ? `Se te asignó el curso "${lista[0]}". Ya podés empezarlo.`
              : `Se te asignaron estos cursos:\n\n${lista.map((n) => `  · ${n}`).join("\n")}`,
            "", `Entrá para verlos: ${FRONT()}`,
          ].join("\n"),
          html: envoltorio(uno ? "Tenés un curso nuevo" : "Tenés cursos nuevos", `
            <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${saludo}</p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
              ${uno
                ? `Se te asignó el curso <strong>${lista[0]}</strong>. Ya podés empezarlo.`
                : "Se te asignaron estos cursos:"}
            </p>
            ${uno ? "" : `<ul style="font-size:15px;line-height:1.9;margin:0 0 18px;padding-left:20px">
              ${lista.map((n) => `<li><strong>${n}</strong></li>`).join("")}</ul>`}
            ${boton("Ver mis cursos")}`),
        });
      }

      console.log(`[aviso] curso asignado avisado a ${personas.length} persona(s)`);
    } catch (err) {
      console.error("[aviso] no se pudo avisar el curso asignado:", err.message);
    }
  }

  /**
   * Se agregó una actividad a un curso.
   *
   * Los destinatarios salen de recorrer curso → equipos → personas, que es la
   * misma cadena por la que alguien accede al curso. Si todavía no lo tiene
   * nadie, no se manda nada en vez de mandar al vacío.
   */
  static async actividadNueva({ actividad, sectionId }) {
    try {
      if (!sectionId) return;

      const { data: seccion } = await supabase
        .from("sections").select("course_id, name").eq("id", sectionId).maybeSingle();
      if (!seccion) return;

      const { data: curso } = await supabase
        .from("courses").select("id, name").eq("id", seccion.course_id).maybeSingle();
      if (!curso) return;

      const { data: gc } = await supabase
        .from("groups_courses").select("id_group").eq("id_course", curso.id);

      const personas = await aprendicesDe((gc || []).map((g) => g.id_group));
      if (!personas.length) return;

      const asunto = `Nuevo contenido en ${curso.name}`;
      for (const p of personas) {
        const saludo = p.firstname ? `Hola ${p.firstname},` : "Hola,";
        await enviarCorreo({
          para: p.email,
          asunto,
          texto: [
            saludo, "",
            `Se agregó "${actividad.title}" al curso ${curso.name}, en la sección ${seccion.name}.`,
            "", `Entrá para verlo: ${FRONT()}`,
          ].join("\n"),
          html: envoltorio("Nuevo contenido en tu curso", `
            <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${saludo}</p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
              Se agregó <strong>${actividad.title}</strong> al curso
              <strong>${curso.name}</strong>, en la sección ${seccion.name}.
            </p>
            ${boton("Ver el curso")}`),
        });
      }

      console.log(`[aviso] actividad nueva avisada a ${personas.length} persona(s) de ${curso.name}`);
    } catch (err) {
      console.error("[aviso] no se pudo avisar la actividad nueva:", err.message);
    }
  }
}

module.exports = AvisoService;
