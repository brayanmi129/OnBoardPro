const { supabase } = require("../helpers/supabaseHelper.js");

class GamificationService {
  static async getRanking(tenantId = null) {
    // Sin este filtro el ranking mezclaba a los aprendices de todas las
    // empresas: un cliente veía los nombres de los empleados de otro.
    let consulta = supabase
      .from("users")
      .select("id, firstname, lastname, level")
      .not("role", "in", "(admin,superadmin,instructor)");
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);

    const { data, error } = await consulta.order("level", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  }
}

module.exports = GamificationService;
