const mongoose = require('mongoose');

const ClienteSchema = new mongoose.Schema({
    cedula: { type: String, required: true, unique: true, trim: true },
    nombres: { type: String, required: true, uppercase: true },
    apellidos: { type: String, default: '', uppercase: true },
    celular: { type: String, required: true, trim: true },
    celularReal: { type: String, default: '' },
    lid: { type: String, default: '' },
    esTemporal: { type: Boolean, default: false },
    
    // ESTADOS: Agregamos 'VENTA_CONCRETADA' para tu comisión
    estado: {
        type: String,
        enum: ['PENDIENTE', 'CONTACTADO', 'INTERESADO', 'ESPERANDO_VERIFICACION', 'APTO_CREDITO', 'RECHAZADO', 'VENTA_CONCRETADA'],
        default: 'PENDIENTE'
    },
    
    cedulaProporcionada: { type: String, default: '' }, 
    montoDeuda: { type: String, default: '0' },
    montoAprobado: { type: String, default: '0' }, 
    observacionAgente: { type: String, default: '' },
    fechaGestion: { type: Date }, 
    fechaVenta: { type: Date }, // Para saber cuándo ganaste los 500.000

    historialChat: [{ rol: String, mensaje: String, fecha: { type: Date, default: Date.now } }],
    fechaCarga: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cliente', ClienteSchema);