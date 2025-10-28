//controllers/userController.js
const UserService = require("../services/userService.js");
const zod = require("zod");

class UserController {
  static async create(req, res) {
    try {
      const user = await UserService.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      console.error("Error al crear el usuario:", error.message);
      if (error instanceof zod.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  static async getAll(req, res) {
    try {
      const users = await UserService.getAll();
      res.status(200).json(users);
    } catch (error) {
      console.error("Error al obtener los usuarios:", error);
      res.status(500).send("Error al obtener los usuarios");
    }
  }

  static async getByEmail(req, res) {
    try {
      const { email } = req.params;
      const user = await UserService.getByEmail(email);
      if (!user.length) return res.status(404).send("Usuario no encontrado");
      res.status(200).json(user);
    } catch (error) {
      console.error("Error al buscar usuario por email:", error);
      res.status(500).send("Error interno");
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const user = await UserService.getById(id);
      if (!user) return res.status(404).send("Usuario no encontrado");
      res.status(200).json(user);
    } catch (error) {
      console.error("Error al buscar usuario por ID:", error);
      res.status(500).send("Error interno");
    }
  }

  static async getByRole(req, res) {
    try {
      const { rol } = req.params;
      const users = await UserService.getByRole(rol);
      res.status(200).json(users);
    } catch (error) {
      console.error("Error al buscar usuario por rol:", error);
      res.status(500).send("Error interno");
    }
  }

  static async getUserCourses(req, res) {
    try {
      const { id_user } = req.params;
      const courses = await UserService.getUserCourses(id_user);
      if (!courses.length)
        return res.status(404).send("Este usuario no está inscrito en ningún curso.");
      res.status(200).json(courses);
    } catch (error) {
      console.error("Error al obtener los cursos del usuario:", error);
      res.status(500).send("Error al obtener los cursos del usuario");
    }
  }

  //eliminar un usuario
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).send("ID de usuario es requerido");
      }
      await UserService.deleteUser(id);
      res.status(200).send(`Usuario eliminado ${id} correctamente`);
    } catch (error) {
      console.error("Error al eliminar el usuario:", error);
      res.status(500).send("Error al eliminar el usuario");
    }
  }

  //actualizar un usuario
  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const response = await UserService.updateUser(id, updateData);

      if (response.error) {
        return res.status(400).json(response);
      }

      res.status(200).json(response);
    } catch (error) {
      console.error("Error al actualizar el usuario:", error);
      if (error instanceof zod.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
}

module.exports = UserController;
