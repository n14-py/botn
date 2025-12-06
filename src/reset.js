// src/reset.js
require('dotenv').config();
const mongoose = require('mongoose');

const resetSession = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('🔥 Conectado a Mongo. Buscando sesión...');
        
        const collection = mongoose.connection.collection('sesion_whatsapp');
        const count = await collection.countDocuments();
        
        if (count > 0) {
            await collection.drop();
            console.log('✅ ¡ÉXITO! Sesión de WhatsApp eliminada completamente.');
        } else {
            console.log('⚠️ No se encontró ninguna sesión guardada (ya estaba limpia).');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

resetSession();