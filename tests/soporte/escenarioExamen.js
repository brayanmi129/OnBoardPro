// Datos de prueba para rendir un examen o jugar un concurso: un curso
// publicado, una actividad con 3 preguntas de 1 punto y un aprendiz.
const { preparar } = require("./supabaseFalso.js");

const aprendiz = { id: "u-ap", role: "student", tenantId: "t1", email: "ap@t1.com" };

function preguntas(actividad, n = 3) {
  const ps = [];
  const os = [];
  for (let i = 1; i <= n; i++) {
    ps.push({ id: `${actividad}-p${i}`, activity_id: actividad, enunciado: `Pregunta ${i}`, puntaje: 1, orden: i, dificultad: ((i - 1) % 3) + 1 });
    os.push({ id: `${actividad}-p${i}-ok`, pregunta_id: `${actividad}-p${i}`, texto: "Correcta", es_correcta: true, orden: 0 });
    os.push({ id: `${actividad}-p${i}-no`, pregunta_id: `${actividad}-p${i}`, texto: "Incorrecta", es_correcta: false, orden: 1 });
  }
  return { ps, os };
}

/**
 * Carga la base falsa. `actividad` sobreescribe columnas de la actividad
 * (type, xp, intentos_permitidos, mostrar_respuestas, tiempo_limite...).
 */
function escenario({ actividad = {}, curso = {}, intentos = [], n = 3 } = {}) {
  const act = {
    id: "ex1", title: "Examen de inducción", type: "Examen", xp: 50, tenant_id: "t1", section_id: "s1",
    tiempo_limite: null, intentos_permitidos: 3, porcentaje_aprobacion: 70, mostrar_respuestas: true,
    tiempo_por_pregunta: null, preguntas_por_partida: null, dificultad_creciente: false,
    ...actividad,
  };
  const { ps, os } = preguntas(act.id, n);
  preparar({
    tablas: {
      activities: [act],
      sections: [{ id: "s1", course_id: "c1" }],
      courses: [{ id: "c1", tenant_id: "t1", status: "Abierto", archivado: false, instructor: "inst@t1.com", ...curso }],
      preguntas: ps,
      opciones: os,
      intentos_examen: intentos,
      xp_movimientos: [],
    },
  });
  return act;
}

/** Respuestas que aciertan las primeras `bien` preguntas y fallan el resto. */
function respuestas(preguntaIds, bien) {
  return preguntaIds.map((pid, i) => ({ preguntaId: pid, opcionId: `${pid}-${i < bien ? "ok" : "no"}` }));
}

module.exports = { aprendiz, escenario, respuestas };
