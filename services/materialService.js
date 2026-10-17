const crypto = require("node:crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { subirMaterial, urlFirmada, borrar, MATERIALES } = require("../helpers/storage.js");
const ActivitiesService = require("./actividades.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const CAMPOS = "id, activity_id, tenant_id, nombre, ruta, mime, tamano, orden, subido_por, created_at";

function presentar(m) {
  return {
    id: m.id,
    actividadId: m.activity_id,
    nombre: m.nombre,
    mime: m.mime || null,
    tamano: m.tamano ?? null,
    orden: m.orden,
    subidoPor: m.subido_por || null,
    subidoEn: m.created_at,
  };
}

/**
 * Material de apoyo de una actividad (HU-037, HU-038, HU-039).
 *
 * Una actividad puede tener varios archivos. Antes había una sola columna
 * `adjunto` y subir otro reemplazaba al anterior, que no es lo que piden las
 * historias: hablan de "archivos", en plural.
 *
 * La ruta del bucket nunca sale de acá: hacia afuera solo viajan URLs
 * firmadas que vencen en una hora, porque el bucket es privado.
 */
class MaterialService {
  /** Lista el material de una actividad, con su enlace temporal (HU-038). */
  static async listar(actividadId, actor, { conUrl = true } = {}) {
    // Leer el material es leer la actividad: mismo alcance de organización.
    let q = supabase.from("activities").select("id").eq("id", actividadId);
    if (actor.role !== "superadmin") q = q.eq("tenant_id", actor.tenantId);
    const { data: actividad } = await q.maybeSingle();
    if (!actividad) throw fallo("Actividad no encontrada", 404);

    const { data, error } = await supabase
      .from("materiales").select(CAMPOS).eq("activity_id", actividadId)
      .order("orden", { ascending: true });
    if (error) throw new Error(error.message);

    const materiales = (data || []).map(presentar);
    if (!conUrl) return materiales;

    // Se firma de a uno porque cada archivo tiene su propia ruta. Son pocos
    // por actividad, así que no compensa complicarlo.
    return Promise.all(
      (data || []).map(async (m, i) => ({
        ...materiales[i],
        url: await urlFirmada(m.ruta),
      }))
    );
  }

  /**
   * Agrega un archivo a la actividad (HU-037).
   *
   * El archivo sube primero y la fila se escribe después: si Storage falla no
   * queda una fila apuntando a un archivo que no existe. Al revés quedaría un
   * huérfano, que es molesto pero no rompe nada.
   */
  static async agregar(actividadId, actor, archivo) {
    const actividad = await ActivitiesService._alAlcanceDe(actividadId, actor);
    if (!archivo) throw fallo("No se envió ningún archivo.", 400);

    const { count } = await supabase
      .from("materiales").select("id", { count: "exact", head: true })
      .eq("activity_id", actividadId);

    const { ruta } = await subirMaterial({
      tenantId: actividad.tenant_id,
      buffer: archivo.buffer,
      nombreOriginal: archivo.originalname,
      mime: archivo.mimetype,
    });

    const id = crypto.randomBytes(8).toString("hex");
    const { error } = await supabase.from("materiales").insert({
      id,
      activity_id: actividadId,
      tenant_id: actividad.tenant_id,
      nombre: archivo.originalname,
      ruta,
      mime: archivo.mimetype,
      tamano: archivo.size ?? null,
      orden: count ?? 0,
      subido_por: actor.id,
    });
    if (error) {
      // La fila no quedó: el archivo recién subido sobra.
      await borrar(MATERIALES, ruta);
      throw new Error(error.message);
    }

    // `activities.adjunto` queda como puntero al primer material. Lo usan el
    // listado de secciones y la tabla para mostrar el clip sin tener que
    // consultar los materiales de cada actividad.
    if (!actividad.adjunto) {
      await supabase.from("activities")
        .update({ adjunto: ruta, mime: archivo.mimetype })
        .eq("id", actividadId);
    }

    return { message: "Material agregado", materialId: id };
  }

  /**
   * Quita un archivo de la actividad (HU-039).
   *
   * El criterio 2 pide que desaparezca también del almacenamiento y no solo la
   * referencia: si se borrara nada más la fila, el archivo obsoleto seguiría
   * en el bucket. Por eso se borra de Storage primero; si eso fallara, la fila
   * sigue ahí y se puede reintentar, que es mejor que perderle el rastro.
   */
  static async quitar(materialId, actor) {
    const { data: material } = await supabase
      .from("materiales").select(CAMPOS).eq("id", materialId).maybeSingle();
    if (!material) throw fallo("Material no encontrado", 404);

    // Quitar material es editar la actividad: un instructor solo en sus cursos.
    await ActivitiesService._alAlcanceDe(material.activity_id, actor);

    await borrar(MATERIALES, material.ruta);

    const { error } = await supabase.from("materiales").delete().eq("id", materialId);
    if (error) throw new Error(error.message);

    // Si el que se fue era el que apuntaba `activities.adjunto`, el puntero
    // pasa al siguiente que quede, o se vacía si no queda ninguno. Sin esto la
    // actividad seguiría mostrando el clip de un archivo que ya no existe.
    const { data: actividad } = await supabase
      .from("activities").select("adjunto").eq("id", material.activity_id).maybeSingle();

    if (actividad?.adjunto === material.ruta) {
      const { data: resto } = await supabase
        .from("materiales").select("ruta, mime").eq("activity_id", material.activity_id)
        .order("orden", { ascending: true }).limit(1);

      await supabase.from("activities")
        .update({ adjunto: resto?.[0]?.ruta ?? null, mime: resto?.[0]?.mime ?? null })
        .eq("id", material.activity_id);
    }

    return { message: "Material eliminado", nombre: material.nombre };
  }
}

module.exports = MaterialService;
