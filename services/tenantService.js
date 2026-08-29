const { supabase } = require("../helpers/supabaseHelper.js");
const TenantSchema = require("../schemas/tenantSchema.js");
const crypto = require("crypto");

function toTenant(row) {
  if (!row) return null;
  const { created_at, ...rest } = row;
  return { ...rest, createdAt: created_at };
}

class TenantService {
  static async create(data) {
    const id = crypto.randomBytes(4).toString("hex");
    const tenantData = {
      id,
      name: data.name,
      domain: data.domain.toLowerCase(),
      active: true,
      createdAt: new Date().toISOString(),
    };

    const validation = TenantSchema.schema.safeParse(tenantData);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((e) => e.message).join(", "));
    }

    const { error } = await supabase.from("tenants").insert({
      id: validation.data.id,
      name: validation.data.name,
      domain: validation.data.domain,
      active: validation.data.active,
      created_at: validation.data.createdAt,
    });
    if (error) throw new Error(error.message);

    return validation.data;
  }

  static async getAll() {
    const { data, error } = await supabase.from("tenants").select("*");
    if (error) throw new Error(error.message);
    return (data || []).map(toTenant);
  }

  static async getById(id) {
    const { data } = await supabase.from("tenants").select("*").eq("id", id).maybeSingle();
    return toTenant(data);
  }

  static async getByDomain(domain) {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("domain", domain.toLowerCase())
      .eq("active", true)
      .maybeSingle();
    return toTenant(data);
  }

  static async update(id, data) {
    const { data: existing } = await supabase.from("tenants").select("*").eq("id", id).maybeSingle();
    if (!existing) throw new Error("Tenant no encontrado");

    const allowed = {};
    if (data.name) allowed.name = data.name;
    if (data.domain) allowed.domain = data.domain.toLowerCase();
    if (typeof data.active === "boolean") allowed.active = data.active;

    const { error } = await supabase.from("tenants").update(allowed).eq("id", id);
    if (error) throw new Error(error.message);

    return toTenant({ ...existing, ...allowed });
  }

  static async delete(id) {
    const { data: existing } = await supabase.from("tenants").select("id").eq("id", id).maybeSingle();
    if (!existing) throw new Error("Tenant no encontrado");

    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  }
}

module.exports = TenantService;
