const { default: makeWASocket, DisconnectReason, makeInMemoryStore, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const mongoose = require('mongoose');
const Cliente = require('../models/Cliente');
const { generarRespuestaIA } = require('./aiService');
const { useMongoDBAuthState } = require('./mongoAuthState');
const { revelarDatos } = require('../utils/secret'); 

// --- 1. CONFIGURACIÓN DE MEMORIA (EL "TRUCO" DE LA HERRAMIENTA) ---
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

const obtenerTextoCitado = (msg) => {
    if (!msg.message) return null;
    const mensajeReal = msg.message.ephemeralMessage?.message || msg.message.viewOnceMessage?.message || msg.message;
    const quoted = mensajeReal.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return null;
    return quoted.conversation || quoted.extendedTextMessage?.text || null;
};

// --- LÓGICA DE FUSIÓN DE CLIENTES (IMPORTANTE) ---
// Esto ocurre cuando un "Temporal" nos da una cédula que YA existía en la base de datos
const fusionarClientes = async (clienteTemporal, clienteReal, lid) => {
    console.log(`⚡ FUSIONANDO: Temporal (${clienteTemporal.cedula}) -> Real (${clienteReal.cedula})`);
    
    // 1. Pasamos el historial del temporal al real para no perder la charla
    if (clienteTemporal.historialChat && clienteTemporal.historialChat.length > 0) {
        clienteReal.historialChat.push(...clienteTemporal.historialChat);
    }

    // 2. Guardamos los datos de conexión en el real
    clienteReal.lid = lid;
    if (!clienteReal.celularReal) clienteReal.celularReal = clienteReal.celular; // Guardamos el 595 original
    clienteReal.celular = lid; // Actualizamos para poder responderle
    
    // 3. Actualizamos estado
    clienteReal.estado = 'ESPERANDO_VERIFICACION';
    clienteReal.cedulaProporcionada = clienteReal.cedula; // Confirmamos cédula

    await clienteReal.save();

    // 4. Borramos el temporal para no tener basura
    await Cliente.deleteOne({ _id: clienteTemporal._id });
    
    return clienteReal;
};

// --- IDENTIFICADOR SUPREMO ---
const identificarOcrearCliente = async (remoteJid, numeroEntrante, pushName, msg) => {
    console.log(`🕵️‍♂️ Procesando ID: ${numeroEntrante} (${pushName})...`);

    // 1. BUSCAR SI YA LO CONOCEMOS (Por LID o Celular)
    let cliente = await Cliente.findOne({ 
        $or: [
            { lid: numeroEntrante }, 
            { celular: { $regex: numeroEntrante + '$' } },
            // Si es un temporal que creamos hace un rato
            { cedula: `TEMP-${numeroEntrante}` } 
        ]
    });
    if (cliente) return cliente;

    // 2. EL TRUCO DE LA HERRAMIENTA (Agenda de Baileys)
    // Buscamos si WhatsApp ya sabe quién es este LID
    if (store && store.contacts) {
        const contacto = Object.values(store.contacts).find(c => c.id === remoteJid || c.lid === remoteJid); // Ajuste aquí para búsqueda exacta
        
        // A veces el ID real está en otra propiedad dependiendo de la versión de Baileys
        // Intentamos buscar cruces en la agenda
        if (contacto) {
           console.log("📒 Contacto encontrado en Store:", contacto);
           // Si el contacto tiene un 'id' que parece un número normal (sin @lid)
           const posibleNumero = contacto.id?.replace('@s.whatsapp.net', '').replace('@lid', '');
           if (posibleNumero && posibleNumero !== numeroEntrante) {
               console.log(`💡 Truco Agenda: LID ${numeroEntrante} es ${posibleNumero}`);
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

    // 3. MENSAJE SECRETO (Historial)
    if (store) {
        try {
            const historial = await store.loadMessages(remoteJid, 20);
            for (const m of historial.reverse()) {
                if (m.key.fromMe) {
                    const txt = obtenerTextoMensaje(m);
                    const secreto = revelarDatos(txt);
                    if (secreto) {
                        console.log(`💎 Secreto hallado: ${secreto}`);
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

    // 4. SI FALLA TODO -> CREAR CLIENTE TEMPORAL (Para seguir la charla)
    console.log(`👻 Usuario desconocido. Creando FICHA TEMPORAL para averiguar quién es.`);
    const nuevoTemporal = new Cliente({
        cedula: `TEMP-${numeroEntrante}`, // ID temporal único
        nombres: pushName || "Usuario WhatsApp",
        apellidos: "",
        celular: numeroEntrante,
        lid: numeroEntrante,
        estado: 'PENDIENTE', // Para que la IA le hable
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
        syncFullHistory: true, // Activamos full history para que el truco de la agenda funcione mejor
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

    // Escuchar actualizaciones de contactos (Para llenar la Agenda "Truco")
    sock.ev.on('contacts.upsert', (contacts) => {
        // Solo para debug, ver si llegan los datos
        // console.log(`📒 Sincronizados ${contacts.length} contactos`);
    });

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

            // GRUPO ADMIN
            if (remoteJid === process.env.GROUP_VERIFICATION_ID) {
                if (textoUsuario.includes("ACCEDE AL CREDITO=")) await procesarRespuestaAdmin(textoUsuario);
                return; 
            }

            // CHAT PRIVADO
            const esChatNormal = remoteJid.endsWith('@s.whatsapp.net');
            const esChatLid = remoteJid.endsWith('@lid');
            if (!esChatNormal && !esChatLid) return;

            let numeroEntrante = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0];

            // ============================================================
            // 🕵️‍♂️ IDENTIFICACIÓN O CREACIÓN
            // ============================================================
            let cliente = await identificarOcrearCliente(remoteJid, numeroEntrante, pushName, msg);

            console.log(`📨 Mensaje de: ${cliente.nombres} (${cliente.esTemporal ? 'TEMPORAL' : 'VERIFICADO'})`);

            // ============================================================
            // 🧠 LÓGICA DE CÉDULA (EL MOMENTO DE LA VERDAD)
            // ============================================================
            const matchCI = textoUsuario.match(/\b\d{1,3}(\.?\d{3}){1,2}\b/);
            
            if (matchCI) {
                const ciLimpia = matchCI[0].replace(/\./g, '');
                
                // Si es un cliente TEMPORAL y nos da su cédula, buscamos si existe la REAL
                if (cliente.esTemporal) {
                    const clienteReal = await Cliente.findOne({ cedula: ciLimpia });
                    
                    if (clienteReal) {
                        // ¡EXISTE! FUSIONAMOS TODO
                        cliente = await fusionarClientes(cliente, clienteReal, numeroEntrante);
                        await sock.sendMessage(remoteJid, { text: `✅ Gracias ${cliente.nombres}, te he identificado correctamente.` });
                    } else {
                        // ES NUEVO DE VERDAD. Lo convertimos en real.
                        cliente.cedula = ciLimpia;
                        cliente.esTemporal = false;
                        cliente.nombres = pushName || "Nuevo Cliente";
                        await cliente.save();
                    }
                }

                // PROCESO NORMAL DE VERIFICACIÓN
                if (cliente.estado !== 'RECHAZADO' && cliente.estado !== 'APTO_CREDITO') {
                    cliente.cedulaProporcionada = ciLimpia;
                    if (cliente.cedula.includes('PENDIENTE')) cliente.cedula = ciLimpia;
                    
                    cliente.estado = 'ESPERANDO_VERIFICACION';
                    await cliente.save();

                    await sock.sendMessage(remoteJid, { text: `✅ Recibido. Verificando calificación...` });
                    
                    if (process.env.GROUP_VERIFICATION_ID) {
                        const numMostrar = cliente.celularReal || cliente.celular;
                        await sock.sendMessage(process.env.GROUP_VERIFICATION_ID, { 
                            text: `⚠️ *VERIFICACIÓN* ⚠️\n👤 ${cliente.nombres}\n🪪 ${cliente.cedula}\n📱 +${numMostrar}\n\nACCEDE AL CREDITO=` 
                        });
                    }
                    return;
                }
            }

            // SI ESTÁ EN MODO TEMPORAL, LA IA DEBE PEDIR CÉDULA
            // (Esto ya lo hace tu aiService.js si el estado es PENDIENTE)
            
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
            
            // Enviar al destino correcto (LID o Normal)
            await sock.sendMessage(remoteJid, { text: respuestaIA });
            
            cliente.historialChat.push({ rol: 'assistant', mensaje: respuestaIA });
            await cliente.save();

        } catch (err) {
            console.error('❌ ERROR:', err);
        }
    });
};

const procesarRespuestaAdmin = async (textoAdmin) => {
    try {
        const matchCel = textoAdmin.match(/Celular:\s*\+?(\d+)/);
        const matchDec = textoAdmin.match(/ACCEDE AL CREDITO=\s*(SI|NO)/i);
        if (!matchCel || !matchDec) return;

        const celular = matchCel[1];
        const decision = matchDec[1].toUpperCase();
        
        // Buscamos por todos lados
        let cliente = await Cliente.findOne({ 
            $or: [
                { celular: { $regex: celular.slice(-8) + '$' } },
                { celularReal: { $regex: celular.slice(-8) + '$' } },
                { lid: celular }
            ]
        });

        if (!cliente) return console.log('❌ Cliente no encontrado (Admin)');

        // Preferimos responder al LID si existe (es más directo)
        const destino = cliente.lid || cliente.celular;

        if (decision === 'SI') {
            cliente.estado = 'APTO_CREDITO';
            await cliente.save();
            await enviarMensajeTexto(destino, "✅ ¡SÍ accedes al crédito! Un asesor te llamará.");
            
            if (process.env.GROUP_SALES_ID) {
                const numVentas = cliente.celularReal || cliente.celular;
                await enviarMensajeTexto(process.env.GROUP_SALES_ID, `💰 *CLIENTE LISTO* 💰\n${cliente.nombres}\nCel: +${numVentas}\nCédula: ${cliente.cedula}`, true);
            }
        } else {
            cliente.estado = 'RECHAZADO';
            await cliente.save();
            await enviarMensajeTexto(destino, "Lamentablemente no calificas por ahora. Gracias.");
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
            // Si no tiene formato de ID (no tiene @), asumimos whatsapp.net
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