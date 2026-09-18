// Archivos en Supabase Storage.
//
// Reemplaza a helpers/driveController.js, que subía a Google Drive con el
// refresh token de una cuenta personal. Eso tenía tres problemas: dependía de
// una credencial que hay que rotar, los enlaces de Drive no sirven para poner
// en un <img> o un <video> sin trucos, y los archivos quedaban a nombre de una
// persona en vez de la organización.
//
// Dos buckets, con criterios distintos a propósito:
//
//   banners     público  · la portada de un curso se muestra en <img src>
//   materiales  privado  · el contenido de un curso es confidencial de la
//                          empresa cliente, así que se sirve con URL firmada
const { supabase } = require("./supabaseHelper.js");
const crypto = require("crypto");

const BANNERS = "banners";
const MATERIALES = "materiales";

// Una hora: suficiente para ver o descargar, poco para que el enlace circule.
const VIGENCIA_FIRMA_SEG = 60 * 60;

// El nombre original puede traer acentos, espacios o barras. Se conserva la
// extensión (Storage la usa para el tipo) y el resto se reemplaza por un valor
// aleatorio, así dos archivos con el mismo nombre no se pisan.
function nombreSeguro(original = "") {
  const ext = (original.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const azar = crypto.randomBytes(8).toString("hex");
  return ext ? `${azar}.${ext}` : azar;
}

/**
 * Sube un archivo y devuelve dónde quedó.
 * Las rutas empiezan por el tenant para que un día se puedan aplicar políticas
 * por empresa sin mover nada.
 */
async function subir({ bucket, tenantId, buffer, nombreOriginal, mime }) {
  if (!buffer?.length) throw new Error("El archivo está vacío.");

  const ruta = `${tenantId || "sin-empresa"}/${nombreSeguro(nombreOriginal)}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(ruta, buffer, { contentType: mime, upsert: false });

  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return ruta;
}

/** Portada de curso: bucket público, la URL sirve para siempre. */
async function subirBanner({ tenantId, buffer, nombreOriginal, mime }) {
  const ruta = await subir({ bucket: BANNERS, tenantId, buffer, nombreOriginal, mime });
  const { data } = supabase.storage.from(BANNERS).getPublicUrl(ruta);
  return { ruta, url: data.publicUrl };
}

/** Material de actividad: bucket privado, se guarda la ruta y se firma al leer. */
async function subirMaterial({ tenantId, buffer, nombreOriginal, mime }) {
  const ruta = await subir({ bucket: MATERIALES, tenantId, buffer, nombreOriginal, mime });
  return { ruta };
}

/** URL temporal para un archivo privado. Devuelve null si la ruta ya no existe. */
async function urlFirmada(ruta, segundos = VIGENCIA_FIRMA_SEG) {
  if (!ruta) return null;
  // Lo que se guardó antes con Drive era una URL entera, no una ruta.
  if (/^https?:\/\//i.test(ruta)) return ruta;

  const { data, error } = await supabase.storage
    .from(MATERIALES)
    .createSignedUrl(ruta, segundos);
  if (error) return null;
  return data.signedUrl;
}

async function borrar(bucket, ruta) {
  if (!ruta || /^https?:\/\//i.test(ruta)) return;
  await supabase.storage.from(bucket).remove([ruta]);
}

module.exports = {
  BANNERS,
  MATERIALES,
  subirBanner,
  subirMaterial,
  urlFirmada,
  borrar,
};
