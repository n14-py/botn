const express = require('express');
const router = express.Router();
const Cliente = require('../models/Cliente');

// --- FUNCIÓN PARA CORREGIR NÚMEROS DE PARAGUAY ---
const formatearNumeroParaguay = (numero) => {
    if (!numero) return '';
    
    // 1. Quitamos espacios, guiones, paréntesis y letras (solo dejamos números)
    let limpio = numero.toString().replace(/\D/g, '');

    // 2. Lógica para Paraguay
    // Si empieza con '09', le quitamos el '0' y agregamos '595'
    if (limpio.startsWith('09')) {
        return '595' + limpio.substring(1);
    }
    // Si empieza con '9' (y no tiene el prefijo), le agregamos '595'
    else if (limpio.startsWith('9') && limpio.length === 9) {
        return '595' + limpio;
    }
    
    // Si ya empieza con 595 o no cumple reglas, lo devolvemos limpio
    return limpio;
};

// RUTA: Carga Masiva (Excel o Manual)
router.post('/', async (req, res) => {
    try {
        const { clientes } = req.body;

        if (!clientes || clientes.length === 0) {
            return res.status(400).json({ msg: 'No se enviaron datos' });
        }

        console.log(`📥 Procesando ${clientes.length} clientes...`);

        // Preparamos la operación masiva con el número CORREGIDO
        const operaciones = clientes.map(c => {
            const celularCorregido = formatearNumeroParaguay(c.celular);

            return {
                updateOne: {
                    filter: { cedula: c.cedula }, 
                    update: { 
                        $set: {
                            nombres: c.nombres,
                            apellidos: c.apellidos,
                            celular: celularCorregido, // <--- AQUÍ GUARDAMOS EL 595
                        },
                        $setOnInsert: { estado: 'PENDIENTE' }
                    },
                    upsert: true 
                }
            };
        });

        const resultado = await Cliente.bulkWrite(operaciones);

        res.json({
            ok: true,
            msg: 'Carga completada y números corregidos',
            nuevos: resultado.upsertedCount,
            actualizados: resultado.modifiedCount
        });

    } catch (error) {
        console.error("❌ Error guardando clientes:", error);
        res.status(500).json({ msg: 'Error interno del servidor' });
    }
});

// RUTA: Obtener lista
router.get('/', async (req, res) => {
    try {
        const lista = await Cliente.find().sort({ fechaCarga: -1 }).limit(100);
        res.json(lista);
    } catch (error) {
        res.status(500).json({ msg: 'Error al leer DB' });
    }
});

module.exports = router;