const User  = require('../entidad/usuario.js')
const crypto = require('crypto');

class UserController {

    async fetchAllUsers(req, res) {
        try {
            const users = await User.getAll();
            res.status(200).json(users);
        } catch (error) {
            console.error("Error al obtener los usuarios:", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    async fetchUserByEmail(req, res) {
        try {
            const { email } = req.params;
            const user = await User.getByEmail(email);
            if (!user) return res.status(404).send("Usuario no encontrado");
            res.status(200).json(user);
        } catch (error) {
            console.error("Error al buscar usuario por email:", error);
            res.status(500).send("Error interno");
        }
    }
    
    async fetchUserByRole(req, res) {
        try {
            const { rol } = req.params;
            const user = await User.getByRole(rol);
            if (!user) return res.status(404).send("Usuario no encontrado");
            res.status(200).json(user);
        } catch (error) {
            console.error("Error al buscar usuario por rol:", error);
            res.status(500).send("Error interno");
        }
    }

    async fetchUserById(req, res) {
        try {
            const { id } = req.params;
            const user = await User.getById(id);
            if (!user) return res.status(404).send("Usuario no encontrado");
            res.status(200).json(user);
        } catch (error) {
            console.error("Error al buscar usuario por email:", error);
            res.status(500).send("Error interno");
        }
    }

    async createUser(req, res) {
        try {
            const userData = req.body;
            let customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 10);
            userData.id = customId
            const user = User.create(userData);
            const savedUser = await User.save(user.getUserData());
            res.status(201).json(savedUser);
        } catch (error) {
            console.error("Error al crear el usuario:", error);
            res.status(400).send(error.message || "Datos inválidos");
        }
    }

    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            await User.deleteById(id);
            res.status(200).send("Usuario eliminado");
        } catch (error) {
            console.error("Error al eliminar el usuario:", error);
            res.status(500).send("Error interno");
        }
    }
}

module.exports = new UserController();
