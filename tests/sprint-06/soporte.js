// Soporte propio de las pruebas del sprint: se apoya en el Supabase falso
// compartido (tests/soporte/supabaseFalso.js) sin modificarlo, y le agrega lo
// que estas historias necesitan:
//
//   - upsert, que usan las asignaciones de grupos;
//   - forzar un error de la base en una tabla y operación concretas;
//   - un Storage falso (helpers/storage.js) que anota qué se subió y borró;
//   - un AvisoService falso, para que no salga ningún correo.
//
// Todo se instala en la caché de require, así que hay que requerir este
// archivo ANTES que cualquier servicio.
process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba";
process.env.MAIL_PROVIDER = "consola";

const path = require("node:path");
const falso = require("../soporte/supabaseFalso.js");
const { supabase, estado } = falso;

function instalar(relativa, exports) {
  const ruta = path.resolve(__dirname, relativa);
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports };
}

// ── Errores forzados y upsert ───────────────────────────────────────────
const fallas = [];

const fromOriginal = supabase.from;
supabase.from = (nombre) => {
  const q = fromOriginal(nombre);
  let operacion = "select";
  for (const m of ["insert", "update", "delete"]) {
    const original = q[m];
    q[m] = (...args) => { operacion = m; original(...args); return q; };
  }
  // upsert con onConflict: lo que ya existe con esas columnas no se duplica.
  q.upsert = (filas, { onConflict = "id" } = {}) => {
    const columnas = onConflict.split(",");
    const lista = Array.isArray(filas) ? filas : [filas];
    const existentes = estado.tablas[nombre] || [];
    const nuevas = lista.filter((f) => !existentes.some((e) => columnas.every((c) => e[c] === f[c])));
    return q.insert(nuevas);
  };
  const thenOriginal = q.then;
  q.then = (ok, mal) => {
    const i = fallas.findIndex((f) => f.tabla === nombre && f.operacion === operacion);
    if (i >= 0) {
      const [falla] = fallas.splice(i, 1);
      return Promise.resolve({ data: null, error: falla.error }).then(ok, mal);
    }
    return thenOriginal(ok, mal);
  };
  return q;
};

/** La próxima `operacion` sobre `tabla` responde con este error de la base. */
function fallarEn(tabla, operacion, error) {
  fallas.push({ tabla, operacion, error });
}

// ── Storage falso ───────────────────────────────────────────────────────
const storage = { subidos: [], borrados: [] };
let contador = 0;
instalar("../../helpers/storage.js", {
  BANNERS: "banners",
  MATERIALES: "materiales",
  subirMaterial: async ({ tenantId }) => {
    const ruta = `${tenantId || "sin-empresa"}/archivo-${++contador}`;
    storage.subidos.push(ruta);
    return { ruta };
  },
  subirBanner: async ({ tenantId }) => {
    const ruta = `${tenantId || "sin-empresa"}/banner-${++contador}`;
    storage.subidos.push(ruta);
    return { ruta, url: `https://publica.test/${ruta}` };
  },
  urlFirmada: async (ruta) => (ruta ? `https://firmada.test/${ruta}` : null),
  borrar: async (_bucket, ruta) => { if (ruta) storage.borrados.push(ruta); },
});

// ── Avisos por correo ───────────────────────────────────────────────────
const avisos = [];
instalar("../../services/avisoService.js", {
  cursoAsignado: async (datos) => { avisos.push({ tipo: "cursoAsignado", ...datos }); },
  actividadNueva: async (datos) => { avisos.push({ tipo: "actividadNueva", ...datos }); },
  instructorAsignado: async (datos) => { avisos.push({ tipo: "instructorAsignado", ...datos }); },
});

/** Reinicia base, errores forzados, Storage y avisos. */
function preparar(opciones = {}) {
  falso.preparar(opciones);
  fallas.length = 0;
  storage.subidos.length = 0;
  storage.borrados.length = 0;
  avisos.length = 0;
}

/** Un archivo como el que deja multer en req.file. */
const archivo = (nombre = "guia.pdf", mime = "application/pdf") => ({
  buffer: Buffer.from("contenido"),
  originalname: nombre,
  mimetype: mime,
  size: 9,
});

/** Afirma que la promesa falla con ese status (y, si se indica, ese texto). */
const rechaza = (promesa, status, texto) =>
  require("node:assert/strict").rejects(
    promesa,
    (e) => e.status === status && (!texto || e.message.includes(texto))
  );

module.exports = { supabase, estado, preparar, fallarEn, storage, avisos, archivo, rechaza };
