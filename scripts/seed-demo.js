/**
 * Organización de demostración para la sustentación: Vialtica Logística S.A.S.
 *
 * Una empresa ficticia de logística en Bogotá con su área de Gestión Humana,
 * dos instructores, 18 aprendices en tres cohortes de ingreso, cinco cursos de
 * inducción corporativa y ~45 días de actividad simulada (avances, entregas,
 * exámenes, XP, rachas, niveles y logros).
 *
 * Uso:
 *   node scripts/seed-demo.js crear      borra lo creado antes y lo vuelve a crear
 *   node scripts/seed-demo.js borrar     elimina todo lo de la demo
 *   node scripts/seed-demo.js verificar  conteos + servicios reales con un JWT firmado
 *   node scripts/seed-demo.js plan       arma todo en memoria y muestra el resumen,
 *                                        sin conectarse a la base
 *
 * Seguridad: solo toca filas de la organización TENANT_ID o con id que empieza
 * por PREFIJO, y en Storage solo la carpeta TENANT_ID/ de los buckets. Nunca
 * toca "Universidad Central" ni ninguna otra organización.
 *
 * Coherencia: el XP vive en el libro xp_movimientos (con las fechas simuladas
 * en created_at); users.xp y users.level se recalculan con las mismas
 * funciones que usa la app (recalcular_xp y subir_nivel, vía
 * GamificationService.recalcular). La racha se calcula con helpers/racha.js
 * sobre los días en que hubo movimientos, y los logros se desbloquean
 * reproduciendo la evaluación de DesbloqueoService en orden cronológico. Al
 * final se corre DesbloqueoService.evaluar() real como control: no debería
 * otorgar nada nuevo.
 *
 * Las fechas son relativas al día en que se ejecuta: las cohortes de
 * "noviembre" ingresaron hace 13 días y la de "octubre" hace 46. Los nombres de
 * los grupos se calculan con esas fechas.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { nivelPara } = require("../helpers/niveles.js");
const { siguienteRacha, hoy: hoyBogota } = require("../helpers/racha.js");

// ─── Constantes ──────────────────────────────────────────────────────────────

const TENANT_ID = "demo-vialtica";
const PREFIJO = "demo-";
const DOMINIO = "vialtica.co";
const EMPRESA = "Vialtica Logística S.A.S.";
const PASSWORD = "Vialtica2026!";
const BUCKET_BANNERS = "banners";
const BUCKET_MATERIALES = "materiales";

// Festivos en Colombia cercanos a la demo: quien revisa entregas no trabaja.
const FESTIVOS = new Set(["2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"]);

// ─── Utilidades de fecha (todo en hora de Colombia, UTC-5 sin horario de verano) ─

const DIA_MS = 86400000;
const HOY = hoyBogota();
const AHORA = new Date();

function sumarDias(dia, n) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + n * DIA_MS).toISOString().slice(0, 10);
}
const haceDias = (n) => sumarDias(HOY, -n);
function diaSemana(dia) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 domingo
}
const esFinDeSemana = (dia) => [0, 6].includes(diaSemana(dia));
const esHabil = (dia) => !esFinDeSemana(dia) && !FESTIVOS.has(dia);
/** Instante a partir de un día de Bogotá y una hora local (puede tener decimales). */
function enBogota(dia, horaLocal) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + (horaLocal + 5) * 3600000);
}
/** Día de Bogotá de un instante. */
const diaDe = (fecha) => hoyBogota(fecha);
const masMinutos = (fecha, min) => new Date(fecha.getTime() + min * 60000);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const mesDe = (dia) => `${MESES[Number(dia.slice(5, 7)) - 1]} ${dia.slice(0, 4)}`;

// Generador pseudoaleatorio con semilla: la demo sale igual cada vez.
function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const semillaDe = (texto) => [...texto].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// ─── Cohortes ────────────────────────────────────────────────────────────────

const INICIO_NOV = haceDias(13); // martes 3 de noviembre si se corre el 16
const INICIO_OCT = haceDias(46); // jueves 1 de octubre si se corre el 16

const GRUPOS = [
  {
    key: "ops", id: `${PREFIJO}g-ops`, inicio: INICIO_NOV,
    name: `Ingreso ${mesDe(INICIO_NOV)} · Operaciones`,
    description: "Auxiliares de bodega, montacarguistas y coordinadores de despacho del CEDI de Funza que ingresaron este mes.",
    cursos: ["bienvenida", "sst", "datos", "herramientas", "bodega"],
  },
  {
    key: "adm", id: `${PREFIJO}g-adm`, inicio: INICIO_NOV,
    name: `Ingreso ${mesDe(INICIO_NOV)} · Administrativo`,
    description: "Personal de contabilidad, compras, tesorería y Gestión Humana de la sede administrativa (Bogotá, calle 26).",
    cursos: ["bienvenida", "sst", "datos", "herramientas"],
  },
  {
    key: "com", id: `${PREFIJO}g-com`, inicio: INICIO_OCT,
    name: `Ingreso ${mesDe(INICIO_OCT)} · Comercial`,
    description: "Ejecutivos de cuenta y asesores de servicio al cliente que ingresaron el mes pasado.",
    cursos: ["bienvenida", "sst", "datos", "herramientas"],
  },
];

// ─── Personas ────────────────────────────────────────────────────────────────

const STAFF = [
  {
    key: "admin", id: `${PREFIJO}u-admin`, role: "admin",
    firstname: "Carolina", lastname: "Beltrán Suárez", email: `carolina.beltran@${DOMINIO}`,
    phonumber: "+57 310 482 1937", cargo: "Jefe de Gestión Humana",
  },
  {
    key: "ops", id: `${PREFIJO}u-ins-ops`, role: "instructor",
    firstname: "Mauricio", lastname: "Pardo Cifuentes", email: `mauricio.pardo@${DOMINIO}`,
    phonumber: "+57 315 627 4410", cargo: "Líder de Operaciones CEDI",
  },
  {
    key: "sst", id: `${PREFIJO}u-ins-sst`, role: "instructor",
    firstname: "Ángela Patricia", lastname: "Rincón Vega", email: `angela.rincon@${DOMINIO}`,
    phonumber: "+57 320 914 2268", cargo: "Analista de Seguridad y Salud en el Trabajo",
  },
];

/**
 * Perfil de actividad de cada aprendiz:
 *   toca      cuántas actividades de su recorrido alcanzó a trabajar (en orden)
 *   desde     días después del ingreso de su cohorte en que empezó
 *   hasta     hace cuántos días fue su último día de estudio (0 = hoy)
 *   prob      probabilidad de estudiar un día cualquiera (menos los fines de semana)
 *   racha     últimos N días seguidos con actividad, terminando en `hasta`
 *   nota      'alta' saca 100 % en los exámenes, 'media' entre 83 y 100
 *   estados   excepciones por actividad: porRevisar, rehacer (tareas) o reintento (exámenes)
 */
const APRENDICES = [
  // Operaciones
  { key: "julian", grupo: "ops", firstname: "Julián Andrés", lastname: "Rojas Peña", toca: 28, desde: 0, hasta: 0, prob: 1, racha: 14, nota: "alta" },
  { key: "yesica", grupo: "ops", firstname: "Yesica Paola", lastname: "Moreno Castillo", toca: 26, desde: 0, hasta: 0, prob: 0.85, racha: 5, nota: "media" },
  { key: "brayan", grupo: "ops", firstname: "Brayan Stiven", lastname: "Gómez Ortiz", toca: 15, desde: 0, hasta: 1, prob: 0.65, racha: 3, nota: "media", estados: { "sst-e1": "reintento" } },
  { key: "leidy", grupo: "ops", firstname: "Leidy Johana", lastname: "Ramírez Cárdenas", toca: 10, desde: 1, hasta: 2, prob: 0.6, racha: 1, nota: "media", estados: { "bie-t1": "rehacer" } },
  { key: "edwin", grupo: "ops", firstname: "Edwin Alexis", lastname: "Muñoz Torres", toca: 4, desde: 0, hasta: 11, prob: 1, racha: 2, nota: "media" },
  { key: "kevin", grupo: "ops", firstname: "Kevin Santiago", lastname: "Herrera Díaz", toca: 12, desde: 0, hasta: 1, prob: 0.6, racha: 2, nota: "media", estados: { "bie-t2": "porRevisar" } },
  // Administrativo
  { key: "daniela", grupo: "adm", firstname: "Daniela Alejandra", lastname: "Vargas Restrepo", toca: 22, desde: 0, hasta: 0, prob: 0.9, racha: 8, nota: "alta" },
  { key: "camilo", grupo: "adm", firstname: "Camilo Ernesto", lastname: "Sánchez Mejía", toca: 17, desde: 0, hasta: 1, prob: 0.75, racha: 4, nota: "media", estados: { "dat-e1": "reintento" } },
  { key: "mafe", grupo: "adm", firstname: "María Fernanda", lastname: "Jiménez Ospina", toca: 22, desde: 0, hasta: 0, prob: 0.7, racha: 3, nota: "media", estados: { "her-t1": "porRevisar" } },
  { key: "andres", grupo: "adm", firstname: "Andrés Felipe", lastname: "Quintero Salazar", toca: 7, desde: 0, hasta: 3, prob: 0.5, racha: 1, nota: "media" },
  { key: "laura", grupo: "adm", firstname: "Laura Valentina", lastname: "Pineda Arango", toca: 3, desde: 10, hasta: 0, prob: 1, racha: 2, nota: "media" },
  { key: "oscar", grupo: "adm", firstname: "Óscar Iván", lastname: "Castaño Ochoa", toca: 10, desde: 0, hasta: 2, prob: 0.55, racha: 2, nota: "media", estados: { "sst-t1": "porRevisar" } },
  // Comercial
  { key: "natalia", grupo: "com", firstname: "Natalia Andrea", lastname: "Guzmán Ríos", toca: 22, desde: 0, hasta: 0, prob: 0.45, racha: 9, nota: "alta" },
  { key: "sebastian", grupo: "com", firstname: "Sebastián David", lastname: "Morales Acosta", toca: 22, desde: 0, hasta: 5, prob: 0.4, racha: 3, nota: "media" },
  { key: "diana", grupo: "com", firstname: "Diana Marcela", lastname: "Torres Bermúdez", toca: 8, desde: 1, hasta: 17, prob: 0.3, racha: 1, nota: "media", estados: { "bie-t2": "rehacer" } },
  { key: "juancamilo", grupo: "com", firstname: "Juan Camilo", lastname: "Arias Londoño", toca: 21, desde: 0, hasta: 1, prob: 0.4, racha: 2, nota: "media", estados: { "sst-e1": "reintento", "her-t1": "rehacer" } },
  { key: "paula", grupo: "com", firstname: "Paula Andrea", lastname: "Ruiz Gallego", toca: 20, desde: 2, hasta: 0, prob: 0.35, racha: 4, nota: "media" },
  { key: "cristian", grupo: "com", firstname: "Cristian Mauricio", lastname: "León Valencia", toca: 14, desde: 0, hasta: 4, prob: 0.3, racha: 1, nota: "media", estados: { "dat-e1": "reintento" } },
];

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
for (const a of APRENDICES) {
  a.id = `${PREFIJO}u-${a.key}`;
  a.email = `${sinTildes(a.firstname.split(" ")[0])}.${sinTildes(a.lastname.split(" ")[0])}@${DOMINIO}`;
}

// ─── Cursos ──────────────────────────────────────────────────────────────────

const LINK = {
  decreto1072: { nombre: "Decreto 1072 de 2015 (Función Pública)", ruta: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=72173" },
  ley1581: { nombre: "Ley 1581 de 2012 (Función Pública)", ruta: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981" },
  decreto1377: { nombre: "Decreto 1377 de 2013 (Función Pública)", ruta: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646" },
  teams: { nombre: "Ayuda y aprendizaje de Microsoft Teams", ruta: "https://support.microsoft.com/es-es/teams" },
  outlook: { nombre: "Ayuda y formación de Outlook", ruta: "https://support.microsoft.com/es-es/outlook" },
};

// R = recurso, T = tarea (con entrega), E = examen
const CURSOS = [
  {
    key: "bienvenida", name: "Bienvenida a Vialtica Logística", instructor: "admin",
    colores: ["#0f4c81", "#1f8a70"],
    secciones: [
      { name: "Nuestra historia y cultura", actividades: [
        { key: "bie-r1", type: "Recurso", xp: 10, name: "Mensaje de bienvenida", title: "Mensaje de bienvenida de la Gerencia General",
          description: "Video de 6 minutos en el que nuestra gerente general cuenta cómo nació Vialtica en 2009 con dos camiones y una bodega en Fontibón, y qué esperamos de quienes llegan. Míralo antes de tu primera reunión de equipo." },
        { key: "bie-r2", type: "Recurso", xp: 10, name: "Misión, visión y valores", title: "Misión, visión y valores corporativos",
          description: "Nuestros cinco valores (seguridad primero, cumplimiento, servicio, trabajo en equipo e integridad) con ejemplos reales de la operación. Al terminar deberías poder explicar con tus palabras qué significa cada uno en tu cargo." },
      ] },
      { name: "Estructura organizacional", actividades: [
        { key: "bie-r3", type: "Recurso", xp: 10, name: "Organigrama", title: "Organigrama y áreas de la compañía",
          description: "Cómo se organizan la Gerencia General, Operaciones (CEDI Funza y cross-docking Siberia), Comercial, Administrativa y Financiera, Gestión Humana y Tecnología. Ubica a tu jefe inmediato y a las áreas con las que más vas a interactuar." },
        { key: "bie-t1", type: "Tarea", xp: 50, name: "Preséntate a tu equipo", title: "Preséntate a tu equipo",
          description: "Escribe una presentación breve (5 a 8 líneas): tu nombre, tu cargo, de dónde vienes, qué experiencia traes y un dato curioso sobre ti. La compartiremos en el canal de bienvenida de Teams." },
      ] },
      { name: "Beneficios y bienestar", actividades: [
        { key: "bie-r4", type: "Recurso", xp: 20, name: "Plan de beneficios", title: "Plan de beneficios y compensación",
          description: "Auxilio de alimentación, convenio con la caja de compensación, póliza de vida, días de bienestar, fondo de empleados y el calendario de pagos de nómina (quincenal). Incluye a quién contactar en Gestión Humana para cada trámite." },
        { key: "bie-t2", type: "Tarea", xp: 20, name: "Tus primeros 30 días", title: "Tu plan de los primeros 30 días",
          description: "Reúnete 20 minutos con tu jefe inmediato y acuerden tres objetivos concretos para tu primer mes. Escríbelos aquí con la fecha en la que esperas cumplir cada uno." },
      ] },
    ],
  },
  {
    key: "sst", name: "Seguridad y Salud en el Trabajo (SG-SST)", instructor: "sst",
    colores: ["#b23a48", "#f2a541"],
    secciones: [
      { name: "Marco normativo", actividades: [
        { key: "sst-r1", type: "Recurso", xp: 25, name: "Introducción al SG-SST", title: "Introducción al SG-SST y el Decreto 1072 de 2015",
          description: "Qué es el Sistema de Gestión de Seguridad y Salud en el Trabajo, por qué es obligatorio (Decreto 1072 de 2015, libro 2, parte 2, título 4, capítulo 6) y cómo se aplica en Vialtica con el ciclo PHVA. Esta inducción es obligatoria para todo el personal.",
          materiales: ["decreto1072"] },
        { key: "sst-r2", type: "Recurso", xp: 10, name: "Política de SST", title: "Política de SST y reglamento de higiene y seguridad industrial",
          description: "La política firmada por la Gerencia, los objetivos del sistema y el reglamento de higiene y seguridad industrial publicado en cada sede. Conoce también quiénes conforman el COPASST y el Comité de Convivencia Laboral." },
      ] },
      { name: "Peligros y riesgos", actividades: [
        { key: "sst-r3", type: "Recurso", xp: 15, name: "Matriz de peligros", title: "Identificación de peligros y matriz de riesgos",
          description: "Los peligros más frecuentes en nuestra operación: tránsito de montacargas, manipulación manual de cargas, trabajo en alturas en estanterías, riesgo público en ruta y carga postural en oficina. Cómo se valoran en la matriz de peligros y qué controles tenemos." },
        { key: "sst-t1", type: "Tarea", xp: 70, name: "Condiciones inseguras", title: "Reporte de condiciones inseguras en tu puesto de trabajo",
          description: "Recorre tu puesto o área de trabajo e identifica al menos dos condiciones o actos inseguros. Para cada uno describe: dónde está, qué riesgo genera y qué control propones. El área de SST revisará tu reporte y te dará retroalimentación." },
      ] },
      { name: "Emergencias y reporte", actividades: [
        { key: "sst-r4", type: "Recurso", xp: 10, name: "Plan de emergencias", title: "Plan de emergencias y rutas de evacuación",
          description: "Rutas de evacuación y puntos de encuentro de la sede administrativa y del CEDI, la brigada de emergencias, la ubicación de extintores y botiquines y qué hacer en caso de sismo, incendio o derrame." },
        { key: "sst-r5", type: "Recurso", xp: 10, name: "Reporte de accidentes", title: "Reporte de accidentes e incidentes de trabajo ante la ARL",
          description: "Qué hacer si sufres o presencias un accidente: avisar de inmediato a tu jefe y al área de SST, recibir atención, y cómo la empresa reporta el accidente a la ARL dentro de los dos días hábiles siguientes. Incluye la línea de atención de la ARL." },
      ] },
      { name: "Evaluación", actividades: [
        { key: "sst-e1", type: "Examen", xp: 150, name: "Evaluación SG-SST", title: "Evaluación de inducción SG-SST",
          description: "Seis preguntas sobre lo visto en el curso. Necesitas 80 % para aprobar y tienes dos intentos de 20 minutos. Aprobarla es requisito para terminar tu inducción.",
          examen: { tiempo_limite: 20, intentos_permitidos: 2, porcentaje_aprobacion: 80 } },
      ] },
    ],
  },
  {
    key: "datos", name: "Protección de datos personales", instructor: "admin",
    colores: ["#3d348b", "#7678ed"],
    secciones: [
      { name: "Fundamentos", actividades: [
        { key: "dat-r1", type: "Recurso", xp: 10, name: "Ley 1581 de 2012", title: "Ley 1581 de 2012 y Decreto 1377 de 2013 en lo esencial",
          description: "Qué es un dato personal, qué es un dato sensible, quién es el titular, el responsable y el encargado, y cuáles son los principios del tratamiento. Lectura de 15 minutos con los artículos clave.",
          materiales: ["ley1581", "decreto1377"] },
        { key: "dat-r2", type: "Recurso", xp: 10, name: "Política de tratamiento", title: "Política de tratamiento de datos de Vialtica",
          description: "Cómo tratamos los datos de clientes, destinatarios de envíos, proveedores y empleados; para qué los usamos, cuánto tiempo los guardamos y cómo se atienden las consultas y reclamos de los titulares." },
      ] },
      { name: "En la práctica", actividades: [
        { key: "dat-r3", type: "Recurso", xp: 15, name: "Buenas prácticas", title: "Buenas prácticas: escritorio limpio, contraseñas y envío de información",
          description: "Situaciones reales: guías de despacho con datos del destinatario olvidadas en el muelle, bases de clientes enviadas por WhatsApp, contraseñas en un post-it. Qué hacer en cada caso y cómo reportar un incidente de seguridad de la información." },
        { key: "dat-e1", type: "Examen", xp: 80, name: "Evaluación de datos personales", title: "Evaluación: protección de datos personales",
          description: "Cinco preguntas cortas. Necesitas 70 % para aprobar y tienes dos intentos de 10 minutos.",
          examen: { tiempo_limite: 10, intentos_permitidos: 2, porcentaje_aprobacion: 70 } },
      ] },
    ],
  },
  {
    key: "herramientas", name: "Herramientas internas", instructor: "admin",
    colores: ["#00798c", "#30638e"],
    secciones: [
      { name: "Cuentas y comunicación", actividades: [
        { key: "her-r1", type: "Recurso", xp: 10, name: "Cuenta y correo", title: "Activación de tu cuenta corporativa y correo",
          description: "Cómo activar tu cuenta de Microsoft 365, configurar la autenticación en dos pasos, tu firma de correo corporativa y el correo en el celular.",
          materiales: ["outlook"] },
        { key: "her-r2", type: "Recurso", xp: 10, name: "Teams y calendario", title: "Uso de Teams y del calendario compartido",
          description: "Los equipos y canales de Teams que usamos (operación diaria, novedades de despacho, comercial), cómo agendar reuniones y reservar salas en el calendario compartido.",
          materiales: ["teams"] },
      ] },
      { name: "ERP corporativo", actividades: [
        { key: "her-r3", type: "Recurso", xp: 15, name: "Navegación en el ERP", title: "Navegación básica del ERP: compras, inventario y facturación",
          description: "Recorrido guiado por los módulos del ERP que usarás según tu cargo: consulta de inventario por ubicación, solicitudes de compra, órdenes de servicio y consulta de facturas. Usa el ambiente de pruebas para practicar sin miedo." },
        { key: "her-t1", type: "Tarea", xp: 60, name: "Solicitud de compra de prueba", title: "Práctica: registra una solicitud de compra en el ambiente de pruebas",
          description: "En el ambiente de pruebas del ERP registra una solicitud de compra de 10 cajas de cinta de embalaje para tu centro de costos. Comparte aquí el número de solicitud que te asignó el sistema y el aprobador que aparece." },
      ] },
      { name: "Mesa de ayuda", actividades: [
        { key: "her-r4", type: "Recurso", xp: 10, name: "Mesa de ayuda", title: "Cómo abrir y hacer seguimiento a un ticket en la mesa de ayuda",
          description: "Cuándo abrir un ticket, qué información incluir (pantallazo, equipo, urgencia), los tiempos de respuesta acordados y cómo calificar la atención al cerrarlo." },
      ] },
    ],
  },
  {
    key: "bodega", name: "Procesos de bodega y despacho", instructor: "ops",
    colores: ["#386641", "#bc4749"],
    secciones: [
      { name: "Recepción y almacenamiento", actividades: [
        { key: "bod-r1", type: "Recurso", xp: 15, name: "Recepción de mercancía", title: "Recepción de mercancía y verificación contra la orden de compra",
          description: "El paso a paso en el muelle de recepción: cita del proveedor, inspección del vehículo, conteo y verificación contra la orden de compra y la remisión, registro de novedades y etiquetado con la ubicación asignada." },
        { key: "bod-r2", type: "Recurso", xp: 15, name: "Ubicaciones y rotación", title: "Sistema de ubicaciones y rotación FIFO / FEFO",
          description: "Cómo leer una ubicación (zona-pasillo-módulo-nivel), cuándo aplicamos FIFO y cuándo FEFO según el cliente, y por qué un error de ubicación cuesta más que un error de conteo." },
      ] },
      { name: "Alistamiento y despacho", actividades: [
        { key: "bod-r3", type: "Recurso", xp: 15, name: "Picking y packing", title: "Picking, packing y rotulado de despachos",
          description: "Alistamiento por ola y por pedido, uso de la terminal portátil, verificación de cantidades, embalaje según el tipo de producto y rotulado con la guía de despacho." },
        { key: "bod-t1", type: "Tarea", xp: 80, name: "Caso práctico de alistamiento", title: "Caso práctico: alistamiento del pedido PED-10482",
          description: "Con el pedido de ejemplo PED-10482 (14 referencias, dos con fecha de vencimiento), describe en orden cómo lo alistarías: ruta de picking, qué lote tomarías de cada referencia, cómo lo embalarías y qué verificarías antes de entregarlo al transportador." },
      ] },
      { name: "Seguridad en bodega", actividades: [
        { key: "bod-r4", type: "Recurso", xp: 25, name: "Montacargas y estibadores", title: "Operación segura de montacargas y estibadores",
          description: "Inspección preoperacional, velocidades máximas en pasillos, prioridad del peatón, capacidad de carga y apilamiento seguro. Recuerda: solo opera equipos quien tiene la certificación vigente." },
        { key: "bod-e1", type: "Examen", xp: 120, name: "Evaluación de bodega", title: "Evaluación de procesos de bodega y despacho",
          description: "Cinco preguntas sobre recepción, almacenamiento, alistamiento y seguridad en bodega. Necesitas 70 % y tienes dos intentos de 15 minutos.",
          examen: { tiempo_limite: 15, intentos_permitidos: 2, porcentaje_aprobacion: 70 } },
      ] },
    ],
  },
];

// Preguntas de los exámenes. La primera opción de cada lista es la correcta;
// al guardarlas se reordenan para que no quede siempre de primera.
const PREGUNTAS = {
  "sst-e1": [
    ["¿Qué norma compila la regulación del sector trabajo y establece la implementación obligatoria del SG-SST en Colombia?",
      ["El Decreto 1072 de 2015", "La Ley 1581 de 2012", "El Código de Comercio", "La Ley 769 de 2002"]],
    ["¿En qué ciclo se basa el Sistema de Gestión de Seguridad y Salud en el Trabajo?",
      ["Planificar, Hacer, Verificar y Actuar (PHVA)", "Identificar, Medir y Sancionar", "Reportar, Archivar y Cerrar", "Diseñar, Construir y Entregar"]],
    ["Si identificas una condición insegura en tu área, ¿qué es lo primero que debes hacer?",
      ["Reportarla a tu jefe inmediato o al área de SST por el canal establecido", "Esperar a la próxima reunión de equipo para comentarla", "Ignorarla si no te afecta directamente", "Tomarle una foto y publicarla en redes sociales"]],
    ["¿Dentro de qué plazo debe la empresa reportar un accidente de trabajo a la ARL?",
      ["Dentro de los dos días hábiles siguientes a su ocurrencia", "Dentro de los 30 días calendario", "Solo cuando el trabajador tenga incapacidad", "Al final del mes, junto con la nómina"]],
    ["¿Qué es el COPASST?",
      ["El Comité Paritario de Seguridad y Salud en el Trabajo, con representantes de la empresa y de los trabajadores", "La aseguradora que cubre los riesgos laborales", "El comité que define los aumentos salariales", "El área encargada de comprar los elementos de protección"]],
    ["Durante una evacuación, ¿cuál es la conducta correcta?",
      ["Seguir la ruta señalizada sin correr, no usar ascensores y dirigirte al punto de encuentro", "Volver al puesto por tus pertenencias antes de salir", "Usar el ascensor para salir más rápido", "Quedarte en tu puesto hasta que alguien te busque"]],
  ],
  "dat-e1": [
    ["¿Qué ley establece el régimen general de protección de datos personales en Colombia?",
      ["La Ley 1581 de 2012", "La Ley 1266 de 2008", "El Decreto 1072 de 2015", "La Ley 100 de 1993"]],
    ["¿Qué entidad vigila el cumplimiento de la ley de protección de datos personales?",
      ["La Superintendencia de Industria y Comercio", "La Superintendencia de Sociedades", "El Ministerio del Trabajo", "La DIAN"]],
    ["¿Cuál de estos es un dato sensible?",
      ["La historia clínica o los datos biométricos de una persona", "El NIT de una empresa cliente", "La dirección de una bodega", "El cargo de un empleado en el organigrama"]],
    ["Para tratar los datos personales de un destinatario de envíos se requiere, por regla general:",
      ["Autorización previa, expresa e informada del titular", "Nada, porque ya es cliente de nuestro cliente", "Solo avisarle por teléfono después de usarlos", "Que los datos estén publicados en redes sociales"]],
    ["Un cliente te pide por correo que actualicen sus datos de contacto. ¿Qué haces?",
      ["Lo tramitas por el canal de consultas y reclamos definido en la política, dentro de los plazos establecidos", "Le respondes que eso no se puede cambiar", "Reenvías su base de datos completa a tu correo personal para trabajarla en casa", "Lo ignoras porque no es tu área"]],
  ],
  "bod-e1": [
    ["¿Qué significa rotación FEFO?",
      ["Lo primero que vence es lo primero que sale", "Lo primero que entra es lo último que sale", "Lo más pesado sale primero", "Lo que está más cerca del muelle sale primero"]],
    ["Al recibir mercancía, ¿contra qué documentos se verifica?",
      ["La orden de compra y la remisión del proveedor", "Solo la factura que llega por correo días después", "El inventario del mes anterior", "La guía del transportador únicamente"]],
    ["¿Qué es el picking?",
      ["Tomar de sus ubicaciones los productos que componen un pedido", "Facturar el pedido al cliente", "Descargar el camión en el muelle", "Hacer el inventario cíclico de una zona"]],
    ["Antes de operar un montacargas debes:",
      ["Tener la certificación vigente y hacer la inspección preoperacional", "Solo verificar que tenga combustible", "Pedirle las llaves a cualquier compañero", "Nada, si el recorrido es corto"]],
    ["Al alistar un pedido encuentras un faltante. ¿Qué haces?",
      ["Registras la novedad en el sistema e informas al coordinador antes de despachar", "Despachas incompleto sin avisar", "Reemplazas el producto por otro parecido", "Dejas el pedido en el muelle hasta el día siguiente sin registrar nada"]],
  ],
};

// Lo que escribe cada aprendiz al entregar y lo que responde quien revisa.
const ENTREGAS = {
  "bie-t1": {
    comentarios: [
      (a) => `Hola a todos, soy ${a.firstname.split(" ")[0]}. Llego al equipo de ${a.area} después de varios años en el sector. Me gusta el trabajo ordenado y aprender de quienes llevan más tiempo. Dato curioso: he corrido dos medias maratones en Bogotá.`,
      (a) => `¡Hola! Me llamo ${a.firstname.split(" ")[0]} y me uno a ${a.area}. Vengo de una empresa de consumo masivo y estudié en el SENA. Fuera del trabajo me encanta cocinar y ver fútbol con mi familia.`,
      (a) => `Buenos días, equipo. Soy ${a.firstname.split(" ")[0]} ${a.lastname.split(" ")[0]}, nuevo integrante de ${a.area}. Quiero aportar en la mejora de los procesos y aprender mucho. Dato curioso: toco guitarra desde los 12 años.`,
    ],
    aprobada: ["¡Bienvenido! La compartimos hoy en el canal de bienvenida de Teams.", "Muy buena presentación, gracias. Ya la publicamos en el canal del equipo.", ""],
    rehacer: "Te faltó contar tu experiencia previa y en qué área vas a trabajar. Complétala, por favor.",
  },
  "bie-t2": {
    comentarios: [
      () => "1) Conocer el proceso completo de mi área y sus indicadores (semana 1). 2) Manejar el ERP sin ayuda en las tareas diarias (semana 3). 3) Proponer una mejora pequeña a mi jefe (día 30).",
      () => "Objetivos acordados con mi jefe: aprender los procedimientos del área en las dos primeras semanas, completar todas las inducciones obligatorias antes del día 15 y asumir mis primeras tareas sin acompañamiento al día 30.",
    ],
    aprobada: ["Objetivos claros y medibles. Revísalos con tu jefe al cumplir el mes.", "Perfecto, quedan registrados en tu hoja de vida de inducción."],
    rehacer: "Los objetivos están muy generales. Ponles una fecha y una forma de saber si se cumplieron.",
  },
  "sst-t1": {
    comentarios: [
      () => "1) En el pasillo 4 hay una estiba rota en el nivel 2: riesgo de caída de objetos. Propongo retirarla y señalizar. 2) El extintor cerca del muelle 3 está tapado por cajas: en una emergencia no se alcanza. Propongo demarcar el área en el piso.",
      () => "1) Cables sueltos debajo de mi escritorio: riesgo de tropiezo. Propongo canaleta. 2) La silla no tiene ajuste de altura y trabajo 8 horas sentado: riesgo biomecánico. Propongo solicitar cambio o una pausa activa cada dos horas.",
      () => "Condición 1: piso mojado en la entrada de la bodega cuando llueve, sin aviso. Riesgo de caída. Control: tapete y señal de piso húmedo. Condición 2: conductor que no usa cinturón en los recorridos cortos. Riesgo de lesión en frenada. Control: campaña y verificación en la salida.",
    ],
    aprobada: ["Excelente reporte, ya trasladamos la estiba rota al equipo de mantenimiento. Gracias por la observación.", "Muy bien identificados los riesgos y los controles propuestos son viables.", "Buen trabajo. La segunda condición la llevamos al COPASST de este mes."],
    rehacer: "Identificaste bien las condiciones, pero falta el control que propones para cada una. Agrégalo y vuelve a enviarlo.",
  },
  "her-t1": {
    comentarios: [
      () => "Solicitud SC-PRU-004517 registrada para el centro de costos de mi área. El aprobador que aparece es mi jefe inmediato.",
      () => "Registré la solicitud SC-PRU-004529, 10 cajas de cinta de embalaje. Aprobador: coordinador administrativo.",
    ],
    aprobada: ["Correcto, la solicitud quedó bien registrada.", "Muy bien. Ya puedes hacer solicitudes reales desde tu usuario."],
    rehacer: "La solicitud quedó con el centro de costos equivocado. Revísalo en la pestaña de imputación y comparte el número nuevo.",
  },
  "bod-t1": {
    comentarios: [
      () => "Ruta: zona A (secos) de pasillo 1 a 6 en serpentina y al final zona refrigerada. Para las dos referencias con vencimiento tomo el lote que vence primero (FEFO). Embalo lo pesado abajo, separo frágiles con cartón y estrecho la estiba. Antes de entregar verifico cantidades contra el pedido, rotulo con la guía y tomo foto de la estiba.",
      () => "Primero imprimo la orden y reviso las 14 referencias. Hago picking por ubicación más cercana al muelle hacia el fondo. En las referencias con fecha aplico FEFO. Hago conteo de verificación con otro compañero, embalo por tipo de producto y rotulo. Registro la entrega al transportador con su firma.",
    ],
    aprobada: ["Muy bien planteado el recorrido y aplicaste FEFO correctamente.", "Buen caso. Recuerda también registrar la novedad si alguna referencia no está completa."],
    rehacer: "Falta explicar qué lote tomarías en las referencias con vencimiento. Revisa la lección de rotación FEFO.",
  },
};

const AREA_DE = { ops: "Operaciones del CEDI", adm: "el área administrativa", com: "el equipo comercial" };

const LOGROS_EMPRESA = [
  { key: "bienvenida", curso: "bienvenida", nombre: "Bienvenido a bordo", descripcion: "Terminaste la inducción de bienvenida a Vialtica.", tipo_condicion: "cursos_completados", meta: 1, xp_recompensa: 25, icono: "🚚" },
  { key: "guardian", curso: "sst", nombre: "Guardián de la seguridad", descripcion: "Completaste la inducción obligatoria del SG-SST.", tipo_condicion: "cursos_completados", meta: 1, xp_recompensa: 40, icono: "🦺" },
  { key: "despacho", curso: "bodega", nombre: "Experto en despacho", descripcion: "Dominas los procesos de bodega y despacho del CEDI.", tipo_condicion: "cursos_completados", meta: 1, xp_recompensa: 40, icono: "📦" },
];
const CATEGORIA_DE = {
  actividades_completadas: "Progreso", secciones_completadas: "Progreso", cursos_completados: "Progreso",
  examenes_aprobados: "Progreso", racha_dias: "Constancia", nivel_alcanzado: "Nivel",
  entregas_aprobadas: "Entregas", posicion_ranking: "Ranking", juegos_completados: "Juegos",
};

// Catálogo genérico tal como lo deja scripts/schema.sql. Solo se usa en modo
// "plan" (sin base); con base se lee el catálogo real.
const GENERICOS_POR_DEFECTO = [
  { id: "logro-primer-paso", tipo_condicion: "actividades_completadas", meta: 1, xp_recompensa: 10 },
  { id: "logro-primer-examen", tipo_condicion: "examenes_aprobados", meta: 1, xp_recompensa: 20 },
  { id: "logro-primera-entrega", tipo_condicion: "entregas_aprobadas", meta: 1, xp_recompensa: 20 },
  { id: "logro-curso-terminado", tipo_condicion: "cursos_completados", meta: 1, xp_recompensa: 50 },
  { id: "logro-constante", tipo_condicion: "racha_dias", meta: 3, xp_recompensa: 15 },
  { id: "logro-imparable", tipo_condicion: "racha_dias", meta: 7, xp_recompensa: 40 },
  { id: "logro-nivel-5", tipo_condicion: "nivel_alcanzado", meta: 5, xp_recompensa: 30 },
  { id: "logro-top-3", tipo_condicion: "posicion_ranking", meta: 3, xp_recompensa: 50 },
].map((l) => ({ ...l, tenant_id: null, course_id: null, nombre: l.id, activo: true }));

// ─── Construcción en memoria ─────────────────────────────────────────────────

function construir(genericos) {
  const staff = Object.fromEntries(STAFF.map((s) => [s.key, s]));
  const grupoDe = Object.fromEntries(GRUPOS.map((g) => [g.key, g]));
  const creadoBase = enBogota(sumarDias(INICIO_OCT, -25), 9).toISOString();

  const out = {
    tenant: { id: TENANT_ID, name: EMPRESA, domain: DOMINIO, active: true, created_at: enBogota(sumarDias(INICIO_OCT, -40), 10).toISOString() },
    users: [], groups: [], users_groups: [], courses: [], groups_courses: [], sections: [],
    activities: [], materiales: [], examenes: [], logros: [], entregas: [], intentos: [],
    movimientos: [], logros_usuario: [], rachas: new Map(), resumen: [],
  };

  // Staff
  for (const s of STAFF) {
    out.users.push({
      id: s.id, tenant_id: TENANT_ID, email: s.email, firstname: s.firstname, lastname: s.lastname,
      phonumber: s.phonumber, role: s.role, status: "Active", level: 0, xp: 0, streak: 0, racha_maxima: 0,
      created_at: creadoBase,
    });
  }

  // Grupos
  for (const g of GRUPOS) {
    out.groups.push({ id: g.id, tenant_id: TENANT_ID, name: g.name, description: g.description, created_at: enBogota(sumarDias(g.inicio, -7), 9).toISOString() });
  }

  // Cursos, secciones, actividades
  const actividades = new Map(); // key -> { id, ...def, cursoKey, seccionId }
  const cursoIds = {};
  for (const c of CURSOS) {
    const cid = `${PREFIJO}c-${c.key}`;
    cursoIds[c.key] = cid;
    const creado = enBogota(sumarDias(INICIO_OCT, -20), 10);
    out.courses.push({
      id: cid, tenant_id: TENANT_ID, name: c.name, instructor: staff[c.instructor].email,
      grupo: null, status: "Abierto", actividades: [], archivado: false, banner_url: null,
      created_at: creado.toISOString(),
    });
    c.secciones.forEach((s, i) => {
      const sid = `${PREFIJO}s-${c.key}-${i + 1}`;
      out.sections.push({ id: sid, course_id: cid, tenant_id: TENANT_ID, name: s.name, orden: i, created_at: creado.toISOString() });
      s.actividades.forEach((a, j) => {
        const aid = `${PREFIJO}a-${a.key}`;
        const fila = {
          id: aid, tenant_id: TENANT_ID, section_id: sid, orden: j, name: a.name, title: a.title,
          description: a.description, type: a.type, xp: a.xp, adjunto: null, mime: null,
          deliverable: a.type === "Tarea", created_at: creado.toISOString(),
        };
        out.activities.push(fila);
        actividades.set(a.key, { ...a, id: aid, cursoKey: c.key, seccionId: sid, instructor: staff[c.instructor] });
        (a.materiales || []).forEach((m, k) => {
          out.materiales.push({
            id: `${PREFIJO}m-${a.key}-${k + 1}`, activity_id: aid, tenant_id: TENANT_ID,
            nombre: LINK[m].nombre, ruta: LINK[m].ruta, mime: "text/html", tamano: null, orden: k,
            subido_por: staff[c.instructor].id, created_at: creado.toISOString(),
          });
        });
        if (a.examen) {
          const r = rng(semillaDe(a.key));
          const preguntas = PREGUNTAS[a.key].map(([enunciado, opciones], n) => {
            const pid = `${PREFIJO}p-${a.key}-${n + 1}`;
            const conId = opciones.map((texto, k) => ({ id: `${PREFIJO}o-${a.key}-${n + 1}-${k + 1}`, texto, esCorrecta: k === 0 }));
            // Rotación determinista para que la correcta no quede siempre primera.
            const giro = Math.floor(r() * conId.length);
            const opcionesOrdenadas = [...conId.slice(giro), ...conId.slice(0, giro)];
            return { nuevoId: pid, enunciado, puntaje: 1, dificultad: 1, opciones: opcionesOrdenadas };
          });
          out.examenes.push({ activityId: aid, config: a.examen, preguntas });
          actividades.get(a.key).preguntas = preguntas;
          actividades.get(a.key).porcentaje = a.examen.porcentaje_aprobacion;
        }
      });
    });
  }

  // Asignación de cursos a grupos
  for (const g of GRUPOS) {
    for (const ck of g.cursos) {
      out.groups_courses.push({ id_group: g.id, id_course: cursoIds[ck], created_at: enBogota(sumarDias(g.inicio, -3), 8).toISOString() });
    }
  }

  // Logros propios de la empresa
  for (const l of LOGROS_EMPRESA) {
    out.logros.push({
      id: `${PREFIJO}l-${l.key}`, tenant_id: TENANT_ID, course_id: cursoIds[l.curso], nombre: l.nombre,
      descripcion: l.descripcion, categoria: CATEGORIA_DE[l.tipo_condicion], tipo_condicion: l.tipo_condicion,
      meta: l.meta, xp_recompensa: l.xp_recompensa, icono: l.icono, activo: true, creado_por: staff.admin.id,
      created_at: enBogota(sumarDias(INICIO_OCT, -15), 11).toISOString(),
    });
  }
  const catalogo = [...genericos, ...out.logros].filter((l) => l.activo !== false && l.tipo_condicion !== "posicion_ranking");

  // Estructura para medir logros: curso -> secciones -> actividades
  const estructura = new Map(CURSOS.map((c) => [cursoIds[c.key], c.secciones.map((s, i) => ({
    id: `${PREFIJO}s-${c.key}-${i + 1}`,
    actividades: s.actividades.map((a) => `${PREFIJO}a-${a.key}`),
  }))]));
  const tipoDe = new Map(out.activities.map((a) => [a.id, a.type]));

  // ── Aprendices ──
  let nMov = 0;
  for (const ap of APRENDICES) {
    const g = grupoDe[ap.grupo];
    const r = rng(semillaDe(ap.key));
    const alta = sumarDias(g.inicio, ap.desde);
    out.users.push({
      id: ap.id, tenant_id: TENANT_ID, email: ap.email, firstname: ap.firstname, lastname: ap.lastname,
      phonumber: "", role: "student", status: "Active", level: 0, xp: 0, streak: 0, racha_maxima: 0,
      created_at: enBogota(sumarDias(alta, -2), 15 + r() * 2).toISOString(),
    });
    out.users_groups.push({ id_user: ap.id, id_group: g.id, created_at: enBogota(sumarDias(alta, -2), 17).toISOString() });

    // Recorrido: los cursos del grupo en orden, y dentro de cada uno sus actividades.
    const recorrido = g.cursos.flatMap((ck) => CURSOS.find((c) => c.key === ck).secciones.flatMap((s) => s.actividades.map((a) => a.key)));
    const items = recorrido.slice(0, ap.toca);

    // Días de estudio
    const ultimo = haceDias(ap.hasta);
    const candidatos = [];
    for (let d = alta; d <= ultimo; d = sumarDias(d, 1)) candidatos.push(d);
    const forzados = new Set(candidatos.slice(-ap.racha));
    forzados.add(candidatos[0]);
    let dias = candidatos.filter((d) => forzados.has(d) || r() < (esFinDeSemana(d) || FESTIVOS.has(d) ? ap.prob * 0.35 : ap.prob));
    // Cada día de estudio necesita al menos una actividad que pague XP ese mismo
    // día (una tarea paga cuando la aprueban). Si sobran días, se descartan
    // días sueltos, nunca los forzados.
    const quePaganAlHacerse = items.filter((k) => actividades.get(k).type !== "Tarea").length;
    while (dias.length > quePaganAlHacerse) {
      const sueltos = dias.filter((d) => !forzados.has(d));
      const quitar = sueltos.length ? sueltos[Math.floor(r() * sueltos.length)] : dias[1];
      dias = dias.filter((d) => d !== quitar);
    }
    // Reparto: al menos una actividad por día, el resto al azar.
    const porDia = dias.map(() => 1);
    for (let k = dias.length; k < items.length; k++) porDia[Math.floor(r() * dias.length)] += 1;

    const eventos = []; // { t, actividad, ... } en orden
    let idx = 0;
    dias.forEach((dia, i) => {
      const esHoy = dia === HOY;
      // Si es hoy, que todo quede antes de este momento.
      const horaAhora = (AHORA.getTime() - enBogota(HOY, 0).getTime()) / 3600000;
      // Entregar una tarea no da XP hasta que la aprueban, así que un día con
      // solo tareas no cuenta para la racha. Se le suma la actividad siguiente
      // (quitándosela a un día posterior que tenga de sobra).
      const pagaHoy = (key) => actividades.get(key).type !== "Tarea";
      const desde = idx;
      for (let k = 0; k < porDia[i] && idx < items.length; k++) idx++;
      while (idx < items.length && !items.slice(desde, idx).some(pagaHoy)) {
        const j = porDia.findIndex((n, x) => x > i && n > 1);
        if (j < 0) {
          // Ningún día posterior tiene de sobra: la tarea pasa al día siguiente
          // y hoy se hace la actividad que venía después.
          if (pagaHoy(items[idx])) [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
          break;
        }
        porDia[j] -= 1;
        idx++;
      }
      let hora = esHoy ? Math.max(0.2, Math.min(7 + r() * 10, horaAhora - 0.4 - (idx - desde) * 0.5)) : 7 + r() * 11;
      for (let k = desde; k < idx; k++) {
        eventos.push({ t: enBogota(dia, hora), key: items[k] });
        hora += 0.15 + r() * 0.35;
      }
    });

    const xpEventos = []; // { t, activityId, xp, xp_base, motivo }
    for (const ev of eventos) {
      const act = actividades.get(ev.key);
      const estado = ap.estados?.[ev.key];
      if (act.type === "Recurso") {
        xpEventos.push({ t: ev.t, activityId: act.id, xp: act.xp, xp_base: act.xp, motivo: "actividad_completada" });
      } else if (act.type === "Tarea") {
        const plantilla = ENTREGAS[ev.key];
        const comentario = plantilla.comentarios[Math.floor(r() * plantilla.comentarios.length)]({ ...ap, area: AREA_DE[ap.grupo] });
        // Revisión: siguiente franja hábil, entre 3 y 26 horas después.
        let rev = masMinutos(ev.t, (3 + r() * 23) * 60);
        while (!esHabil(diaDe(rev))) rev = enBogota(sumarDias(diaDe(rev), 1), 8 + r() * 3);
        const horaRev = (rev.getTime() - enBogota(diaDe(rev), 0).getTime()) / 3600000;
        if (horaRev < 7.5) rev = enBogota(diaDe(rev), 8 + r() * 2);
        if (horaRev > 18) rev = enBogota(diaDe(rev), 16 + r() * 2);
        let final = estado || "aprobada";
        if (final === "aprobada" && rev.getTime() > AHORA.getTime() - 15 * 60000) final = "porRevisar";
        if (final === "rehacer" && rev.getTime() > AHORA.getTime() - 15 * 60000) final = "porRevisar";
        const fila = {
          id: `${PREFIJO}e-${ap.key}-${ev.key}`, activity_id: act.id, user_id: ap.id, tenant_id: TENANT_ID,
          archivo: null, mime: null, comentario, entregado_at: ev.t.toISOString(),
          estado: final === "porRevisar" ? "entregado" : final,
          feedback: null, revisado_por: null, revisado_at: null,
        };
        if (final === "aprobada") {
          const fb = plantilla.aprobada[Math.floor(r() * plantilla.aprobada.length)];
          Object.assign(fila, { feedback: fb || null, revisado_por: act.instructor.id, revisado_at: rev.toISOString() });
          xpEventos.push({ t: rev, activityId: act.id, xp: act.xp, xp_base: act.xp, motivo: "entrega_aprobada", entrega: true });
        } else if (final === "rehacer") {
          Object.assign(fila, { feedback: plantilla.rehacer, revisado_por: act.instructor.id, revisado_at: rev.toISOString() });
        }
        out.entregas.push(fila);
      } else if (act.type === "Examen") {
        const n = act.preguntas.length;
        const minimo = act.porcentaje;
        const aciertosParaAprobar = Math.ceil((minimo * n) / 100);
        const intentos = [];
        if (estado === "reintento") {
          intentos.push({ aciertos: aciertosParaAprobar - 1 - (r() < 0.4 ? 1 : 0), t: masMinutos(ev.t, -(90 + r() * 120)) });
        }
        const aciertos = ap.nota === "alta" ? n : Math.max(aciertosParaAprobar, n - (r() < 0.5 ? 1 : 0));
        intentos.push({ aciertos, t: ev.t });
        intentos.forEach((it, i) => {
          // Las preguntas falladas son las últimas `n - aciertos` de una mezcla determinista.
          const orden = act.preguntas.map((p, k) => ({ k, s: r() })).sort((x, y) => x.s - y.s).map((x) => x.k);
          const fallan = new Set(orden.slice(0, n - it.aciertos));
          const respuestas = act.preguntas.map((p, k) => {
            const correcta = p.opciones.find((o) => o.esCorrecta).id;
            const elegida = fallan.has(k) ? p.opciones.find((o) => !o.esCorrecta).id : correcta;
            return { preguntaId: p.nuevoId, opcionId: elegida, correcta: elegida === correcta, puntaje: elegida === correcta ? p.puntaje : 0, opcionCorrecta: correcta };
          });
          const puntaje = respuestas.reduce((s, x) => s + x.puntaje, 0);
          const porcentaje = Math.round((puntaje * 100) / n);
          const aprobado = porcentaje >= minimo;
          const dur = 4 + r() * Math.min(act.examen.tiempo_limite - 5, 12);
          out.intentos.push({
            id: `${PREFIJO}i-${ap.key}-${ev.key}-${i + 1}`, activity_id: act.id, user_id: ap.id, tenant_id: TENANT_ID,
            numero: i + 1, estado: "finalizado", iniciado_at: masMinutos(it.t, -dur).toISOString(),
            finalizado_at: it.t.toISOString(), respuestas, puntaje, puntaje_total: n, porcentaje, aprobado, preguntas: null,
          });
          if (aprobado) {
            // Igual que ExamenService: proporcional a la nota y la mitad en un reintento.
            const xp = Math.round(((act.xp * porcentaje) / 100) * (i + 1 > 1 ? 0.5 : 1));
            xpEventos.push({ t: it.t, activityId: act.id, xp, xp_base: xp, motivo: "examen_aprobado", examen: true });
          }
        });
      }
    }
    xpEventos.sort((a, b) => a.t - b.t);

    // ── Reproducción cronológica: XP, nivel, racha y logros ──
    const propios = new Set(g.cursos.map((ck) => cursoIds[ck]));
    const st = {
      todas: new Set(), entregas: new Set(), examenes: new Set(),
      xp: 0, level: 0, racha: { ultimaActividad: null, racha: 0, rachaMaxima: 0 }, ganados: new Set(),
    };
    const actividadesDe = (cid) => new Set((cid ? [cid] : [...propios]).flatMap((c) => (estructura.get(c) || []).flatMap((s) => s.actividades)));
    const contar = (conj, cid) => (cid ? [...conj].filter((a) => actividadesDe(cid).has(a)).length : conj.size);
    const terminada = (ids) => ids.length > 0 && ids.every((a) => st.todas.has(a));
    const cumple = (l) => {
      const c = l.course_id || null;
      const cursos = c ? [c] : [...propios];
      let actual = 0;
      switch (l.tipo_condicion) {
        case "actividades_completadas": actual = contar(st.todas, c); break;
        case "entregas_aprobadas": actual = contar(st.entregas, c); break;
        case "examenes_aprobados": actual = contar(st.examenes, c); break;
        case "secciones_completadas": actual = cursos.flatMap((cid) => estructura.get(cid) || []).filter((s) => terminada(s.actividades)).length; break;
        case "cursos_completados": actual = cursos.filter((cid) => terminada((estructura.get(cid) || []).flatMap((s) => s.actividades))).length; break;
        case "racha_dias": actual = Math.max(st.racha.rachaMaxima || 0, st.racha.racha || 0); break;
        case "nivel_alcanzado": actual = st.level; break;
        default: actual = 0;
      }
      return actual >= l.meta;
    };

    for (const ev of xpEventos) {
      out.movimientos.push({
        id: `${PREFIJO}xp-${++nMov}`, user_id: ap.id, tenant_id: TENANT_ID, activity_id: ev.activityId,
        logro_id: null, xp: ev.xp, xp_base: ev.xp_base, motivo: ev.motivo, created_at: ev.t.toISOString(),
      });
      st.todas.add(ev.activityId);
      if (ev.entrega) st.entregas.add(ev.activityId);
      if (ev.examen && tipoDe.get(ev.activityId) === "Examen") st.examenes.add(ev.activityId);
      const sig = siguienteRacha(st.racha, diaDe(ev.t));
      st.racha = { ultimaActividad: sig.ultimaActividad, racha: sig.racha, rachaMaxima: sig.rachaMaxima };
      st.xp += ev.xp;
      st.level = Math.max(st.level, nivelPara(st.xp));

      // Igual que DesbloqueoService.evaluar: hasta 3 vueltas mientras algún logro pague XP.
      let seg = 0;
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        const nuevos = catalogo.filter((l) => !st.ganados.has(l.id) && cumple(l));
        for (const l of nuevos) {
          st.ganados.add(l.id);
          const t = new Date(ev.t.getTime() + (++seg) * 2000);
          out.logros_usuario.push({
            id: `${PREFIJO}lu-${ap.key}-${l.id}`.slice(0, 50), logro_id: l.id, user_id: ap.id, tenant_id: TENANT_ID,
            xp_otorgado: l.xp_recompensa || 0, desbloqueado_at: t.toISOString(),
          });
          if ((l.xp_recompensa || 0) > 0) {
            out.movimientos.push({
              id: `${PREFIJO}xp-${++nMov}`, user_id: ap.id, tenant_id: TENANT_ID, activity_id: null,
              logro_id: l.id, xp: l.xp_recompensa, xp_base: null, motivo: "logro_desbloqueado", created_at: t.toISOString(),
            });
            st.xp += l.xp_recompensa;
          }
        }
        if (!nuevos.some((l) => (l.xp_recompensa || 0) > 0)) break;
        st.level = Math.max(st.level, nivelPara(st.xp));
      }
    }

    out.rachas.set(ap.id, {
      streak: st.racha.racha, racha_maxima: st.racha.rachaMaxima, ultima_actividad: st.racha.ultimaActividad,
    });
    out.resumen.push({
      ap, xp: st.xp, nivel: nivelPara(st.xp), racha: st.racha, logros: st.ganados.size,
      completadas: st.todas.size, total: recorrido.length,
    });
  }

  return out;
}

// ─── Banners (SVG generado, subido a Storage) ────────────────────────────────

function bannerSvg(curso) {
  const [c1, c2] = curso.colores;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lineas = curso.name.length > 30 ? partir(curso.name, 30) : [curso.name];
  const texto = lineas.map((l, i) => `<text x="64" y="${205 + i * 58}" font-family="Segoe UI, Arial, sans-serif" font-size="50" font-weight="700" fill="#ffffff">${esc(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="1200" height="400" fill="url(#g)"/>
<g fill="#ffffff" opacity="0.08"><circle cx="1050" cy="80" r="220"/><circle cx="1150" cy="380" r="160"/></g>
<g fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="6"><path d="M860 300 h150 v-70 h60 l40 40 v30 h-250z"/><circle cx="905" cy="310" r="18"/><circle cx="1060" cy="310" r="18"/></g>
<text x="64" y="120" font-family="Segoe UI, Arial, sans-serif" font-size="26" letter-spacing="4" fill="#ffffff" fill-opacity="0.85">VIALTICA LOGÍSTICA · INDUCCIÓN</text>
${texto}
</svg>`;
}
function partir(s, ancho) {
  const palabras = s.split(" ");
  const lineas = [""];
  for (const p of palabras) {
    if ((lineas[lineas.length - 1] + " " + p).trim().length > ancho) lineas.push(p);
    else lineas[lineas.length - 1] = (lineas[lineas.length - 1] + " " + p).trim();
  }
  return lineas;
}

// ─── Base de datos ───────────────────────────────────────────────────────────

function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY en el .env");
  }
  return require("../helpers/supabaseHelper.js").supabase;
}

async function ok(promesa, que) {
  const { data, error, count } = await promesa;
  if (error) throw new Error(`${que}: ${error.message}`);
  return count ?? data;
}

async function insertar(supabase, tabla, filas, lote = 200) {
  for (let i = 0; i < filas.length; i += lote) {
    await ok(supabase.from(tabla).insert(filas.slice(i, i + lote)), `insertar en ${tabla}`);
  }
}

async function vaciarCarpeta(supabase, bucket, carpeta) {
  let borrados = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(carpeta, { limit: 100 });
    if (error) { console.warn(`  ! no se pudo listar ${bucket}/${carpeta}: ${error.message}`); return borrados; }
    const archivos = (data || []).filter((f) => f.id || f.metadata).map((f) => `${carpeta}/${f.name}`);
    if (!archivos.length) return borrados;
    const { error: e2 } = await supabase.storage.from(bucket).remove(archivos);
    if (e2) { console.warn(`  ! no se pudo borrar en ${bucket}: ${e2.message}`); return borrados; }
    borrados += archivos.length;
  }
}

async function borrar(supabase) {
  console.log(`\nBorrando la organización ${TENANT_ID} y todo lo que empieza por "${PREFIJO}"...`);

  // Barrera: ningún correo del dominio demo puede pertenecer a otra organización.
  const delDominio = await ok(supabase.from("users").select("id, tenant_id, email")
    .ilike("email", `%@${DOMINIO}`), "revisar correos");
  const peligrosos = (delDominio || []).filter((u) => !u.id.startsWith(PREFIJO) || (u.tenant_id && u.tenant_id !== TENANT_ID));
  if (peligrosos.length) {
    throw new Error(`Hay usuarios @${DOMINIO} que no son de la demo: ${peligrosos.map((u) => u.email).join(", ")}. No se toca nada.`);
  }

  const usuarios = await ok(supabase.from("users").select("id").or(`tenant_id.eq.${TENANT_ID},id.like.${PREFIJO}*`), "listar usuarios");
  const userIds = (usuarios || []).map((u) => u.id);
  const grupos = await ok(supabase.from("groups").select("id").eq("tenant_id", TENANT_ID), "listar grupos");
  const grupoIds = (grupos || []).map((g) => g.id);

  const pasos = [
    ["xp_movimientos", (q) => q.eq("tenant_id", TENANT_ID)],
    ["logros_usuario", (q) => q.eq("tenant_id", TENANT_ID)],
    ["intentos_examen", (q) => q.eq("tenant_id", TENANT_ID)],
    ["entregas", (q) => q.eq("tenant_id", TENANT_ID)],
    ["materiales", (q) => q.eq("tenant_id", TENANT_ID)],
    ["preguntas", (q) => q.eq("tenant_id", TENANT_ID)],
    ["activities", (q) => q.eq("tenant_id", TENANT_ID)],
    ["sections", (q) => q.eq("tenant_id", TENANT_ID)],
    ["logros", (q) => q.eq("tenant_id", TENANT_ID)],
    ["niveles", (q) => q.eq("tenant_id", TENANT_ID)],
  ];
  for (const [tabla, filtro] of pasos) {
    const n = await ok(filtro(supabase.from(tabla).delete({ count: "exact" })), `borrar ${tabla}`);
    if (n) console.log(`  - ${tabla}: ${n}`);
  }
  if (userIds.length) {
    // Lo que estas personas tengan fuera del tenant (no debería haber nada).
    for (const tabla of ["xp_movimientos", "logros_usuario", "intentos_examen", "entregas"]) {
      await ok(supabase.from(tabla).delete().in("user_id", userIds), `borrar ${tabla} de usuarios demo`);
    }
    await ok(supabase.from("users_groups").delete().in("id_user", userIds), "borrar users_groups");
  }
  if (grupoIds.length) {
    await ok(supabase.from("groups_courses").delete().in("id_group", grupoIds), "borrar groups_courses");
    await ok(supabase.from("users_groups").delete().in("id_group", grupoIds), "borrar users_groups de grupos");
  }
  for (const tabla of ["courses", "groups"]) {
    const n = await ok(supabase.from(tabla).delete({ count: "exact" }).eq("tenant_id", TENANT_ID), `borrar ${tabla}`);
    if (n) console.log(`  - ${tabla}: ${n}`);
  }
  if (userIds.length) {
    const n = await ok(supabase.from("users").delete({ count: "exact" }).in("id", userIds), "borrar users");
    console.log(`  - users: ${n}`);
  }
  const t = await ok(supabase.from("tenants").delete({ count: "exact" }).eq("id", TENANT_ID), "borrar tenant");
  if (t) console.log("  - tenants: 1");

  const b = await vaciarCarpeta(supabase, BUCKET_BANNERS, TENANT_ID);
  const m = await vaciarCarpeta(supabase, BUCKET_MATERIALES, TENANT_ID);
  if (b || m) console.log(`  - storage: ${b} banners, ${m} archivos de materiales/entregas`);
  console.log("Listo.");
}

async function crear(supabase) {
  await borrar(supabase);

  const conflicto = await ok(supabase.from("tenants").select("id").eq("domain", DOMINIO).neq("id", TENANT_ID), "revisar dominio");
  if (conflicto?.length) throw new Error(`El dominio ${DOMINIO} ya lo usa la organización ${conflicto[0].id}.`);

  const genericos = await ok(supabase.from("logros")
    .select("id, tenant_id, course_id, nombre, tipo_condicion, meta, xp_recompensa, activo")
    .is("tenant_id", null).eq("activo", true), "leer logros genéricos");
  const plan = construir(genericos || []);

  console.log(`\nCreando ${EMPRESA} (${TENANT_ID})...`);
  const hash = await bcrypt.hash(PASSWORD, 10);

  await insertar(supabase, "tenants", [plan.tenant]);
  await insertar(supabase, "users", plan.users.map((u) => ({ ...u, password: hash })));
  await insertar(supabase, "groups", plan.groups);
  await insertar(supabase, "users_groups", plan.users_groups);

  // Portadas: SVG generado. Si Storage lo rechaza, el curso queda sin portada.
  for (const c of CURSOS) {
    const ruta = `${TENANT_ID}/banner-${c.key}.svg`;
    const { error } = await supabase.storage.from(BUCKET_BANNERS)
      .upload(ruta, Buffer.from(bannerSvg(c), "utf8"), { contentType: "image/svg+xml", upsert: true });
    if (error) { console.warn(`  ! portada de ${c.key} no subida: ${error.message}`); continue; }
    const { data } = supabase.storage.from(BUCKET_BANNERS).getPublicUrl(ruta);
    plan.courses.find((x) => x.id === `${PREFIJO}c-${c.key}`).banner_url = data.publicUrl;
  }

  await insertar(supabase, "courses", plan.courses);
  await insertar(supabase, "groups_courses", plan.groups_courses);
  await insertar(supabase, "sections", plan.sections);
  await insertar(supabase, "activities", plan.activities);
  await insertar(supabase, "materiales", plan.materiales);

  // Exámenes por el mismo camino que ExamenService.guardar: la función guardar_examen.
  for (const ex of plan.examenes) {
    await ok(supabase.rpc("guardar_examen", {
      p_activity: ex.activityId, p_tenant: TENANT_ID,
      p_config: { ...ex.config, mostrar_respuestas: true },
      p_preguntas: ex.preguntas.map((p) => ({ id: null, ...p })),
    }), `guardar_examen ${ex.activityId}`);
  }

  await insertar(supabase, "logros", plan.logros);
  await insertar(supabase, "entregas", plan.entregas);
  await insertar(supabase, "intentos_examen", plan.intentos);
  await insertar(supabase, "xp_movimientos", plan.movimientos);
  await insertar(supabase, "logros_usuario", plan.logros_usuario);

  // Totales desde el libro, con las funciones de la app (recalcular_xp + subir_nivel).
  const GamificationService = require("../services/gamificationService.js");
  const DesbloqueoService = require("../services/desbloqueoService.js");
  for (const ap of APRENDICES) {
    await GamificationService.recalcular(ap.id, TENANT_ID);
    await ok(supabase.from("users").update(plan.rachas.get(ap.id)).eq("id", ap.id), "guardar racha");
  }

  // Control: la evaluación real de logros no debería encontrar nada pendiente.
  let extra = 0;
  for (const ap of APRENDICES) {
    const r = await DesbloqueoService.evaluar(ap.id);
    if (r.logros.length) {
      extra += r.logros.length;
      console.warn(`  ! ${ap.email}: la app otorgó además ${r.logros.map((l) => l.nombre).join(", ")}`);
      // Que no queden con fecha de hoy: van al momento de su última actividad.
      const ultima = plan.movimientos.filter((m) => m.user_id === ap.id).map((m) => m.created_at).sort().pop();
      const ids = r.logros.map((l) => l.id);
      await ok(supabase.from("logros_usuario").update({ desbloqueado_at: ultima }).eq("user_id", ap.id).in("logro_id", ids), "fechar logro");
      await ok(supabase.from("xp_movimientos").update({ created_at: ultima }).eq("user_id", ap.id).in("logro_id", ids), "fechar movimiento");
      await GamificationService.recalcular(ap.id, TENANT_ID);
    }
  }

  console.log(`Listo. Logros extra otorgados por la evaluación real: ${extra}.`);
  imprimirResumen(plan);
  await verificar(supabase);
}

// ─── Verificación ────────────────────────────────────────────────────────────

async function verificar(supabase) {
  console.log("\n── Conteos en la base (organización demo) ──");
  const porTenant = ["users", "groups", "courses", "sections", "activities", "materiales", "preguntas",
    "logros", "entregas", "intentos_examen", "xp_movimientos", "logros_usuario"];
  for (const t of porTenant) {
    const n = await ok(supabase.from(t).select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID), `contar ${t}`);
    console.log(`  ${t.padEnd(16)} ${n}`);
  }
  const grupos = (await ok(supabase.from("groups").select("id").eq("tenant_id", TENANT_ID), "grupos")).map((g) => g.id);
  const preg = (await ok(supabase.from("preguntas").select("id").eq("tenant_id", TENANT_ID), "preguntas")).map((p) => p.id);
  console.log(`  ${"users_groups".padEnd(16)} ${await ok(supabase.from("users_groups").select("id", { count: "exact", head: true }).in("id_group", grupos), "ug")}`);
  console.log(`  ${"groups_courses".padEnd(16)} ${await ok(supabase.from("groups_courses").select("id", { count: "exact", head: true }).in("id_group", grupos), "gc")}`);
  console.log(`  ${"opciones".padEnd(16)} ${await ok(supabase.from("opciones").select("id", { count: "exact", head: true }).in("pregunta_id", preg), "op")}`);

  // XP de cada persona contra su libro, y nivel contra la curva.
  const usuarios = await ok(supabase.from("users").select("id, email, xp, level, streak, racha_maxima, ultima_actividad, role").eq("tenant_id", TENANT_ID), "usuarios");
  const movs = await ok(supabase.from("xp_movimientos").select("user_id, xp").eq("tenant_id", TENANT_ID).limit(5000), "movimientos");
  const suma = new Map();
  for (const m of movs) suma.set(m.user_id, (suma.get(m.user_id) || 0) + m.xp);
  const descuadres = usuarios.filter((u) => (suma.get(u.id) || 0) !== (u.xp || 0) || nivelPara(u.xp) !== u.level);
  console.log(`\nXP y nivel coherentes con el libro: ${descuadres.length ? "NO -> " + descuadres.map((u) => u.email).join(", ") : "sí (" + usuarios.length + " personas)"}`);

  // Servicios reales con un token firmado igual que authService.
  const firmar = (u) => jwt.sign({ id: u.id, email: u.email, tenantId: TENANT_ID, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const actor = (u) => { const d = jwt.verify(firmar(u), process.env.JWT_SECRET); return { id: d.id, email: d.email, role: d.role, tenantId: d.tenantId }; };
  const admin = actor(STAFF[0]);
  const instSst = actor(STAFF[2]);
  const instOps = actor(STAFF[1]);
  const top = actor({ ...APRENDICES[0], role: "student" });

  const GamificationService = require("../services/gamificationService.js");
  const CourseService = require("../services/courseService.js");
  const EntregaService = require("../services/entregaService.js");
  const DesbloqueoService = require("../services/desbloqueoService.js");
  const PendientesService = require("../services/pendientesService.js");
  const UserService = require("../services/userService.js");

  const ranking = await GamificationService.getRanking(admin.tenantId, { actor: admin });
  const ajenos = ranking.filter((r) => !r.id.startsWith(PREFIJO));
  console.log(`\nRanking (${ranking.length} aprendices, ajenos: ${ajenos.length}):`);
  ranking.slice(0, 5).forEach((r) => console.log(`  ${r.posicion}. ${r.firstname} ${r.lastname} · nivel ${r.level} · ${r.xp} XP`));

  const part = await CourseService.participantes(`${PREFIJO}c-sst`, instSst);
  console.log(`\nParticipantes de SG-SST vistos por ${STAFF[2].email}: ${part.total} aprendices en ${part.grupos.length} grupos; instructor ${part.instructor?.email}; ajenos: ${part.aprendices.filter((a) => !a.id.startsWith(PREFIJO)).length}`);

  for (const [quien, a] of [["admin", admin], ["instructora SST", instSst], ["instructor operaciones", instOps]]) {
    const b = await EntregaService.bandeja(a, { estado: "todas" });
    const ajenas = b.entregas.filter((e) => !String(e.id).startsWith(PREFIJO) && e.tenantId !== TENANT_ID).length;
    console.log(`Bandeja de ${quien}: ${JSON.stringify(b.contadores)}; ajenas: ${ajenas}`);
  }

  const prog = await GamificationService.miProgreso(top.id);
  const mios = await DesbloqueoService.mios(top.id);
  const cursos = await CourseService.getByUser(top.id, { soloPublicados: true });
  console.log(`\n${APRENDICES[0].email}: nivel ${prog.nivel}, ${prog.xp} XP, racha ${prog.racha.dias} días (máx ${prog.racha.maxima}), logros ${mios.logros.filter((l) => l.desbloqueado).length}/${mios.logros.length}`);
  console.log(`  cursos: ${cursos.map((c) => `${c.name} ${c.progreso?.porcentaje}%`).join(" | ")}`);

  const pend = await PendientesService.de(admin);
  console.log(`Pendientes de administración: ${JSON.stringify(pend.resumen)}`);

  const sinActividad = usuarios.filter((u) => u.role === "student" && (!u.ultima_actividad || u.ultima_actividad < haceDias(7)));
  console.log(`Sin actividad en 7 días: ${sinActividad.map((u) => `${u.email} (última ${u.ultima_actividad})`).join(", ")}`);

  const cred = await UserService._getForAuth(STAFF[0].email);
  console.log(`Contraseña de demo válida para ${STAFF[0].email}: ${cred ? await bcrypt.compare(PASSWORD, cred.password) : "usuario no encontrado"}`);
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

function imprimirResumen(plan) {
  console.log(`\n${EMPRESA} · ${TENANT_ID} · @${DOMINIO} · contraseña de todos: ${PASSWORD}`);
  console.log("Staff:");
  STAFF.forEach((s) => console.log(`  ${s.role.padEnd(10)} ${s.email.padEnd(32)} ${s.firstname} ${s.lastname} · ${s.cargo}`));
  console.log("Aprendices:");
  const ordenados = [...plan.resumen].sort((a, b) => b.xp - a.xp);
  for (const r of ordenados) {
    const vigente = r.racha.ultimaActividad >= haceDias(1) ? r.racha.racha : 0;
    console.log(`  ${r.ap.email.padEnd(32)} ${r.ap.grupo} · nivel ${r.nivel} · ${String(r.xp).padStart(4)} XP · ${r.completadas}/${r.total} act · racha ${vigente} (máx ${r.racha.rachaMaxima}) · última ${r.racha.ultimaActividad} · logros ${r.logros}`);
  }
  const cuenta = (k) => plan[k].length;
  console.log(`\nFilas: users ${cuenta("users")}, groups ${cuenta("groups")}, users_groups ${cuenta("users_groups")}, courses ${cuenta("courses")}, groups_courses ${cuenta("groups_courses")}, sections ${cuenta("sections")}, activities ${cuenta("activities")}, materiales ${cuenta("materiales")}, preguntas ${plan.examenes.reduce((s, e) => s + e.preguntas.length, 0)}, logros ${cuenta("logros")}, entregas ${cuenta("entregas")} (${["entregado", "aprobada", "rehacer"].map((e) => `${e} ${plan.entregas.filter((x) => x.estado === e).length}`).join(", ")}), intentos ${cuenta("intentos")} (aprobados ${plan.intentos.filter((i) => i.aprobado).length}), xp_movimientos ${cuenta("movimientos")}, logros_usuario ${cuenta("logros_usuario")}`);
  const porDia = new Map();
  for (const m of plan.movimientos) porDia.set(diaDe(new Date(m.created_at)), (porDia.get(diaDe(new Date(m.created_at))) || 0) + m.xp);
  const desde = [...porDia.keys()].sort()[0];
  const sum = (a, b) => [...porDia].filter(([d]) => d > haceDias(a) && d <= haceDias(b)).reduce((s, [, x]) => s + x, 0);
  console.log(`Movimientos desde ${desde}; XP últimos 7 días ${sum(7, 0)} vs 7 anteriores ${sum(14, 7)}; últimos 30 ${sum(30, 0)} vs 30 anteriores ${sum(60, 30)}; días con actividad ${porDia.size}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const accion = process.argv[2];
  if (accion === "plan") {
    imprimirResumen(construir(GENERICOS_POR_DEFECTO));
    return;
  }
  if (!["crear", "borrar", "verificar"].includes(accion)) {
    console.log("Uso: node scripts/seed-demo.js crear | borrar | verificar | plan");
    process.exitCode = 1;
    return;
  }
  const supabase = db();
  console.log(`Conectando a ${process.env.SUPABASE_URL}`);
  if (accion === "crear") await crear(supabase);
  if (accion === "borrar") await borrar(supabase);
  if (accion === "verificar") await verificar(supabase);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
