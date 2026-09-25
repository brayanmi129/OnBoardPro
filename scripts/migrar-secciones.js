// Pasa el contenido de los cursos al modelo de secciones (HU-032).
//
// Antes cada curso tenía un array `actividades` con ids sueltos. Ahora las
// actividades cuelgan de una sección. Este script crea una sección "General"
// por curso y mete ahí lo que ya tenía, respetando el orden del array.
//
// Es idempotente: si un curso ya tiene secciones, no lo vuelve a tocar.
//
//   node scripts/migrar-secciones.js            (muestra qué haría)
//   node scripts/migrar-secciones.js --aplicar  (lo hace)
require("dotenv").config();
const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");

const APLICAR = process.argv.includes("--aplicar");

(async () => {
  const { data: cursos, error } = await supabase
    .from("courses")
    .select("id, name, tenant_id, actividades");
  if (error) {
    console.error("No se pudieron leer los cursos:", error.message);
    process.exit(1);
  }

  const { data: yaTienen } = await supabase.from("sections").select("course_id");
  const conSecciones = new Set((yaTienen || []).map((s) => s.course_id));

  console.log(APLICAR ? "Aplicando la migración\n" : "Simulación (agregá --aplicar para ejecutar)\n");

  let creadas = 0;
  let movidas = 0;
  let omitidos = 0;

  for (const curso of cursos || []) {
    const ids = curso.actividades || [];

    if (conSecciones.has(curso.id)) {
      console.log(`  ·  ${curso.id.padEnd(10)} ${curso.name.slice(0, 32).padEnd(34)} ya tiene secciones, se omite`);
      omitidos++;
      continue;
    }
    if (!ids.length) {
      console.log(`  ·  ${curso.id.padEnd(10)} ${curso.name.slice(0, 32).padEnd(34)} sin actividades, nada que mover`);
      omitidos++;
      continue;
    }

    const seccion = {
      id: crypto.randomBytes(3).toString("hex"),
      course_id: curso.id,
      tenant_id: curso.tenant_id,
      name: "General",
      orden: 0,
    };

    console.log(`  ✔  ${curso.id.padEnd(10)} ${curso.name.slice(0, 32).padEnd(34)} → sección "General" con ${ids.length} actividad(es)`);

    if (!APLICAR) { creadas++; movidas += ids.length; continue; }

    const { error: e1 } = await supabase.from("sections").insert(seccion);
    if (e1) { console.error(`     ✘ no se pudo crear la sección: ${e1.message}`); continue; }
    creadas++;

    // El orden del array era el único orden que existía: se conserva.
    for (const [posicion, idActividad] of ids.entries()) {
      const { error: e2 } = await supabase
        .from("activities")
        .update({ section_id: seccion.id, orden: posicion })
        .eq("id", idActividad);
      if (e2) console.error(`     ✘ actividad ${idActividad}: ${e2.message}`);
      else movidas++;
    }
  }

  console.log(`\nsecciones creadas: ${creadas} · actividades ubicadas: ${movidas} · cursos omitidos: ${omitidos}`);

  if (APLICAR) {
    const { data: sueltas } = await supabase
      .from("activities").select("id").is("section_id", null);
    if (sueltas?.length) {
      console.log(
        `\nAtención: ${sueltas.length} actividad(es) quedaron sin sección porque ningún curso las referenciaba.` +
        `\nNo se pierden: se pueden ubicar con PUT /api/activities/{id}/seccion.`
      );
    }
  }
})();
