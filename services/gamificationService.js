const { supabase } = require("../helpers/supabaseHelper.js");

class GamificationService {
  static async getRanking() {
    const { data, error } = await supabase
      .from("users")
      .select("id, firstname, lastname, level")
      .not("role", "in", "(admin,superadmin,instructor)")
      .order("level", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  }
}

module.exports = GamificationService;
