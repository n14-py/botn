const { default: makeWASocket, DisconnectReason, makeInMemoryStore, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const mongoose = require('mongoose');
const Cliente = require('../models/Cliente');
const { generarRespuestaIA } = require('./aiService');
const { useMongoDBAuthState } = require('./mongoAuthState');
const { revelarDatos } = require('../utils/secret'); 

// --- 1. CONFIGURACIÓN DE MEMORIA ---
const baileys = require('@whiskeysockets/baileys');
const makeStore = baileys.makeInMemoryStore || baileys.default?.makeInMemoryStore;
const store = makeStore ? makeStore({ 
    logger: pino().child({ level: 'silent', stream: 'store' }) 
}) : null;

let sock;
let qrCodeUrl = null;
let connectionStatus = 'disconnected';

// --- HELPERS ---
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

// --- LÓGICA DE FUSIÓN DE CLIENTES ---
const fusionarClientes = async (clienteTemporal, clienteReal, lid) => {
    console.log(`⚡ FUSIONANDO: Temporal (${clienteTemporal.cedula}) -> Real (${clienteReal.cedula})`);
    
    if (clienteTemporal.historialChat && clienteTemporal.historialChat.length > 0) {
        clienteReal.historialChat.push(...clienteTemporal.historialChat);
    }

    clienteReal.lid = lid;
    if (!clienteReal.celularReal) clienteReal.celularReal = clienteReal.celular; 
    clienteReal.celular = lid; 
    
    clienteReal.estado = 'ESPERANDO_VERIFICACION';
    clienteReal.cedulaProporcionada = clienteReal.cedula; 

    await clienteReal.save();
    await Cliente.deleteOne({ _id: clienteTemporal._id });
    
    return clienteReal;
};

// --- IDENTIFICADOR SUPREMO ---
const identificarOcrearCliente = async (remoteJid, numeroEntrante, pushName, msg) => {
    console.log(`🕵️‍♂️ Procesando ID: ${numeroEntrante} (${pushName})...`);

    // 1. BUSCAR SI YA LO CONOCEMOS
    let cliente = await Cliente.findOne({ 
        $or: [
            { lid: numeroEntrante }, 
            { celular: { $regex: numeroEntrante + '$' } },
            { cedula: `TEMP-${numeroEntrante}` } 
        ]
    });
    if (cliente) return cliente;

    // 2. TRUCO DE LA AGENDA
    if (store && store.contacts) {
        const contacto = Object.values(store.contacts).find(c => c.id === remoteJid || c.lid === remoteJid);
        if (contacto) {
           const posibleNumero = contacto.id?.replace('@s.whatsapp.net', '').replace('@lid', '');
           if (posibleNumero && posibleNumero !== numeroEntrante) {
               cliente = await Cliente.findOne({ celular: { $regex: posibleNumero + '$' } });
               if (cliente) {
                   cliente.lid = numeroEntrante;
                   cliente.celularReal = cliente.celular;
                   cliente.celular = numeroEntrante;
                   await cliente.save();
                   return cliente;
               }
           }
        }
    }

    // 3. MENSAJE SECRETO
    if (store) {
        try {
            const historial = await store.loadMessages(remoteJid, 20);
            for (const m of historial.reverse()) {
                if (m.key.fromMe) {
                    const txt = obtenerTextoMensaje(m);
                    const secreto = revelarDatos(txt);
                    if (secreto) {
                        cliente = await Cliente.findOne({ cedula: secreto });
                        if (cliente) {
                            cliente.lid = numeroEntrante;
                            cliente.celularReal = cliente.celular;
                            cliente.celular = numeroEntrante;
                            await cliente.save();
                            return cliente;
                        }
                    }
                }
            }
        } catch(e) {}
    }

    // 4. CREAR TEMPORAL
    console.log(`👻 Usuario desconocido. Creando FICHA TEMPORAL.`);
    const nuevoTemporal = new Cliente({
        cedula: `TEMP-${numeroEntrante}`, 
        nombres: pushName || "Usuario WhatsApp",
        apellidos: "",
        celular: numeroEntrante,
        lid: numeroEntrante,
        estado: 'PENDIENTE', 
        esTemporal: true
    });
    await nuevoTemporal.save();
    return nuevoTemporal;
};

const iniciarWhatsApp = async () => {
    const collection = mongoose.connection.collection('sesion_whatsapp');
    const { state, saveCreds, clearCreds } = await useMongoDBAuthState(collection);
    console.log('🤖 Iniciando WhatsApp...');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        syncFullHistory: true, 
    });

    if (store) store.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeUrl = await QRCode.toDataURL(qr);
            connectionStatus = 'qr_ready';
            console.log('⚡ ESCANEA EL QR AHORA');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldLogout = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
            
            if (shouldLogout) {
                console.log(`🛑 Sesión cerrada. Reiniciando...`);
                await clearCreds(); 
                iniciarWhatsApp();
            } else {
                console.log('🔄 Reconectando...');
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
            const textoBruto = obtenerTextoMensaje(msg);
            const textoUsuario = textoBruto ? textoBruto.trim() : null;

            if (!textoUsuario) return;
            if (/horarios y días|gracias por comunicarte|agenda tu cita|mensaje automático|en breve/i.test(textoUsuario)) return;

            // --- LÓGICA DE ADMIN (RESPONDER APROBACIÓN) ---
            if (remoteJid === process.env.GROUP_VERIFICATION_ID) {
                if (textoUsuario.includes("ACCEDE AL CREDITO=")) await procesarRespuestaAdmin(textoUsuario);
                return; 
            }

            // CHAT PRIVADO
            const esChatNormal = remoteJid.endsWith('@s.whatsapp.net');
            const esChatLid = remoteJid.endsWith('@lid');
            if (!esChatNormal && !esChatLid) return;

            let numeroEntrante = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];

            let cliente = await identificarOcrearCliente(remoteJid, numeroEntrante, pushName, msg);

            console.log(`📨 Mensaje de: ${cliente.nombres} (${cliente.esTemporal ? 'TEMPORAL' : 'VERIFICADO'})`);

            // --- DETECCIÓN DE CÉDULA ---
            const matchCI = textoUsuario.match(/\b\d{1,3}(\.?\d{3}){1,2}\b/);
            
            if (matchCI) {
                const ciLimpia = matchCI[0].replace(/\./g, '');
                
                if (cliente.esTemporal) {
                    const clienteReal = await Cliente.findOne({ cedula: ciLimpia });
                    
                    if (clienteReal) {
                        cliente = await fusionarClientes(cliente, clienteReal, numeroEntrante);
                        await sock.sendMessage(remoteJid, { text: `✅ Gracias ${cliente.nombres}, te he identificado correctamente.` });
                    } else {
                        cliente.cedula = ciLimpia;
                        cliente.esTemporal = false;
                        cliente.nombres = pushName || "Nuevo Cliente";
                        await cliente.save();
                    }
                }

                if (cliente.estado !== 'RECHAZADO' && cliente.estado !== 'APTO_CREDITO') {
                    cliente.cedulaProporcionada = ciLimpia;
                    if (cliente.cedula.includes('PENDIENTE')) cliente.cedula = ciLimpia;
                    
                    cliente.estado = 'ESPERANDO_VERIFICACION';
                    await cliente.save();

                    await sock.sendMessage(remoteJid, { text: `✅ Recibido. Verificando calificación...` });
                    
                    // --- NOTIFICACIÓN AL GRUPO CON FORMATO DE RESPUESTA ---
                    if (process.env.GROUP_VERIFICATION_ID) {
                        const numMostrar = cliente.celularReal || cliente.celular;
                        // Aquí preparamos el texto para que tú solo tengas que copiar, pegar y llenar
                        await sock.sendMessage(process.env.GROUP_VERIFICATION_ID, { 
                            text: `⚠️ *VERIFICACIÓN* ⚠️\n👤 ${cliente.nombres}\n🪪 ${cliente.cedula}\n📱 +${numMostrar}\n\n👇 COPIA Y RESPONDE 👇\n\nACCEDE AL CREDITO= \nHASTA GS:` 
                        });
                    }
                    return;
                }
            }

            if (cliente.estado === 'ESPERANDO_VERIFICACION') return; 

            if (cliente.estado === 'APTO_CREDITO' || cliente.estado === 'RECHAZADO') {
                if (cliente.historialChat.length > 0) {
                    const ultimo = cliente.historialChat[cliente.historialChat.length - 1];
                    if (new Date() - new Date(ultimo.fecha) < 3600000) return;
                }
                if (cliente.estado === 'APTO_CREDITO') await sock.sendMessage(remoteJid, { text: "Un asesor te contactará pronto. 📱" });
                return;
            }

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
            console.error('❌ ERROR:', err);
        }
    });
};

// --- FUNCIÓN MEJORADA PARA LEER TU RESPUESTA EN EL GRUPO ---
const procesarRespuestaAdmin = async (textoAdmin) => {
    try {
        // 1. Detectar celular (para saber a qué cliente te refieres)
        const matchCel = textoAdmin.match(/Celular:\s*\+?(\d+)/) || textoAdmin.match(/📱 \+(\d+)/);
        // 2. Detectar decisión (SI o NO)
        const matchDec = textoAdmin.match(/ACCEDE AL CREDITO=\s*(SI|NO)/i);
        // 3. Detectar monto (HASTA GS: 5.000.000)
        const matchMonto = textoAdmin.match(/HASTA GS:?\s*([0-9\.]+)/i);

        if (!matchCel || !matchDec) return;

        const celular = matchCel[1];
        const decision = matchDec[1].toUpperCase();
        const montoRaw = matchMonto ? matchMonto[1].replace(/\./g, '') : '0'; // Limpiamos los puntos
        
        let cliente = await Cliente.findOne({ 
            $or: [
                { celular: { $regex: celular.slice(-8) + '$' } },
                { celularReal: { $regex: celular.slice(-8) + '$' } },
                { lid: celular }
            ]
        });

        if (!cliente) return console.log('❌ Cliente no encontrado (Admin)');

        const destino = cliente.lid || cliente.celular;

        if (decision === 'SI') {
            cliente.estado = 'APTO_CREDITO';
            cliente.montoAprobado = montoRaw; // Guardamos el monto que pusiste en WhatsApp
            await cliente.save();
            
            await enviarMensajeTexto(destino, `✅ ¡SÍ accedes al crédito! Tienes aprobado hasta Gs. ${parseInt(montoRaw).toLocaleString('es-PY')}. Un asesor te contactara en breve.`);
            
            if (process.env.GROUP_SALES_ID) {
                const numVentas = cliente.celularReal || cliente.celular;
                await enviarMensajeTexto(process.env.GROUP_SALES_ID, `💰 *CLIENTE LISTO* 💰\n${cliente.nombres}\nCel: +${numVentas}\nCédula: ${cliente.cedula}\nAprobado: Gs. ${montoRaw}`, true);
            }
        } else {
            cliente.estado = 'RECHAZADO';
            await cliente.save();
            await enviarMensajeTexto(destino, "Lamentablemente no calificas por ahora para el crédito. Gracias por contactar.");
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
            if (!numero.includes('@')) jid = numero + '@s.whatsapp.net';
        }
        await sock.sendMessage(jid, { text: texto });
        return true;
    } catch { return false; }
};

const verificarChatsPendientes = async () => {
    if (!sock) return; 
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const clientes = await Cliente.find({
        fechaCarga: { $gte: hoy },
        estado: { $in: ['CONTACTADO', 'INTERESADO'] } 
    });

    for (const cliente of clientes) {
        if (!cliente.historialChat?.length) continue;
        const ultimo = cliente.historialChat[cliente.historialChat.length - 1];
        if (ultimo.rol === 'user') {
            const resp = await generarRespuestaIA(ultimo.mensaje, cliente.historialChat, cliente);
            const destino = cliente.lid || cliente.celular;
            await enviarMensajeTexto(destino, resp);
            cliente.historialChat.push({ rol: 'assistant', mensaje: resp });
            await cliente.save();
        }
    }
};

const getQr = () => qrCodeUrl;
const getStatus = () => connectionStatus;

module.exports = { iniciarWhatsApp, enviarMensajeTexto, getQr, getStatus, verificarChatsPendientes };