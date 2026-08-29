const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const CourseSchema = require("../schemas/courseSchemas.js");

class CourseService {
  static async getAll() {
    const { data, error } = await supabase.from("courses").select("*");
    if (error) throw new Error(error.message);
    return data || [];
  }

  static async getById(id) {
    const { data } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
    return data;
  }

  static async createCourse(courseData) {
    const customId = crypto.randomBytes(3).toString("hex");
    courseData.id = customId;

    const validation = CourseSchema.schema.safeParse(courseData);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const course = validation.data;
    const { error } = await supabase.from("courses").insert(course);
    if (error) throw new Error(error.message);
    return course;
  }

  static async getByUser(userId) {
    const { data: userGroups } = await supabase
      .from("users_groups")
      .select("id_group")
      .eq("id_user", userId);

    if (!userGroups?.length) return [];

    const groupIds = userGroups.map((ug) => ug.id_group);

    const { data: groupCourses } = await supabase
      .from("groups_courses")
      .select("id_course")
      .in("id_group", groupIds);

    if (!groupCourses?.length) return [];

    const courseIds = [...new Set(groupCourses.map((gc) => gc.id_course))];

    const { data: courses } = await supabase.from("courses").select("*").in("id", courseIds);

    return courses || [];
  }
}

module.exports = CourseService;
