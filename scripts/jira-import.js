/**
 * Carga el backlog de OnBoardPro en Jira Cloud vía API REST.
 *
 * Crea primero las épicas y después las historias, enlazándolas a su épica.
 * Guarda un registro de todo lo creado para poder deshacerlo.
 *
 * Uso:
 *   node scripts/jira-import.js --dry-run     comprueba credenciales y campos, no crea nada
 *   node scripts/jira-import.js               crea épicas e historias
 *   node scripts/jira-import.js --solo-mvp    crea solo las 46 historias del MVP
 *   node scripts/jira-import.js --rollback    borra todo lo del último registro
 *
 * Requiere en .env:
 *   JIRA_URL=https://onboard-pro.atlassian.net
 *   JIRA_EMAIL=tu-correo@dominio.com
 *   JIRA_API_TOKEN=el token de id.atlassian.com/manage-profile/security/api-tokens
 *   JIRA_PROJECT_KEY=OBP
 */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");

const DRY = process.argv.includes("--dry-run");
const SOLO_MVP = process.argv.includes("--solo-mvp");
const ROLLBACK = process.argv.includes("--rollback");
const PURGAR = process.argv.includes("--purgar");
const REGISTRO = path.join(__dirname, "jira-creado.json");

const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
const PROJECT = process.env.JIRA_PROJECT_KEY || "OBP";

// MoSCoW → prioridades por defecto de Jira
const PRIO = { Must: "Highest", Should: "Medium", Could: "Low" };

function faltanCredenciales() {
  const falta = ["JIRA_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((k) => !process.env[k]);
  if (!falta.length) return false;
  console.error("\n❌ Faltan variables en el .env: " + falta.join(", ") + "\n");
  console.error("   1. Generá un token en:");
  console.error("      https://id.atlassian.com/manage-profile/security/api-tokens");
  console.error("   2. Añadí al final del .env (no lo compartas, el .env está en .gitignore):\n");
  console.error("      JIRA_URL=https://onboard-pro.atlassian.net");
  console.error("      JIRA_EMAIL=tu-correo@dominio.com");
  console.error("      JIRA_API_TOKEN=el_token_generado");
  console.error("      JIRA_PROJECT_KEY=OBP\n");
  return true;
}

const auth = () => "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(`${JIRA_URL.replace(/\/$/, "")}/rest/api/2${ruta}`, {
    method: metodo,
    headers: { Authorization: auth(), "Content-Type": "application/json", Accept: "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!r.ok) {
    const detalle = datos?.errorMessages?.join("; ") || JSON.stringify(datos?.errors || datos || "").slice(0, 300);
    throw new Error(`${metodo} ${ruta} → ${r.status}: ${detalle}`);
  }
  return datos;
}

function cargarBacklog() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/backlog.data.json"), "utf8"));
  const epicas = d.epicas.filter((e) => e.id !== "E15");
  const historias = d.historias.filter((h) => h.epica !== "E15");
  return { epicas, historias, nomEpica: Object.fromEntries(epicas.map((e) => [e.id, e.nombre])) };
}

// El sprint asignado a cada historia vive en el generador; acá se recalcula
// leyendo el mismo reparto para no duplicar la lógica de planificación.
function descripcion(h) {
  const criterios = h.criterios.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const deps = (h.dependencias || []).length ? `\n\nDepende de: ${h.dependencias.join(", ")}` : "";
  const notas = h.notas ? `\n\nNota: ${h.notas}` : "";
  return (
    `Como ${h.rol.toLowerCase()}, quiero ${h.quiero}, para ${h.para}.\n\n` +
    `*CRITERIOS DE ACEPTACIÓN*\n${criterios}\n\n` +
    `Valor de negocio: ${h.valor}/5 · Prioridad: ${h.prioridad}` + deps + notas
  );
}

async function descubrirEntorno() {
  const yo = await api("GET", "/myself");
  console.log(`   ✓ autenticado como ${yo.displayName} <${yo.emailAddress || JIRA_EMAIL}>`);

  const proy = await api("GET", `/project/${PROJECT}`);
  console.log(`   ✓ proyecto ${proy.key} — ${proy.name} (${proy.style === "next-gen" ? "team-managed" : "company-managed"})`);

  const meta = await api("GET", `/issue/createmeta?projectKeys=${PROJECT}&expand=projects.issuetypes.fields`);
  const tipos = meta.projects?.[0]?.issuetypes || [];
  if (!tipos.length) throw new Error("El proyecto no expone tipos de incidencia. ¿Tenés permiso para crear en él?");

  const buscarTipo = (...nombres) =>
    tipos.find((t) => nombres.some((n) => t.name.toLowerCase() === n.toLowerCase()));
  const tipoEpica = buscarTipo("Epic", "Épica", "Epica");
  const tipoHistoria = buscarTipo("Story", "Historia", "Task", "Tarea");
  if (!tipoEpica) throw new Error("No existe el tipo Epic. Tipos disponibles: " + tipos.map((t) => t.name).join(", "));
  if (!tipoHistoria) throw new Error("No existe el tipo Story. Tipos disponibles: " + tipos.map((t) => t.name).join(", "));
  console.log(`   ✓ tipos: épica="${tipoEpica.name}"  historia="${tipoHistoria.name}"`);

  // Campo de puntos: cambia de nombre según el tipo de proyecto
  const campos = await api("GET", "/field");
  const campoPuntos = campos.find((c) =>
    ["story point estimate", "story points", "puntos de historia", "estimación de puntos de historia"]
      .includes((c.name || "").toLowerCase())
  );
  const permitidos = new Set(Object.keys(tipoHistoria.fields || {}));
  const puntosOk = campoPuntos && permitidos.has(campoPuntos.id);
  console.log(`   ${puntosOk ? "✓" : "⚠"} puntos: ${puntosOk ? `${campoPuntos.name} (${campoPuntos.id})` : "no disponible, se omite"}`);

  const prioridadOk = permitidos.has("priority");
  const etiquetasOk = permitidos.has("labels");
  const parentOk = permitidos.has("parent");
  console.log(`   ${prioridadOk ? "✓" : "⚠"} prioridad  ${etiquetasOk ? "✓" : "⚠"} etiquetas  ${parentOk ? "✓" : "⚠"} vínculo a épica`);
  if (!parentOk) console.log("     (las historias se crearán sin épica; habrá que agruparlas a mano)");

  return {
    tipoEpica: tipoEpica.id, tipoHistoria: tipoHistoria.id,
    campoPuntos: puntosOk ? campoPuntos.id : null,
    prioridadOk, etiquetasOk, parentOk,
  };
}

async function crear(fields) {
  const r = await api("POST", "/issue", { fields });
  return r.key;
}

// Lista todas las incidencias del proyecto usando el endpoint de búsqueda vigente.
async function listarProyecto() {
  const base = JIRA_URL.replace(/\/+$/, "");
  let token = null, todas = [];
  do {
    const u = new URL(base + "/rest/api/3/search/jql");
    u.searchParams.set("jql", `project=${PROJECT} ORDER BY created ASC`);
    u.searchParams.set("maxResults", "100");
    u.searchParams.set("fields", "summary,issuetype");
    if (token) u.searchParams.set("nextPageToken", token);
    const r = await fetch(u, { headers: { Authorization: auth(), Accept: "application/json" } });
    const d = await r.json();
    if (!r.ok) throw new Error(`búsqueda → ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
    todas = todas.concat(d.issues || []);
    token = d.nextPageToken;
  } while (token);
  return todas;
}

// Vacía el proyecto por completo. Borra de abajo hacia arriba en la jerarquía
// para que ninguna épica quede con hijas al intentar eliminarla.
async function purgar() {
  const todas = await listarProyecto();
  if (!todas.length) { console.log("   El proyecto ya está vacío.\n"); return; }

  const nivel = (t) => (/sub/i.test(t) ? 0 : /epic|épica|epica/i.test(t) ? 2 : 1);
  const orden = [...todas].sort((a, b) => nivel(a.fields.issuetype.name) - nivel(b.fields.issuetype.name));
  const porTipo = {};
  todas.forEach((i) => (porTipo[i.fields.issuetype.name] = (porTipo[i.fields.issuetype.name] || 0) + 1));

  console.log(`🗑️  Borrando las ${todas.length} incidencias de ${PROJECT}: ${JSON.stringify(porTipo)}\n`);
  let ok = 0; const fallos = [];
  for (const i of orden) {
    try {
      await api("DELETE", `/issue/${i.key}?deleteSubtasks=true`);
      ok++;
      console.log(`   ✓ ${i.key.padEnd(8)} ${(i.fields.issuetype.name || "").padEnd(9)} ${(i.fields.summary || "").slice(0, 52)}`);
    } catch (e) {
      fallos.push(i.key);
      console.log(`   ✗ ${i.key.padEnd(8)} ${e.message.slice(0, 90)}`);
    }
  }
  const quedan = await listarProyecto();
  console.log(`\n   Borradas ${ok}/${todas.length}${fallos.length ? ` · fallaron: ${fallos.join(", ")}` : ""}`);
  console.log(`   Quedan en el proyecto: ${quedan.length}\n`);
  if (fs.existsSync(REGISTRO)) fs.unlinkSync(REGISTRO);
  if (quedan.length) throw new Error("El proyecto no quedó vacío; revisá los fallos antes de importar.");
}

async function rollback() {
  if (!fs.existsSync(REGISTRO)) {
    console.error("\n❌ No hay registro de una importación previa (" + path.relative(process.cwd(), REGISTRO) + ")\n");
    process.exit(1);
  }
  const reg = JSON.parse(fs.readFileSync(REGISTRO, "utf8"));
  const claves = [...reg.historias.map((x) => x.key), ...reg.epicas.map((x) => x.key)]; // hijas primero
  console.log(`\n🗑️  Borrando ${claves.length} incidencias creadas el ${reg.fecha}...\n`);
  let ok = 0, fallo = 0;
  for (const k of claves) {
    try { await api("DELETE", `/issue/${k}?deleteSubtasks=true`); ok++; process.stdout.write("."); }
    catch (e) { fallo++; console.log(`\n   ✗ ${k}: ${e.message}`); }
  }
  console.log(`\n\n✅ Borradas ${ok}${fallo ? `, fallaron ${fallo}` : ""}.`);
  fs.renameSync(REGISTRO, REGISTRO.replace(".json", `.revertido-${Date.now()}.json`));
}

async function main() {
  if (faltanCredenciales()) process.exit(1);
  console.log(`\n🔌 ${JIRA_URL}  ·  proyecto ${PROJECT}\n`);

  if (ROLLBACK) return rollback();

  const env = await descubrirEntorno();

  // --purgar deja el proyecto vacío antes de crear, para no acumular duplicados
  // al reimportar. Las claves de Jira no se reutilizan: las nuevas seguirán
  // numerando desde donde quedó el contador, y eso es normal.
  if (PURGAR) {
    console.log("");
    await purgar();
  }
  const { epicas, historias, nomEpica } = cargarBacklog();
  const aCrear = SOLO_MVP ? historias.filter((h) => h.mvp) : historias;

  console.log(`\n📋 A crear: ${epicas.length} épicas + ${aCrear.length} historias = ${epicas.length + aCrear.length} incidencias`);

  if (DRY) {
    console.log("\n🔍 --dry-run: no se creó nada. Quitá la bandera para ejecutarlo de verdad.\n");
    return;
  }

  const reg = { fecha: new Date().toISOString(), url: JIRA_URL, proyecto: PROJECT, epicas: [], historias: [] };
  const guardar = () => fs.writeFileSync(REGISTRO, JSON.stringify(reg, null, 2), "utf8");
  const claveEpica = {};

  try {
    console.log("\n🏛️  Épicas...");
    for (const e of epicas) {
      const f = { project: { key: PROJECT }, summary: e.nombre, description: e.objetivo, issuetype: { id: env.tipoEpica } };
      if (env.etiquetasOk) f.labels = ["epica"];
      const key = await crear(f);
      claveEpica[e.id] = key;
      reg.epicas.push({ id: e.id, key, nombre: e.nombre });
      guardar();
      console.log(`   ✓ ${key.padEnd(9)} ${e.nombre}`);
    }

    console.log("\n📝 Historias...");
    const orden = [...aCrear].sort((a, b) =>
      a.mvp !== b.mvp ? (a.mvp ? -1 : 1) : (a.mvp ? a.sprint - b.sprint : 0) || a.id.localeCompare(b.id));

    for (const h of orden) {
      const f = {
        project: { key: PROJECT },
        summary: `${h.id} · ${h.nombre}`,
        description: descripcion(h),
        issuetype: { id: env.tipoHistoria },
      };
      if (env.prioridadOk) f.priority = { name: PRIO[h.prioridad] || "Medium" };
      if (env.etiquetasOk) f.labels = [h.mvp ? "MVP" : "Post-MVP", nomEpica[h.epica].replaceAll(" ", "-").slice(0, 40)];
      if (env.campoPuntos) f[env.campoPuntos] = h.sp;
      if (env.parentOk && claveEpica[h.epica]) f.parent = { key: claveEpica[h.epica] };

      const key = await crear(f);
      reg.historias.push({ id: h.id, key, nombre: h.nombre });
      guardar();
      console.log(`   ✓ ${key.padEnd(9)} ${h.id}  ${h.nombre}`);
    }
  } catch (e) {
    console.error(`\n❌ Se detuvo: ${e.message}`);
    console.error(`   Creadas hasta ahora: ${reg.epicas.length} épicas, ${reg.historias.length} historias.`);
    console.error(`   Para deshacerlas:  node scripts/jira-import.js --rollback\n`);
    process.exit(1);
  }

  console.log(`\n✅ Listo: ${reg.epicas.length} épicas y ${reg.historias.length} historias.`);
  console.log(`📄 Registro en ${path.relative(process.cwd(), REGISTRO)} (necesario para --rollback)`);
  console.log(`🔗 ${JIRA_URL}/jira/software/projects/${PROJECT}/boards/1/backlog\n`);
}

main().catch((e) => { console.error("\n❌ " + e.message + "\n"); process.exit(1); });
