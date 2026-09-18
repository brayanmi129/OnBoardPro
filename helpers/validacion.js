// Errores de validación que sirven para algo.
//
// Antes los servicios hacían esto:
//
//   throw new Error(validation.error.errors.map((e) => e.message).join(", "));
//
// y se perdían las dos cosas que importan. Por un lado el nombre del campo:
// faltar `instructor` daba el mensaje `"Required"` a secas, y con dos campos
// faltantes, `"Required, Required"`. Por otro, el tipo de error: los
// controladores preguntaban `error instanceof zod.ZodError`, pero acá ya se
// había convertido en un Error común, así que esa rama nunca corría y un dato
// mal escrito por el cliente salía como 500 —un fallo del servidor— en vez de
// 400.
function errorDeValidacion(zodError) {
  const campos = zodError.errors.map((e) => ({
    campo: e.path?.join(".") || "(raíz)",
    problema: e.message,
  }));

  const err = new Error(campos.map((c) => `${c.campo}: ${c.problema}`).join(", "));
  err.status = 400;
  err.campos = campos;
  return err;
}

/** Igual que el anterior, para los servicios que devuelven el error en vez de lanzarlo. */
function detalleDeValidacion(zodError) {
  return {
    error: "Datos inválidos",
    details: zodError.errors.map(
      (e) => `${e.path?.join(".") || "(raíz)"}: ${e.message}`
    ),
  };
}

module.exports = { errorDeValidacion, detalleDeValidacion };
