const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Intentamos conectar usando la URL de tu archivo .env
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // Estas opciones aseguran estabilidad en la conexión
            serverSelectionTimeoutMS: 5000,
        });

        console.log(`🔥 MongoDB Conectado: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error conectando a MongoDB: ${error.message}`);
        // Si falla, detenemos todo para no causar errores en cadena
        process.exit(1);
    }
};

module.exports = connectDB;