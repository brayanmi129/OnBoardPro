const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { uploadFileToDrive } = require("../helpers/driveController.js");
const activitieSchema = require("../schemas/activitieSchema.js");

class ActivitiesService {
  static async getAll() {
    const { data, error } = await supabase.from("activities").select("*");
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async create(data, file) {
    const customId = crypto.randomBytes(3).toString("hex");
    data.id = customId;

    if (file) {
      const fileUrl = await uploadFileToDrive(file.buffer, file.originalname);
      data.adjunto = fileUrl;
    }

    const validation = activitieSchema.schema.safeParse(data);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const { error } = await supabase.from("activities").insert(validation.data);
    if (error) throw new Error(error.message);

    return validation.data;
  }
}

module.exports = ActivitiesService;
