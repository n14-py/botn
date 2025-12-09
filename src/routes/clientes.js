const express = require('express');
const router = express.Router();
const Cliente = require('../models/Cliente');

// --- HELPER: CORREGIR NÚMEROS DE PARAGUAY ---
const formatearNumeroParaguay = (numero) => {
    if (!numero) return '';
    let limpio = numero.toString().replace(/\D/g, ''); // Solo números
    if (limpio.startsWith('09')) return '595' + limpio.substring(1);
    else if (limpio.startsWith('9') && limpio.length === 9) return '595' + limpio;
    return limpio;
};

// 1. BUSCADOR INTELIGENTE (Para el Agente)
// Ruta: GET /api/clientes/buscar?q=juan
router.get('/buscar', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        // Creamos una expresión regular para buscar sin importar mayúsculas/minúsculas
        const regex = new RegExp(q, 'i');

        const resultados = await Cliente.find({
            $or: [
                { nombres: regex },
                { apellidos: regex },
                { cedula: regex },
                { celular: regex },
                { celularReal: regex }
            ]
        }).limit(20); // Limitamos a 20 para que sea rápido

        res.json(resultados);

    } catch (error) {
        console.error("Error buscando:", error);
        res.status(500).json({ msg: 'Error en búsqueda' });
    }
});

// 2. ACTUALIZAR ESTADO Y MONTO (Aprobar/Rechazar)
// Ruta: PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, montoAprobado, observacionAgente } = req.body;

        const clienteActualizado = await Cliente.findByIdAndUpdate(id, {
            estado,
            montoAprobado,
            observacionAgente,
            fechaGestion: new Date() // Guardamos cuándo se gestionó
        }, { new: true });

        if (!clienteActualizado) {
            return res.status(404).json({ msg: 'Cliente no encontrado' });
        }

        res.json({ ok: true, cliente: clienteActualizado });

    } catch (error) {
        console.error("Error actualizando:", error);
        res.status(500).json({ msg: 'Error actualizando cliente' });
    }
});

// 3. CARGA MASIVA (Excel o Manual) - OPTIMIZADA
router.post('/', async (req, res) => {
    try {
        const { clientes } = req.body;

        if (!clientes || clientes.length === 0) {
            return res.status(400).json({ msg: 'No se enviaron datos' });
        }

        console.log(`📥 Procesando carga masiva de ${clientes.length} registros...`);

        // Preparamos operaciones para Mongo (BulkWrite es ultra rápido para miles de datos)
        const operaciones = clientes.map(c => {
            const celularCorregido = formatearNumeroParaguay(c.celular);

            return {
                updateOne: {
                    filter: { cedula: c.cedula }, 
                    // Si existe, actualizamos nombres/celular. Si no, se crea.
                    update: { 
                        $set: {
                            nombres: c.nombres,
                            apellidos: c.apellidos,
                            celular: celularCorregido, 
                            // IMPORTANTE: No sobrescribimos el estado si ya estaba gestionado
                        },
                        $setOnInsert: { 
                            estado: 'PENDIENTE',
                            fechaCarga: new Date()
                        }
                    },
                    upsert: true 
                }
            };
        });

        const resultado = await Cliente.bulkWrite(operaciones);

        res.json({
            ok: true,
            msg: 'Procesado correctamente',
            nuevos: resultado.upsertedCount,
            actualizados: resultado.modifiedCount
        });

    } catch (error) {
        console.error("❌ Error en carga masiva:", error);
        res.status(500).json({ msg: 'Error interno del servidor' });
    }
});

// 4. LISTA GENERAL (Para el Admin - Últimos 100)
router.get('/', async (req, res) => {
    try {
        const lista = await Cliente.find().sort({ fechaCarga: -1 }).limit(100);
        res.json(lista);
    } catch (error) {
        res.status(500).json({ msg: 'Error al leer DB' });
    }
});

module.exports = router;