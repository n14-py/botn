const mongoose = require('mongoose');

const ClienteSchema = new mongoose.Schema({
    cedula: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true
    },
    nombres: { 
        type: String, 
        required: true,
        uppercase: true 
    },
    apellidos: { 
        type: String, 
        default: '',
        uppercase: true
    },
    celular: { 
        type: String, 
        required: true,
        trim: true 
    },
    // --- NUEVO CAMPO: Para guardar el 595... si usamos LID ---
    celularReal: { 
        type: String, 
        default: '' 
    },
    // ---------------------------------------------------------
    estado: {
        type: String,
        enum: ['PENDIENTE', 'CONTACTADO', 'INTERESADO', 'ESPERANDO_VERIFICACION', 'APTO_CREDITO', 'RECHAZADO'],
        default: 'PENDIENTE'
    },
    cedulaProporcionada: { type: String, default: '' }, 
    montoDeuda: { type: String, default: '0' },
    historialChat: [
        {
            rol: String, 
            mensaje: String,
            fecha: { type: Date, default: Date.now }
        }
    ],
    fechaCarga: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Cliente', ClienteSchema);