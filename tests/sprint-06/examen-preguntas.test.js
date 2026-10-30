// Sprint 6 · Crear un examen (HU-041): validación de cada pregunta y de la
// configuración antes de guardar.
require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const ExamenService = require("../../services/examenService.js");

const opcionesOk = [{ texto: "Sí", esCorrecta: true }, { texto: "No", esCorrecta: false }];
const falla = (fn, texto) => assert.throws(fn, (e) => e.status === 400 && (!texto || e.message.includes(texto)));

describe("Crear un examen: preguntas y configuración", () => {
  test("S6-24 · HU-041 · una pregunta bien armada pasa con puntaje 1 por defecto y sin espacios de más", () => {
    const p = ExamenService._validarPregunta({ enunciado: "  ¿Ok?  ", opciones: opcionesOk });
    assert.equal(p.enunciado, "¿Ok?");
    assert.equal(p.puntaje, 1);
  });

  test("S6-25 · HU-041 · una pregunta sin enunciado responde 400", () => {
    falla(() => ExamenService._validarPregunta({ enunciado: " ", opciones: opcionesOk }), "enunciado");
  });

  test("S6-26 · HU-041 · sin opción correcta, o con dos, responde 400", () => {
    falla(() => ExamenService._validarPregunta({ enunciado: "x", opciones: opcionesOk.map((o) => ({ ...o, esCorrecta: false })) }), "correcta");
    falla(() => ExamenService._validarPregunta({ enunciado: "x", opciones: opcionesOk.map((o) => ({ ...o, esCorrecta: true })) }), "una opción correcta");
  });

  test("S6-27 · HU-041 · con menos de dos opciones o una opción vacía responde 400", () => {
    falla(() => ExamenService._validarPregunta({ enunciado: "x", opciones: [opcionesOk[0]] }), "dos opciones");
    falla(() => ExamenService._validarPregunta({ enunciado: "x", opciones: [opcionesOk[0], { texto: " ", esCorrecta: false }] }), "vacía");
  });

  test("S6-28 · HU-041 · el error dice qué número de pregunta falló", () => {
    falla(() => ExamenService._validarPregunta({ enunciado: "" }, { n: 7 }), "Pregunta 7");
  });

  test("S6-29 · HU-041 · tiempo límite, intentos y porcentaje para aprobar se validan por rango", () => {
    const examen = { type: "Examen" };
    assert.deepEqual(
      ExamenService._validarConfig({ tiempoLimite: 30, intentosPermitidos: 3, porcentajeAprobacion: 80 }, examen),
      { tiempo_limite: 30, intentos_permitidos: 3, porcentaje_aprobacion: 80 }
    );
    falla(() => ExamenService._validarConfig({ tiempoLimite: 0 }, examen));
    falla(() => ExamenService._validarConfig({ intentosPermitidos: 11 }, examen));
    falla(() => ExamenService._validarConfig({ porcentajeAprobacion: 101 }, examen));
  });
});
