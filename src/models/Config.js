const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    // Usaremos un solo documento con clave 'general' para guardar la config global
    clave: { 
        type: String, 
        default: 'general', 
        unique: true 
    },
    // Configuración de Horarios (Formato 24hs, ej: 8 para 8:00 AM, 19 para 7:00 PM)
    horaInicio: { 
        type: Number, 
        default: 8 
    },
    horaFin: { 
        type: Number, 
        default: 19 
    },
    // Límites de Seguridad
    limiteDiario: { 
        type: Number, 
        default: 10 // Empezamos suave por defecto
    },
    // Contadores del Sistema
    mensajesEnviadosHoy: { 
        type: Number, 
        default: 0 
    },
    fechaUltimoReseteo: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Config', ConfigSchema);