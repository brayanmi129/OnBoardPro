const ExcelJS = require("exceljs");
const { supabase } = require("../helpers/supabaseHelper.js");
const { porLotes } = require("../helpers/consultas.js");
const UserService = require("./userService.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Carga masiva de usuarios desde CSV o Excel (HU-019).
 *
 * Dos pasos a propósito: primero la vista previa, que valida todo y no guarda
 * nada, y después la importación, que vuelve a validar (el archivo puede
 * haber cambiado, o alguien pudo crear a una de esas personas entre medio) y
 * crea solo lo que está limpio. Así quien carga 300 personas ve los errores
 * antes de que existan a medias.
 */

const MAX_FILAS = 1000;
const COLUMNAS = ["nombre", "apellido", "correo", "rol", "telefono", "grupo"];

// Encabezados que se aceptan para cada campo. Se comparan sin tildes, sin
// mayúsculas y sin espacios: "Correo electrónico" y "correo" son lo mismo.
const ALIAS = {
  firstname: ["nombre", "nombres", "firstname", "primernombre"],
  lastname: ["apellido", "apellidos", "lastname"],
  email: ["correo", "correoelectronico", "email", "mail", "e-mail"],
  role: ["rol", "role", "perfil"],
  phonumber: ["telefono", "celular", "phone", "phonumber", "movil"],
  grupo: ["grupo", "equipo", "group"],
};

const ROLES = {
  "": "student",
  student: "student",
  aprendiz: "student",
  estudiante: "student",
  instructor: "instructor",
  instructora: "instructor",
};

// El mismo criterio que zod (.email()) en lo esencial, para que la vista
// previa no apruebe algo que después el alta rechaza.
const CORREO = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

const normalizar = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s_]/g, "");

/** La plantilla que se descarga: BOM para que Excel la abra en UTF-8 (tildes, ñ). */
function plantilla() {
  return "﻿" + [
    COLUMNAS.join(","),
    "Ana,Martínez,ana.martinez@empresa.com,aprendiz,3001234567,Comercial",
    "Carlos,Rojas,carlos.rojas@empresa.com,instructor,,",
  ].join("\r\n") + "\r\n";
}

/**
 * Parte un CSV respetando comillas: un campo entre comillas puede tener
 * comas, saltos de línea y comillas dobladas (""). El separador se deduce de
 * la primera línea: Excel en español guarda con punto y coma.
 */
function leerCsv(texto) {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] || "";
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";

  const registros = [];
  let fila = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') {
      comillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      registros.push(fila); fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length) { fila.push(campo); registros.push(fila); }
  // El número de fila es el del registro: la primera de datos es la 2.
  return registros.map((valores, i) => ({ fila: i + 1, valores }));
}

/** La primera hoja del Excel, con el número de fila real de cada una. */
async function leerXlsx(buffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw fallo("No se pudo leer el archivo de Excel. Guardalo como .xlsx o como CSV.", 400);
  }
  const hoja = libro.worksheets[0];
  if (!hoja) return [];
  const filas = [];
  hoja.eachRow({ includeEmpty: false }, (row) => {
    const valores = [];
    // .text resuelve fórmulas, hipervínculos (un correo suele quedar como
    // enlace) y texto enriquecido a lo que se ve en la celda.
    for (let c = 1; c <= row.cellCount; c++) valores.push(row.getCell(c).text ?? "");
    filas.push({ fila: row.number, valores });
  });
  return filas;
}

/** Lee el archivo subido y lo deja como filas con los campos ya ubicados. */
async function leerArchivo(archivo) {
  if (!archivo) throw fallo('Adjuntá el archivo en el campo "archivo" (.csv o .xlsx).', 400);
  const nombre = String(archivo.originalname || "").toLowerCase();
  let registros;
  if (nombre.endsWith(".csv")) registros = leerCsv(archivo.buffer.toString("utf8"));
  else if (nombre.endsWith(".xlsx")) registros = await leerXlsx(archivo.buffer);
  else throw fallo("El archivo tiene que ser .csv o .xlsx.", 400);

  const conDatos = registros.filter((r) => r.valores.some((v) => String(v).trim() !== ""));
  if (!conDatos.length) throw fallo("El archivo está vacío.", 400);

  const [encabezado, ...datos] = conDatos;
  const indice = {};
  encabezado.valores.forEach((h, i) => {
    const n = normalizar(h);
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (alias.includes(n) && indice[campo] === undefined) indice[campo] = i;
    }
  });
  const faltan = [];
  if (indice.firstname === undefined) faltan.push("nombre");
  if (indice.email === undefined) faltan.push("correo");
  if (faltan.length) {
    throw fallo(
      `Faltan columnas obligatorias: ${faltan.join(", ")}. La primera fila tiene que tener los encabezados ${COLUMNAS.join(", ")}.`,
      400
    );
  }
  if (!datos.length) throw fallo("El archivo no tiene filas de datos, solo encabezados.", 400);
  if (datos.length > MAX_FILAS) {
    throw fallo(`El archivo tiene ${datos.length} filas y el máximo es ${MAX_FILAS}. Dividilo en varios.`, 400);
  }

  const valor = (r, campo) => (indice[campo] === undefined ? "" : String(r.valores[indice[campo]] ?? "").trim());
  return datos.map((r) => ({
    fila: r.fila,
    datos: {
      firstname: valor(r, "firstname"),
      lastname: valor(r, "lastname"),
      email: valor(r, "email").toLowerCase(),
      role: valor(r, "role"),
      phonumber: valor(r, "phonumber"),
      grupo: valor(r, "grupo"),
    },
  }));
}

class ImportacionService {
  static plantilla = plantilla;
  static MAX_FILAS = MAX_FILAS;

  /** De qué organización se importa: la del token, salvo el superadmin, que la elige. */
  static async _organizacion(actor, tenantId) {
    const org = actor.role === "superadmin" ? tenantId : actor.tenantId;
    if (!org) throw fallo("Indicá la organización (tenantId).", 400);
    const { data } = await supabase.from("tenants").select("id").eq("id", String(org)).maybeSingle();
    if (!data) throw fallo("Organización no encontrada", 404);
    return data.id;
  }

  /**
   * Valida cada fila sin guardar nada. Devuelve también, por fila, el id del
   * grupo encontrado (para no buscarlo dos veces al importar).
   */
  static async _validar(filas, tenantId) {
    const correos = filas.map((f) => f.datos.email).filter(Boolean);
    const [{ data: grupos, error: eg }, existentes] = await Promise.all([
      supabase.from("groups").select("id, name").eq("tenant_id", tenantId),
      // El correo es único en toda la plataforma, no por organización: si ya
      // existe en otra, crearlo acá fallaría igual.
      porLotes(correos, (lote) =>
        supabase.from("users").select("id, email").in("email", lote).order("id", { ascending: true })
      ),
    ]);
    if (eg) throw new Error(eg.message);
    const grupoPorNombre = new Map((grupos || []).map((g) => [String(g.name).trim().toLowerCase(), g.id]));
    const yaEnLaBase = new Set(existentes.map((u) => String(u.email).toLowerCase()));
    const vistos = new Set();

    return filas.map(({ fila, datos }) => {
      const errores = [];
      if (!datos.firstname) errores.push("El nombre es obligatorio.");
      else if (datos.firstname.length > 50) errores.push("El nombre no puede pasar de 50 caracteres.");
      if (!datos.email) errores.push("El correo es obligatorio.");
      else if (!CORREO.test(datos.email)) errores.push(`El correo ${datos.email} no es válido.`);

      const rol = ROLES[normalizar(datos.role)];
      if (!rol) errores.push(`El rol ${datos.role} no es válido: usa aprendiz o instructor.`);

      let grupoId = null;
      if (datos.grupo) {
        grupoId = grupoPorNombre.get(datos.grupo.toLowerCase()) ?? null;
        if (!grupoId) errores.push(`El grupo ${datos.grupo} no existe`);
      }

      // Se marca la segunda aparición en el archivo, no la primera: la
      // primera es la que se va a crear.
      const duplicado = Boolean(datos.email) && (yaEnLaBase.has(datos.email) || vistos.has(datos.email));
      if (datos.email) vistos.add(datos.email);

      return {
        fila,
        datos: { ...datos, role: rol ?? datos.role },
        errores,
        duplicado,
        _grupoId: grupoId,
        _yaEnLaBase: yaEnLaBase.has(datos.email),
      };
    });
  }

  static _resumen(validadas) {
    return {
      total: validadas.length,
      // Válida = se crearía al importar: sin errores y sin duplicar.
      validas: validadas.filter((f) => !f.errores.length && !f.duplicado).length,
      conErrores: validadas.filter((f) => f.errores.length).length,
      duplicadas: validadas.filter((f) => f.duplicado).length,
    };
  }

  /** Vista previa: cómo quedaría cada fila. No guarda nada. */
  static async previsualizar(archivo, actor, tenantId) {
    const org = await ImportacionService._organizacion(actor, tenantId);
    const validadas = await ImportacionService._validar(await leerArchivo(archivo), org);
    return {
      filas: validadas.map(({ fila, datos, errores, duplicado }) => ({ fila, datos, errores, duplicado })),
      resumen: ImportacionService._resumen(validadas),
    };
  }

  /**
   * Crea las filas válidas. Las demás quedan en `omitidas` con su motivo.
   *
   * Cada persona se crea como en el alta individual (UserService.create), sin
   * contraseña: entra con Google o Microsoft, o se la define con "olvidé mi
   * contraseña". Una fila que falla al insertar no corta las demás.
   */
  static async importar(archivo, actor, tenantId) {
    const org = await ImportacionService._organizacion(actor, tenantId);
    const validadas = await ImportacionService._validar(await leerArchivo(archivo), org);

    const omitidas = [];
    const aCrear = [];
    for (const f of validadas) {
      if (f.errores.length) omitidas.push({ fila: f.fila, email: f.datos.email || null, motivo: f.errores.join(" ") });
      else if (f.duplicado) {
        omitidas.push({
          fila: f.fila,
          email: f.datos.email,
          motivo: f._yaEnLaBase ? "El correo ya está registrado." : "El correo se repite en el archivo.",
        });
      } else aCrear.push(f);
    }

    // De a 10 a la vez: en serie, 1000 filas tardarían demasiado; todas juntas
    // saturarían la conexión con la base.
    const creados = [];
    for (let i = 0; i < aCrear.length; i += 10) {
      const tanda = aCrear.slice(i, i + 10);
      const resultados = await Promise.allSettled(tanda.map((f) =>
        UserService.create({
          firstname: f.datos.firstname,
          lastname: f.datos.lastname || "",
          email: f.datos.email,
          phonumber: f.datos.phonumber || "",
          role: f.datos.role,
          status: "Active",
          tenantId: org,
        })
      ));
      resultados.forEach((r, j) => {
        const f = tanda[j];
        if (r.status === "fulfilled") creados.push({ fila: f, usuario: r.value });
        else {
          const msg = r.reason?.message || "Error al crear el usuario.";
          omitidas.push({
            fila: f.fila,
            email: f.datos.email,
            motivo: /duplicate|unique/i.test(msg) ? "El correo ya está registrado." : msg,
          });
        }
      });
    }

    // Los grupos van en un solo insert; si falla (por ejemplo, alguien borró
    // el grupo entre medio), se reintenta de a uno para no perder los demás.
    const enlaces = creados
      .filter((c) => c.fila._grupoId)
      .map((c) => ({ id_user: c.usuario.id, id_group: c.fila._grupoId }));
    let conGrupo = 0;
    if (enlaces.length) {
      const { error } = await supabase.from("users_groups").insert(enlaces);
      if (!error) conGrupo = enlaces.length;
      else {
        for (const e of enlaces) {
          const { error: e1 } = await supabase.from("users_groups").insert(e);
          if (!e1) conGrupo += 1;
          else console.warn(`[importación] ${e.id_user} no quedó en su grupo:`, e1.message);
        }
      }
    }

    omitidas.sort((a, b) => a.fila - b.fila);
    return {
      message: creados.length === 1
        ? "Se creó 1 usuario."
        : creados.length
          ? `Se crearon ${creados.length} usuarios.`
          : "No se creó ningún usuario.",
      creados: creados.length,
      conGrupo,
      omitidas,
    };
  }
}

module.exports = ImportacionService;
module.exports._leerCsv = leerCsv;
