require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
const { iniciarWhatsApp, getQr, getStatus } = require('./services/whatsappService');
const { procesarCola } = require('./services/queueService');

const clientesRoutes = require('./routes/clientes'); 
const configRoutes = require('./routes/config'); 

const app = express();

// --- Middlewares ---
app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'public'))); 

// --- RUTAS ---
app.use('/api/clientes', clientesRoutes);
app.use('/api/config', configRoutes); 

// Endpoint de Estado
app.get('/api/status', async (req, res) => {
    res.json({
        status: getStatus(),
        qr: getQr()
    });
});

// --- INICIALIZACIÓN ---
const startServer = async () => {
    try {
        // 1. Conectar Base de Datos
        await connectDB();
        
        // ====================================================================
        // 🚨 ZONA DE EMERGENCIA: SI SIGUE EN BUCLE, DESCOMENTA ESTAS 4 LÍNEAS
        // Para descomentar: quita las dos barras "//" del inicio de las líneas de abajo.
        
        // const mongoose = require('mongoose');
        // console.log('☢️ BORRANDO SESIÓN MANUALMENTE...');
        // await mongoose.connection.collection('sesion_whatsapp').drop();
        // console.log('✅ SESIÓN BORRADA. Reiniciando para pedir QR...');
        
        // ====================================================================

        // 2. Iniciar WhatsApp
        await iniciarWhatsApp();

        // 3. Levantar Servidor
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
            procesarCola();
        });

    } catch (error) {
        console.error('Error fatal iniciando servidor:', error);
    }
};

startServer();

// --- SISTEMA ANTI-CRASH ---
process.on('uncaughtException', (err) => {
    console.error('⚠️ ERROR NO CAPTURADO:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ PROMESA RECHAZADA:', reason);
});