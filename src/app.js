require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
const { iniciarWhatsApp, getQr, getStatus } = require('./services/whatsappService');
const { procesarCola } = require('./services/queueService');

// Importar Rutas
const clientesRoutes = require('./routes/clientes'); 
const configRoutes = require('./routes/config'); 
const authRoutes = require('./routes/auth'); // <--- NUEVA IMPORTACIÓN

const app = express();

// --- Middlewares ---
app.use(cors()); 
app.use(express.json({ limit: '50mb' })); // Límite alto para tus cargas masivas de Excel
app.use(express.static(path.join(__dirname, 'public'))); 

// --- RUTAS API ---
app.use('/api/clientes', clientesRoutes);
app.use('/api/config', configRoutes); 
app.use('/api/auth', authRoutes); // <--- CONECTAMOS EL LOGIN AQUÍ

// Endpoint de Estado del Bot
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