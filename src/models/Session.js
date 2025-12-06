const mongoose = require('mongoose');

// Este esquema guardará las claves de cifrado de WhatsApp
const SessionSchema = new mongoose.Schema({
    _id: { 
        type: String, 
        required: true 
    },
    data: { 
        type: Object, 
        required: true 
    }
});

module.exports = mongoose.model('Session', SessionSchema);