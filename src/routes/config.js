const express = require('express');
const router = express.Router();
const Config = require('../models/Config');

// GET: Obtener configuración actual
router.get('/', async (req, res) => {
    try {
        // Buscamos la config general. Si no existe, la creamos con valores por defecto.
        let config = await Config.findOne({ clave: 'general' });

        if (!config) {
            config = new Config({ clave: 'general' });
            await config.save();
        }

        res.json(config);
    } catch (error) {
        console.error("Error al obtener config:", error);
        res.status(500).json({ msg: 'Error interno del servidor' });
    }
});

// POST: Actualizar configuración
router.post('/', async (req, res) => {
    try {
        const { horaInicio, horaFin, limiteDiario } = req.body;

        // Validaciones básicas
        if (horaInicio < 0 || horaInicio > 23 || horaFin < 0 || horaFin > 23) {
            return res.status(400).json({ msg: 'Horas inválidas (0-23)' });
        }

        // Actualizamos (usando findOneAndUpdate con upsert para seguridad)
        const config = await Config.findOneAndUpdate(
            { clave: 'general' },
            { 
                $set: { 
                    horaInicio: parseInt(horaInicio),
                    horaFin: parseInt(horaFin),
                    limiteDiario: parseInt(limiteDiario)
                } 
            },
            { new: true, upsert: true } // new: devuelve el objeto actualizado
        );

        console.log(`⚙️ Configuración actualizada: ${config.horaInicio}:00 - ${config.horaFin}:00 | Límite: ${config.limiteDiario}`);
        res.json({ msg: 'Configuración guardada correctamente', config });

    } catch (error) {
        console.error("Error guardando config:", error);
        res.status(500).json({ msg: 'Error interno del servidor' });
    }
});

module.exports = router;