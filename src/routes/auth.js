const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');

// Obtenemos la contraseña del .env, o usamos una por defecto si falla
const ADMIN_PASS = 'admin123';
const AGENTE_PASS = 'agente123'; 

// --- FUNCIÓN AUTOMÁTICA: CREAR USUARIOS SI NO EXISTEN ---
const crearUsuariosPorDefecto = async () => {
    try {
        // 1. Verificar/Crear ADMIN
        const adminExiste = await Usuario.findOne({ username: 'admin' });
        if (!adminExiste) {
            await new Usuario({
                username: 'admin',
                password: ADMIN_PASS, // Nota: Para máxima seguridad en el futuro usaremos hash, por ahora texto plano para facilitar tu implementación
                rol: 'ADMIN',
                nombre: 'Super Administrador'
            }).save();
            console.log('👤 Sistema: Usuario ADMIN creado por defecto.');
        }

        // 2. Verificar/Crear AGENTE
        const agenteExiste = await Usuario.findOne({ username: 'agente' });
        if (!agenteExiste) {
            await new Usuario({
                username: 'agente',
                password: AGENTE_PASS,
                rol: 'AGENTE',
                nombre: 'Agente de Ventas'
            }).save();
            console.log('👤 Sistema: Usuario AGENTE creado por defecto.');
        }

    } catch (error) {
        console.error('Error creando usuarios iniciales:', error);
    }
};

// Ejecutamos esta comprobación 5 segundos después de iniciar para dar tiempo a que Mongo conecte
setTimeout(crearUsuariosPorDefecto, 5000);

// --- RUTA DE LOGIN (POST /api/auth/login) ---
router.post('/login', async (req, res) => {
    try {
        // Convertimos username a minúsculas para evitar errores de tipeo
        const usernameInput = req.body.username.toLowerCase().trim();
        const passwordInput = req.body.password;

        // Buscar usuario
        const user = await Usuario.findOne({ username: usernameInput });

        if (!user) {
            return res.status(401).json({ ok: false, msg: 'Usuario no encontrado' });
        }

        // Validar contraseña
        if (user.password !== passwordInput) {
            return res.status(401).json({ ok: false, msg: 'Contraseña incorrecta' });
        }

        // Login exitoso: Devolvemos los datos (menos la contraseña)
        res.json({
            ok: true,
            msg: 'Bienvenido',
            usuario: {
                id: user._id,
                username: user.username,
                nombre: user.nombre,
                rol: user.rol // IMPORTANTE: Esto le dirá al frontend qué panel mostrar
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, msg: 'Error de servidor al loguear' });
    }
});

module.exports = router;