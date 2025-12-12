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
let connectionStatus = 'disconnected'; // Estado inicial

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

    // 3. MENSAJE SECRETO (Detectar cédula oculta en mensajes anteriores)
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
                            console.log(`🕵️‍♂️ Identificado por Código Secreto: ${cliente.nombres}`);
                            cliente.lid = numeroEntrante;
                            cliente.celularReal = cliente.celular; // Guardamos el número que teníamos
                            cliente.celular = numeroEntrante; // Actualizamos al que usa ahora
                            await cliente.save();
                            return cliente;
                        }
                    }
                }
            }
        } catch(e) {}
    }

    // 4. CREAR TEMPORAL
    console.log(`👻 Usuario desconocido. Creando FICHA TEMPORAL para ${numeroEntrante}.`);
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

// --- INICIO DEL SOCKET ---
const iniciarWhatsApp = async () => {
    const collection = mongoose.connection.collection('sesion_whatsapp');
    const { state, saveCreds, clearCreds } = await useMongoDBAuthState(collection);
    console.log('🤖 Iniciando WhatsApp...');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        syncFullHistory: true, 
        // Aumentamos timeouts para conexiones lentas
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
    });

    if (store) store.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeUrl = await QRCode.toDataURL(qr);
            connectionStatus = 'qr_ready';
            console.log('⚡ ESCANEA EL QR AHORA (Nuevo QR generado)');
        }

        if (connection === 'close') {
            connectionStatus = 'disconnected';
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldLogout = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
            
            if (shouldLogout) {
                console.log(`🛑 Sesión cerrada o inválida. Reiniciando credenciales...`);
                await clearCreds(); 
                iniciarWhatsApp();
            } else {
                console.log('🔄 Conexión caída. Reconectando automáticamente...');
                iniciarWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WHATSAPP CONECTADO Y LISTO');
            connectionStatus = 'connected';
            qrCodeUrl = null;
            verificarChatsPendientes();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- MANEJO DE MENSAJES ENTRANTES ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const remoteJid = msg.key.remoteJid;
            const pushName = msg.pushName || ""; 
            const textoBruto = obtenerTextoMensaje(msg);
            const textoUsuario = textoBruto ? textoBruto.trim() : null;

            if (!textoUsuario) return;
            // Filtros anti-bot propio
            if (/horarios y días|gracias por comunicarte|agenda tu cita|mensaje automático|en breve/i.test(textoUsuario)) return;

            // --- LÓGICA DE ADMIN (RESPONDER APROBACIÓN DESDE GRUPO) ---
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

            console.log(`📨 Mensaje de: ${cliente.nombres} -> "${textoUsuario}"`);

            // --- DETECCIÓN DE CÉDULA ---
            const matchCI = textoUsuario.match(/\b\d{1,3}(\.?\d{3}){1,2}\b/);
            
            if (matchCI) {
                const ciLimpia = matchCI[0].replace(/\./g, '');
                
                // Si es temporal, intentamos fusionar con uno real
                if (cliente.esTemporal) {
                    const clienteReal = await Cliente.findOne({ cedula: ciLimpia });
                    
                    if (clienteReal) {
                        cliente = await fusionarClientes(cliente, clienteReal, numeroEntrante);
                        await sock.sendMessage(remoteJid, { text: `✅ Gracias ${cliente.nombres}, te he identificado correctamente.` });
                    } else {
                        // Si no existe, este temporal se convierte en el dueño de la cédula
                        cliente.cedula = ciLimpia;
                        cliente.esTemporal = false;
                        cliente.nombres = pushName || "Nuevo Cliente";
                        await cliente.save();
                    }
                }

                if (cliente.estado !== 'RECHAZADO' && cliente.estado !== 'APTO_CREDITO') {
                    cliente.cedulaProporcionada = ciLimpia;
                    if (cliente.cedula.includes('TEMP') || cliente.cedula.includes('PENDIENTE')) cliente.cedula = ciLimpia;
                    
                    cliente.estado = 'ESPERANDO_VERIFICACION';
                    await cliente.save();

                    await sock.sendMessage(remoteJid, { text: `✅ Recibido. Aguardame un momento, estamos verificando tu calificación en el sistema... ⏳` });
                    
                    // --- NOTIFICACIÓN AL GRUPO ---
                    if (process.env.GROUP_VERIFICATION_ID) {
                        const numMostrar = cliente.celularReal || cliente.celular;
                        await sock.sendMessage(process.env.GROUP_VERIFICATION_ID, { 
                            text: `⚠️ *VERIFICACIÓN* ⚠️\n👤 ${cliente.nombres}\n🪪 ${cliente.cedula}\n📱 +${numMostrar}\n\n👇 COPIA Y RESPONDE 👇\n\nACCEDE AL CREDITO= \nHASTA GS:` 
                        });
                    }
                    return;
                }
            }

            // Evitar spam si ya está en proceso
            if (cliente.estado === 'ESPERANDO_VERIFICACION') return; 

            if (cliente.estado === 'APTO_CREDITO' || cliente.estado === 'RECHAZADO') {
                // Solo respondemos si pasó más de 1 hora desde el último mensaje para no ser molestos
                if (cliente.historialChat.length > 0) {
                    const ultimo = cliente.historialChat[cliente.historialChat.length - 1];
                    if (new Date() - new Date(ultimo.fecha) < 3600000) return;
                }
                if (cliente.estado === 'APTO_CREDITO') await sock.sendMessage(remoteJid, { text: "Un asesor te contactará pronto para finalizar tu gestión. 📱" });
                return;
            }

            // Si estaba pendiente y habla, ahora está interesado
            if (cliente.estado === 'PENDIENTE' && /hola|info|interesa|quiero|si/i.test(textoUsuario)) {
                cliente.estado = 'INTERESADO';
            }

            // --- IA RESPUESTA ---
            cliente.historialChat.push({ rol: 'user', mensaje: textoUsuario });
            await sock.sendPresenceUpdate('composing', remoteJid);
            
            const respuestaIA = await generarRespuestaIA(textoUsuario, cliente.historialChat, cliente);
            
            await sock.sendMessage(remoteJid, { text: respuestaIA });
            
            cliente.historialChat.push({ rol: 'assistant', mensaje: respuestaIA });
            await cliente.save();

        } catch (err) {
            console.error('❌ ERROR procesando mensaje:', err);
        }
    });
};

// --- PROCESAR RESPUESTA DEL ADMIN (SI/NO) ---
const procesarRespuestaAdmin = async (textoAdmin) => {
    try {
        const matchCel = textoAdmin.match(/Celular:\s*\+?(\d+)/) || textoAdmin.match(/📱 \+(\d+)/);
        const matchDec = textoAdmin.match(/ACCEDE AL CREDITO=\s*(SI|NO)/i);
        const matchMonto = textoAdmin.match(/HASTA GS:?\s*([0-9\.]+)/i);

        if (!matchCel || !matchDec) return;

        const celular = matchCel[1];
        const decision = matchDec[1].toUpperCase();
        const montoRaw = matchMonto ? matchMonto[1].replace(/\./g, '') : '0';
        
        let cliente = await Cliente.findOne({ 
            $or: [
                { celular: { $regex: celular.slice(-8) + '$' } },
                { celularReal: { $regex: celular.slice(-8) + '$' } },
                { lid: celular }
            ]
        });

        if (!cliente) return console.log('❌ Cliente no encontrado (Admin)');

        // Usamos LID si existe, sino celular
        const destino = cliente.lid || cliente.celular;

        if (decision === 'SI') {
            cliente.estado = 'APTO_CREDITO';
            cliente.montoAprobado = montoRaw;
            await cliente.save();
            
            await enviarMensajeTexto(destino, `✅ ¡FELICIDADES! SÍ accedes al crédito. Tienes aprobado hasta Gs. ${parseInt(montoRaw).toLocaleString('es-PY')}. Un asesor te escribirá enseguida para desembolsar.`);
            
            if (process.env.GROUP_SALES_ID) {
                const numVentas = cliente.celularReal || cliente.celular;
                await enviarMensajeTexto(process.env.GROUP_SALES_ID, `💰 *CLIENTE LISTO* 💰\n${cliente.nombres}\nCel: +${numVentas}\nCédula: ${cliente.cedula}\nAprobado: Gs. ${montoRaw}`, true);
            }
        } else {
            cliente.estado = 'RECHAZADO';
            await cliente.save();
            await enviarMensajeTexto(destino, "Lamentablemente el sistema indica que no calificas en este momento. Gracias por tu consulta.");
        }
    } catch (e) {
        console.error('Error Admin:', e);
    }
};

// --- ENVÍO DE MENSAJES (MEJORADO Y BLINDADO) ---
const enviarMensajeTexto = async (numero, texto, esGrupo = false) => {
    if (!sock) {
        console.log('❌ ERROR CRÍTICO: Socket no inicializado. No se puede enviar.');
        return false;
    }
    try {
        let jid = numero;
        
        if (!esGrupo) {
            // 🔥 DOBLE SEGURIDAD DE FORMATO 595 🔥
            // Si llega 0981... lo convertimos a 595981...
            if (jid.startsWith('09')) {
                jid = '595' + jid.substring(1);
            } 
            // Si llega 981... (9 digitos) le falta el 595
            else if (jid.length === 9 && jid.startsWith('9')) {
                jid = '595' + jid;
            }

            // Añadimos el sufijo si falta
            if (!jid.includes('@')) jid = jid + '@s.whatsapp.net';
        }
        
        await sock.sendMessage(jid, { text: texto });
        return true;
    } catch (e) { 
        console.error(`⚠️ Error enviando a ${numero}:`, e.message);
        return false; 
    }
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