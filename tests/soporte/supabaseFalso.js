// Un Supabase en memoria para las pruebas unitarias.
//
// Las pruebas no tocan la base real: se reemplaza helpers/supabaseHelper.js
// en la caché de require antes de cargar cualquier servicio, y cada prueba
// define qué filas hay en cada tabla y qué devuelven las funciones (rpc).
//
// Soporta lo que usan los servicios: select, eq, neq, in, gte, not(... is null),
// is, or (ignorado), order, limit, maybeSingle, single, insert, update y
// delete. No pretende ser PostgREST: alcanza para probar la lógica.
const path = require("node:path");

const estado = { tablas: {}, rpc: () => ({ data: null, error: null }), escrituras: [] };

function consulta(nombre) {
  const filtros = [];
  let operacion = "select";
  let valores = null;
  let unico = null; // "maybe" | "single"

  const filas = () => {
    const todas = estado.tablas[nombre] || [];
    return todas.filter((f) => filtros.every((cumple) => cumple(f)));
  };

  const ejecutar = () => {
    if (operacion === "insert") {
      estado.escrituras.push({ tabla: nombre, operacion, valores });
      const lista = Array.isArray(valores) ? valores : [valores];
      estado.tablas[nombre] = [...(estado.tablas[nombre] || []), ...lista];
      return { data: lista, error: null };
    }
    if (operacion === "update") {
      const afectadas = filas();
      afectadas.forEach((f) => Object.assign(f, valores));
      estado.escrituras.push({ tabla: nombre, operacion, valores, filas: afectadas.length });
      return { data: afectadas, error: null };
    }
    if (operacion === "delete") {
      const borrar = new Set(filas());
      estado.tablas[nombre] = (estado.tablas[nombre] || []).filter((f) => !borrar.has(f));
      return { data: [...borrar], error: null };
    }
    // Copias, como PostgREST: quien lee no ve cambios hechos después.
    const data = filas().map((f) => ({ ...f }));
    if (unico === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
    if (unico === "maybe") return { data: data[0] ?? null, error: null };
    return { data, error: null, count: data.length };
  };

  const q = {
    select: () => q,
    insert: (v) => { operacion = "insert"; valores = v; return q; },
    update: (v) => { operacion = "update"; valores = v; return q; },
    delete: () => { operacion = "delete"; return q; },
    eq: (c, v) => { filtros.push((f) => f[c] === v); return q; },
    neq: (c, v) => { filtros.push((f) => f[c] !== v); return q; },
    in: (c, vs) => { filtros.push((f) => vs.includes(f[c])); return q; },
    gte: (c, v) => { filtros.push((f) => f[c] >= v); return q; },
    is: (c, v) => { filtros.push((f) => (f[c] ?? null) === v); return q; },
    not: (c, op, v) => { filtros.push((f) => !(op === "is" && (f[c] ?? null) === v)); return q; },
    or: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => { unico = "maybe"; return q; },
    single: () => { unico = "single"; return q; },
    then: (ok, mal) => Promise.resolve(ejecutar()).then(ok, mal),
  };
  return q;
}

const supabase = {
  from: (nombre) => consulta(nombre),
  rpc: async (fn, args) => estado.rpc(fn, args),
  // Storage de mentira: registra lo que se borra o se sube, sin red.
  storage: {
    from: (bucket) => ({
      remove: async (rutas) => { estado.escrituras.push({ bucket, operacion: "remove", rutas }); return { error: null }; },
      upload: async (ruta) => { estado.escrituras.push({ bucket, operacion: "upload", ruta }); return { error: null }; },
      createSignedUrl: async (ruta) => ({ data: { signedUrl: `https://firmada/${ruta}` }, error: null }),
      getPublicUrl: (ruta) => ({ data: { publicUrl: `https://publica/${bucket}/${ruta}` } }),
    }),
  },
};

/** Reinicia la base falsa: tablas, respuesta de las rpc y registro de escrituras. */
function preparar({ tablas = {}, rpc } = {}) {
  estado.tablas = JSON.parse(JSON.stringify(tablas));
  estado.rpc = rpc || (() => ({ data: null, error: null }));
  estado.escrituras = [];
}

// Se instala en la caché de require: cualquier servicio que pida el helper
// recibe este objeto en vez del cliente real.
const ruta = path.resolve(__dirname, "../../helpers/supabaseHelper.js");
require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { supabase } };

module.exports = { supabase, preparar, estado };
