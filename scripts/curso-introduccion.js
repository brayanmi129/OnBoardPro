// Crea el curso "Introducción a OnBoard Pro" en organizaciones que ya existen
// (las nuevas lo reciben solas al crearse).
//
//   node scripts/curso-introduccion.js <tenantId>             una organización
//   node scripts/curso-introduccion.js --todas                todas
//   node scripts/curso-introduccion.js --todas --plan         muestra qué haría, sin escribir
//   node scripts/curso-introduccion.js --todas --videos <carpeta>
//   node scripts/curso-introduccion.js --todas --para-todos [--plan]
//
// Con --para-todos no crea nada: marca el curso de introducción que ya tiene
// cada organización como "para toda la organización" (lo ven todos sus
// aprendices sin asignarlo a grupos). Requiere la columna courses.para_todos.
//
// Con --videos sube a Storage (bucket "materiales") los .mp4 de la carpeta cuyo
// nombre coincide con el campo "video" de cada actividad en
// data/curso-introduccion.json, una sola vez y a una ruta fija
// (plataforma/curso-introduccion/<archivo>), y los registra como material de
// cada actividad. Sin --videos, las actividades se crean sin material.
//
// Es idempotente: una organización que ya tiene el curso se salta.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { supabase } = require("../helpers/supabaseHelper.js");
const CursoIntroduccionService = require("../services/cursoIntroduccionService.js");

const BUCKET = "materiales";
const CARPETA_STORAGE = "plataforma/curso-introduccion";

function argumentos(argv) {
  const a = { todas: false, plan: false, videos: null, tenant: null, paraTodos: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--todas") a.todas = true;
    else if (x === "--plan") a.plan = true;
    else if (x === "--para-todos") a.paraTodos = true;
    else if (x === "--videos") a.videos = argv[++i];
    else if (!x.startsWith("--")) a.tenant = x;
  }
  return a;
}

/** Los videos de la carpeta que el curso usa: { archivo: { local, tamano } }. */
function videosLocales(carpeta) {
  if (!carpeta) return {};
  const usados = new Set(CursoIntroduccionService.definicion().secciones
    .flatMap((s) => s.actividades).map((a) => a.video).filter(Boolean));
  const encontrados = {};
  for (const archivo of fs.readdirSync(carpeta)) {
    if (!usados.has(archivo)) continue;
    const local = path.join(carpeta, archivo);
    encontrados[archivo] = { local, tamano: fs.statSync(local).size };
  }
  const faltan = [...usados].filter((v) => !encontrados[v]);
  if (faltan.length) console.warn(`Videos que no están en ${carpeta}: ${faltan.join(", ")}`);
  return encontrados;
}

async function subirVideos(locales) {
  const subidos = {};
  for (const [archivo, v] of Object.entries(locales)) {
    const ruta = `${CARPETA_STORAGE}/${archivo}`;
    const { error } = await supabase.storage.from(BUCKET)
      .upload(ruta, fs.readFileSync(v.local), { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`No se pudo subir ${archivo}: ${error.message}`);
    subidos[archivo] = { ruta, mime: "video/mp4", tamano: v.tamano };
    console.log(`  subido ${archivo} → ${BUCKET}/${ruta}`);
  }
  return subidos;
}

(async () => {
  const a = argumentos(process.argv.slice(2));
  if (!a.todas && !a.tenant) {
    console.error("Indica una organización (tenantId) o --todas. Agrega --plan para ver qué haría.");
    process.exit(1);
  }

  let q = supabase.from("tenants").select("id, name").order("name", { ascending: true });
  if (!a.todas) q = q.eq("id", a.tenant);
  const { data: organizaciones, error } = await q;
  if (error) throw new Error(error.message);
  if (!organizaciones?.length) {
    console.error("No hay organizaciones que coincidan.");
    process.exit(1);
  }

  if (a.paraTodos) {
    for (const o of organizaciones) {
      const ya = await CursoIntroduccionService.existente(o.id);
      if (!ya) {
        console.log(`sin curso   ${o.id} · ${o.name} (créalo primero, sin --para-todos)`);
        continue;
      }
      if (a.plan) {
        console.log(`se marcaría ${o.id} · ${o.name}`);
        continue;
      }
      try {
        await CursoIntroduccionService.marcarParaTodos(o.id);
        console.log(`marcado     ${o.id} · ${o.name}: para toda la organización`);
      } catch (err) {
        console.error(`error       ${o.id} · ${o.name}: ${err.message}`);
      }
    }
    return;
  }

  const locales = videosLocales(a.videos);

  if (a.plan) {
    const plan = CursoIntroduccionService.plan({ videos: locales });
    console.log(JSON.stringify(plan, null, 2));
    for (const o of organizaciones) {
      const ya = await CursoIntroduccionService.existente(o.id);
      console.log(`${ya ? "ya lo tiene " : "se crearía  "} ${o.id} · ${o.name}`);
    }
    return;
  }

  const videos = await subirVideos(locales);
  for (const o of organizaciones) {
    try {
      const r = await CursoIntroduccionService.crearEn(o.id, { videos });
      console.log(r.creado
        ? `creado      ${o.id} · ${o.name}: ${r.secciones} secciones, ${r.actividades} actividades, ${r.materiales} materiales, ${r.preguntas} preguntas`
        : `ya lo tiene ${o.id} · ${o.name}`);
    } catch (err) {
      console.error(`error       ${o.id} · ${o.name}: ${err.message}`);
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
