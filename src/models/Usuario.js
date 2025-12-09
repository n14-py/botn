const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    rol: { 
        type: String, 
        enum: ['ADMIN', 'AGENTE'], 
        required: true
    },
    nombre: { 
        type: String, 
        default: 'Usuario' 
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Usuario', UsuarioSchema);