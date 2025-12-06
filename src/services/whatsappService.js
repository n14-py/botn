const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const Cliente = require('../models/Cliente');
const { generarRespuestaIA } = require('./aiService');
const { useMongoDBAuthState } = require('./mongoAuthState');
const mongoose = require('mongoose');

let sock;
let qrCodeUrl = null;
let connectionStatus = 'disconnected';

// --- FUNCIÓN EXTRACTORA DE TEXTO "TODO TERRENO" ---
const obtenerTextoMensaje = (msg) => {
    if (!msg.message) return null;
    const mensajeReal = msg.message.ephemeralMessage?.message || msg.message.viewOnceMessage?.message || msg.message;
    
    return (
        mensajeReal.conversation || 
        mensajeReal.extendedTextMessage?.text || 
        mensajeReal.imageMessage?.caption || 
        mensajeReal.videoMessage?.caption || 
        null
    );
};

const iniciarWhatsApp = async () => {
    const collection = mongoose.connection.collection('sesion_whatsapp');
    const { state, saveCreds, clearCreds } = await useMongoDBAuthState(collection);
    console.log('🤖 Iniciando WhatsApp...');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"], // <--- NUEVA CONFIGURACIÓN
        syncFullHistory: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeUrl = await QRCode.toDataURL(qr);
            connectionStatus = 'qr_ready';
            console.log('⚡ ESCANEA EL QR AHORA');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            
            // --- MODIFICACIÓN IMPORTANTE AQUÍ ---
            // Agregamos 401 y 403 para detectar cuando la sesión fue invalidada desde el celular
            const shouldLogout = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
            
            if (shouldLogout) {
                console.log(`🛑 Sesión cerrada o inválida (Error: ${statusCode}). Borrando credenciales y reiniciando...`);
                // Esto borra la sesión corrupta de MongoDB
                await clearCreds(); 
                
                // Reiniciamos inmediatamente para que genere el nuevo QR
                iniciarWhatsApp();
            } else {
                console.log('🔄 Desconexión temporal. Reconectando...');
                iniciarWhatsApp();
            }
        
        } else if (connection === 'open') {
            console.log('✅ WHATSAPP CONECTADO');
            connectionStatus = 'connected';
            qrCodeUrl = null;
            verificarChatsPendientes();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const remoteJid = msg.key.remoteJid;
            const pushName = msg.pushName || ""; 
            
            // 1. OBTENER TEXTO
            const textoBruto = obtenerTextoMensaje(msg);
            const textoUsuario = textoBruto ? textoBruto.trim() : null;

            if (!textoUsuario) return;

            // --- FILTRO ANTI-BUCLE ---
            const frasesBot = /horarios y días disponibles|gracias por comunicarte|agenda tu cita|mensaje automático|en breve te atenderemos/i;
            if (frasesBot.test(textoUsuario)) {
                console.log(`🤖 IGNORADO: Auto-respuesta Business ("${textoUsuario.substring(0,30)}...")`);
                return;
            }

            // --- GRUPO VERIFICACIÓN ---
            if (remoteJid === process.env.GROUP_VERIFICATION_ID) {
                if (textoUsuario.includes("ACCEDE AL CREDITO=")) {
                    await procesarRespuestaAdmin(textoUsuario);
                }
                return; 
            }

            // --- CHAT PRIVADO ---
            const esChatNormal = remoteJid.endsWith('@s.whatsapp.net');
            const esChatLid = remoteJid.endsWith('@lid');

            if (!esChatNormal && !esChatLid) return;

            let numeroEntrante = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];
            const sufijoNumero = numeroEntrante.slice(-8); 

            // ============================================================
            // 🔍 BÚSQUEDA Y VINCULACIÓN BLINDADA
            // ============================================================
            
            // INTENTO 1: Por Celular
            let cliente = await Cliente.findOne({ 
                celular: { $regex: sufijoNumero + '$' } 
            });

            // INTENTO 2: POR NOMBRE (Con Seguridad Anti-Colisión)
            if (!cliente && pushName) {
                const palabrasNombre = pushName.split(' ').filter(p => p.length > 3);
                
                if (palabrasNombre.length > 0) {
                    const regexNombre = new RegExp(palabrasNombre.join('|'), 'i');
                    
                    const haceDosDias = new Date();
                    haceDosDias.setDate(haceDosDias.getDate() - 2);

                    const candidatos = await Cliente.find({
                        $or: [{ nombres: regexNombre }, { apellidos: regexNombre }],
                        estado: 'CONTACTADO',
                        historialChat: { $size: 0 },
                        fechaCarga: { $gte: haceDosDias } 
                    });

                    if (candidatos.length === 1) {
                        cliente = candidatos[0];
                        console.log(`🔗 VINCULACIÓN SEGURA: "${pushName}" es único. Match con ${cliente.nombres}`);
                        
                        if (!cliente.celularReal) cliente.celularReal = cliente.celular;
                        cliente.celular = numeroEntrante;
                        await cliente.save();

                    } else if (candidatos.length > 1) {
                        console.log(`⚠️ AMBIGÜEDAD DETECTADA: Hay ${candidatos.length} clientes que coinciden con "${pushName}". NO se vinculará automáticamente.`);
                    }
                }
            }

            // INTENTO 3: Por Cédula (Desempate final)
            if (!cliente) {
                const posibleCedulaMatch = textoUsuario.match(/\b\d{1,3}(\.?\d{3}){1,2}\b/);
                if (posibleCedulaMatch) {
                    const cedulaLimpia = posibleCedulaMatch[0].replace(/\./g, '');
                    cliente = await Cliente.findOne({ cedula: cedulaLimpia });
                    
                    if (cliente) {
                        console.log(`🔗 VINCULACIÓN POR CÉDULA: ${cliente.nombres}`);
                        if (!cliente.celularReal) cliente.celularReal = cliente.celular;
                        cliente.celular = numeroEntrante;
                        await cliente.save();
                    }
                }
            }

            console.log(`📨 Recibido de: ${numeroEntrante} | Cliente: ${cliente ? cliente.nombres : '❌ NO ENCONTRADO'}`);

            // CASO: NO ENCONTRADO
            if (!cliente) {
                if (/hola|info|interesa|quiero|buenas/i.test(textoUsuario)) {
                    console.log('❓ ID Desconocido y nombre ambiguo/no encontrado. Pidiendo Cédula...');
                    await sock.sendPresenceUpdate('composing', remoteJid);
                    setTimeout(async () => {
                        await sock.sendMessage(remoteJid, { 
                            text: "Hola 👋🏼, para poder ubicar tu ficha correctamente, por favor escríbeme tu *Número de Cédula*." 
                        });
                    }, 2000);
                }
                return;
            }

            // ============================================================
            // 🚀 PROCESAMIENTO
            // ============================================================

            // 1. Detector de Cédula
            const matchCedula = textoUsuario.match(/\b\d{1,3}(\.?\d{3}){1,2}\b/);
            
            if (matchCedula && cliente.estado !== 'RECHAZADO' && cliente.estado !== 'APTO_CREDITO') {
                const cedulaLimpia = matchCedula[0].replace(/\./g, '');
                
                cliente.cedulaProporcionada = cedulaLimpia;
                if (!cliente.cedula || cliente.cedula === '0' || cliente.cedula.includes('PENDIENTE')) {
                    cliente.cedula = cedulaLimpia;
                }

                cliente.estado = 'ESPERANDO_VERIFICACION';
                await cliente.save();

                await sock.sendMessage(remoteJid, { text: `✅ Recibido. Aguarda un momento, estamos verificando tu calificación...` });

                const groupVerification = process.env.GROUP_VERIFICATION_ID;
                if (groupVerification) {
                    const numVisible = cliente.celularReal || cliente.celular;
                    const ficha = `⚠️ *SOLICITUD DE VERIFICACIÓN* ⚠️
👤 Nombre: ${cliente.nombres} ${cliente.apellidos}
🪪 Cédula: ${cliente.cedula}
📱 Celular: +${numVisible}
---------------------
*Copia y pega el texto completo y abajo agrega SI o NO:*

ACCEDE AL CREDITO=`;
                    await sock.sendMessage(groupVerification, { text: ficha });
                }
                return;
            }

            // 2. Filtros de Estado
            if (cliente.estado === 'ESPERANDO_VERIFICACION') return; 

            if (cliente.estado === 'APTO_CREDITO' || cliente.estado === 'RECHAZADO') {
                if (cliente.historialChat.length > 0) {
                    const ultimoMsj = cliente.historialChat[cliente.historialChat.length - 1];
                    if (new Date() - new Date(ultimoMsj.fecha) < 60 * 60 * 1000) return;
                }
                if (cliente.estado === 'APTO_CREDITO') {
                    await sock.sendMessage(remoteJid, { text: "Un asesor comercial te llamará en breve. ¡Atento! 📱" });
                }
                return;
            }

            // 3. IA Conversacional
            if (cliente.estado === 'PENDIENTE' && /hola|info|interesa|quiero|si/i.test(textoUsuario)) {
                cliente.estado = 'INTERESADO';
            }

            cliente.historialChat.push({ rol: 'user', mensaje: textoUsuario });
            await sock.sendPresenceUpdate('composing', remoteJid);
            
            const respuestaIA = await generarRespuestaIA(textoUsuario, cliente.historialChat, cliente);
            await sock.sendMessage(remoteJid, { text: respuestaIA });
            
            cliente.historialChat.push({ rol: 'assistant', mensaje: respuestaIA });
            await cliente.save();

        } catch (err) {
            console.error('❌ ERROR FATAL:', err);
        }
    });
};

const procesarRespuestaAdmin = async (textoAdmin) => {
    try {
        const matchCelular = textoAdmin.match(/Celular:\s*\+?(\d+)/);
        const matchDecision = textoAdmin.match(/ACCEDE AL CREDITO=\s*(SI|NO)/i);

        if (!matchCelular || !matchDecision) return console.log('⚠️ Formato admin incorrecto.');

        const celular = matchCelular[1];
        const accedeCredito = matchDecision[1].toUpperCase();
        
        let cliente = await Cliente.findOne({ 
            $or: [
                { celular: { $regex: celular.slice(-8) + '$' } },
                { celularReal: { $regex: celular.slice(-8) + '$' } }
            ]
        });

        if (!cliente) return console.log('❌ Cliente no encontrado para respuesta admin');

        if (accedeCredito === 'SI') {
            cliente.estado = 'APTO_CREDITO';
            await cliente.save();
            await enviarMensajeTexto(cliente.celular, "✅ ¡Buenas noticias! SÍ accedes al crédito. Un asesor te llamará para la firma.");
            
            const numParaVentas = cliente.celularReal || cliente.celular;
            if (process.env.GROUP_SALES_ID) {
                await enviarMensajeTexto(process.env.GROUP_SALES_ID, `💰 *CLIENTE LISTO* 💰\n${cliente.nombres} ${cliente.apellidos}\nCel: +${numParaVentas}\nCédula: ${cliente.cedula}\n> ESCRIBILE`, true);
            }
        } else {
            cliente.estado = 'RECHAZADO';
            await cliente.save();
            await enviarMensajeTexto(cliente.celular, "Hola, lamentablemente no calificas para el crédito en este momento. Gracias.");
        }
    } catch (e) {
        console.error('Error Admin:', e);
    }
};

const enviarMensajeTexto = async (numero, texto, esGrupo = false) => {
    if (!sock) return false;
    try {
        let jid = numero;
        if (!esGrupo) {
             jid = numero.includes('@') ? numero : numero + '@s.whatsapp.net';
        }
        await sock.sendMessage(jid, { text: texto });
        return true;
    } catch { return false; }
};

const verificarChatsPendientes = async () => {
    if (!sock) return; 
    console.log('🔍 ESCANEANDO PENDIENTES...');

    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    const clientes = await Cliente.find({
        fechaCarga: { $gte: hoy },
        estado: { $in: ['CONTACTADO', 'INTERESADO'] } 
    });

    for (const cliente of clientes) {
        if (!cliente.historialChat || cliente.historialChat.length === 0) continue;
        const ultimo = cliente.historialChat[cliente.historialChat.length - 1];

        if (ultimo.rol === 'user') {
            console.log(`🚑 RECUPERANDO: ${cliente.nombres}`);
            const resp = await generarRespuestaIA(ultimo.mensaje, cliente.historialChat, cliente);
            await enviarMensajeTexto(cliente.celular, resp);
            
            cliente.historialChat.push({ rol: 'assistant', mensaje: resp });
            if (cliente.estado === 'CONTACTADO') cliente.estado = 'INTERESADO';
            await cliente.save();
        }
    }
};

const getQr = () => qrCodeUrl;
const getStatus = () => connectionStatus;

module.exports = { iniciarWhatsApp, enviarMensajeTexto, getQr, getStatus, verificarChatsPendientes };