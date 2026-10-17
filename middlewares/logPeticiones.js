// Una línea por petición al terminar de responder: ruta, quién la hizo,
// status, tiempo y, si salió mal, por qué.
//
//   [API] ✔ 200 GET /api/tenants/get/all · ana@x.com (superadmin) · 34ms
//   [API] ✖ 403 GET /api/tenants/get/all · ana@x.com (admin) · 2ms
//         motivo: Sin permisos para esta acción · rol "admin", la ruta exige: superadmin
//
// El motivo sale del `message` que devolvió el endpoint, más el detalle que
// los middlewares dejan en res.locals.motivo (lo que no se le cuenta al
// cliente pero sí sirve para depurar).
//
// Se registra solo la ruta, sin la query: en los callbacks de OAuth la query
// trae el code de Google/Microsoft y no debe quedar en los logs.
const DESARROLLO = process.env.NODE_ENV !== "production";

function logPeticiones(req, res, next) {
  const inicio = Date.now();

  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => {
    if (cuerpo && typeof cuerpo.message === "string") res.locals.mensaje = cuerpo.message;

    // En desarrollo el front también recibe el motivo, en un campo aparte para
    // no cambiar el `message` del que depende. En producción no: decirle a
    // cualquiera qué rol hace falta o por qué falló su token ayuda a atacar.
    if (DESARROLLO && res.statusCode >= 400 && res.locals.motivo && cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo)) {
      cuerpo = { ...cuerpo, detalle: res.locals.motivo };
    }

    return jsonOriginal(cuerpo);
  };

  res.on("finish", () => {
    const ms = Date.now() - inicio;
    const ruta = req.originalUrl.split("?")[0];
    const quien = req.user
      ? `${req.user.email || req.user.id} (${req.user.role})`
      : "anónimo";
    const ok = res.statusCode < 400;

    let linea = `[API] ${ok ? "✔" : "✖"} ${res.statusCode} ${req.method} ${ruta} · ${quien} · ${ms}ms`;

    if (!ok) {
      const motivo = [res.locals.mensaje, res.locals.motivo].filter(Boolean).join(" · ");
      if (motivo) linea += `\n      motivo: ${motivo}`;
    }

    if (res.statusCode >= 500) console.error(linea);
    else if (!ok) console.warn(linea);
    else console.log(linea);
  });

  next();
}

module.exports = logPeticiones;
