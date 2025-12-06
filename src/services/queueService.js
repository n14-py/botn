const Cliente = require('../models/Cliente');
const Config = require('../models/Config'); // Importamos la configuración
const { enviarMensajeTexto } = require('./whatsappService');
const { ocultarDatos } = require('../utils/secret'); // <--- NUEVA IMPORTACIÓN (EL CÓDIGO INVISIBLE)

let procesando = false;

// Genera una espera aleatoria (Anti-Ban)
const generarDelayAleatorio = (minMinutos, maxMinutos) => {
    const minMs = minMinutos * 60 * 1000;
    const maxMs = maxMinutos * 60 * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
};

// Función auxiliar para obtener la config o crearla si no existe
const obtenerConfiguracion = async () => {
    let config = await Config.findOne({ clave: 'general' });
    if (!config) {
        config = new Config({ clave: 'general' });
        await config.save();
    }
    return config;
};

// MOTOR DE ENVÍO MASIVO
const procesarCola = async () => {
    if (procesando) return; 
    procesando = true;

    console.log('🔄 Iniciando procesador de cola (Modo Controlado)...');

    const loop = async () => {
        try {
            // 1. CARGAR REGLAS DEL ADMIN
            const config = await obtenerConfiguracion();
            const ahora = new Date();
            const horaActual = ahora.getHours();

            // --- REGLA A: RESETEO DIARIO ---
            // Si la fecha guardada no es hoy (día/mes/año), reseteamos el contador
            const fechaGuardada = new Date(config.fechaUltimoReseteo);
            const esMismoDia = fechaGuardada.getDate() === ahora.getDate() &&
                               fechaGuardada.getMonth() === ahora.getMonth() &&
                               fechaGuardada.getFullYear() === ahora.getFullYear();

            if (!esMismoDia) {
                console.log('📅 Nuevo día detectado. Reseteando contador de envíos a 0.');
                config.mensajesEnviadosHoy = 0;
                config.fechaUltimoReseteo = new Date(); // Importante: resetear fecha también para evitar bucles
                await config.save();
            }

            // --- REGLA B: HORARIO LABORAL ---
            if (horaActual < config.horaInicio || horaActual >= config.horaFin) {
                console.log(`💤 Fuera de horario laboral (${config.horaInicio}:00 - ${config.horaFin}:00). Pausando 30 min...`);
                procesando = false;
                setTimeout(procesarCola, 30 * 60 * 1000); // Revisar en 30 min
                return;
            }

            // --- REGLA C: LÍMITE DIARIO ---
            if (config.mensajesEnviadosHoy >= config.limiteDiario) {
                console.log(`Cb Límite diario alcanzado (${config.mensajesEnviadosHoy}/${config.limiteDiario}). Pausando hasta mañana...`);
                procesando = false;
                setTimeout(procesarCola, 60 * 60 * 1000); // Revisar en 1 hora
                return;
            }

            // 2. BUSCAR CLIENTE PENDIENTE
            const cliente = await Cliente.findOne({ estado: 'PENDIENTE' }).sort({ fechaCarga: 1 });

            if (!cliente) {
                console.log('💤 No hay clientes pendientes. Revisando en 1 min...');
                procesando = false;
                setTimeout(procesarCola, 60000); 
                return;
            }

            if (!cliente.celular) {
                console.log(`⚠️ Cliente ${cliente._id} sin celular. Marcando error.`);
                cliente.estado = 'RECHAZADO';
                await cliente.save();
                setImmediate(loop);
                return;
            }

            // Usamos solo el primer nombre
            const primerNombre = cliente.nombres ? cliente.nombres.split(' ')[0] : 'Estimado/a';

            // 3. SISTEMA DE 20 VARIACIONES (Mismo formato, ligeros cambios anti-spam)
            const variaciones = [
                // 1. Original
                `Buenos dias ${primerNombre}, 👋🏼👋🏼📣📣
Me comunico 📊📉📈 en relación a una excelente propuesta que quiero ofrecerle.
A fin de ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a me da retorno para brindarle mayores detalles y nuestro método de trabajo. (igual si contas con operación morosa en inforcomf) Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 2. Variación "Con el objetivo"
                `Buen día ${primerNombre} 👋🏼📣.
Le escribo 📊📉📈 con respecto a una excelente propuesta para usted.
Con el objetivo de ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, logrando así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si está interesado/a, aguardo su retorno para darle mayores detalles y nuestro método de trabajo. (Aplica igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 3. Variación "La meta es"
                `Hola ${primerNombre}, 👋🏼👋🏼📣
Me pongo en contacto 📊📉📈 para acercarle una excelente propuesta.
La meta es ayudarle a cancelar sus operaciones crediticias y levantar su calificación, para que pueda acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso de interés me da retorno para explicarle mayores detalles y nuestro método de trabajo. (Válido igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 4. Variación "Para que logre"
                `Saludos ${primerNombre} 👋🏼📣📣.
Me comunico 📊📉📈 referente a una excelente propuesta que quiero ofrecerle hoy.
Para que logre cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito nuevo con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si le interesa me da retorno para brindarle todos los detalles y nuestro método de trabajo. (Incluso si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 5. Variación "Propuesta vigente"
                `Buenos dias ${primerNombre} 👋🏼👋🏼.
Le contacto 📊📉📈 por una excelente propuesta vigente para usted.
Buscamos ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, accediendo así a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a espero su retorno para brindarle mayores detalles y nuestro método de trabajo. (Igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 6. Variación "Intención"
                `Buen día ${primerNombre}, 👋🏼📣📣
Me comunico 📊📉📈 con una excelente propuesta que quiero ofrecerle.
Nuestra intención es ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, para así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si está interesado/a me da un retorno para brindarle mayores detalles y nuestro método de trabajo. (Aceptamos igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 7. Variación "Oportunidad"
                `Hola ${primerNombre} 👋🏼👋🏼📣.
Le escribo 📊📉📈 en relación a una excelente oportunidad para usted.
A fin de ayudarle a cancelar sus operaciones crediticias y limpiar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que le interese me da retorno para darle mayores detalles y nuestro método de trabajo. (Es válido igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 8. Variación "Solución"
                `Saludos ${primerNombre} 👋🏼📣.
Me pongo en contacto 📊📉📈 con una excelente solución financiera que quiero ofrecerle.
Para ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, y de esa forma acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si está interesado/a aguardo su retorno para brindarle mayores detalles y nuestro método de trabajo. (Aplica igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 9. Variación "Plan"
                `Buenos dias ${primerNombre}, 👋🏼👋🏼📣📣
Me comunico 📊📉📈 sobre una excelente propuesta que tenemos para ofrecerle.
Con el plan de ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a me da retorno para comentarle mayores detalles y nuestro método de trabajo. (Igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 10. Variación "Gestión"
                `Buen día ${primerNombre} 👋🏼📣📣.
Le escribo 📊📉📈 referente a una excelente gestión que quiero ofrecerle.
El fin es ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, logrando acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si le interesa me da retorno para brindarle mayores detalles y nuestro método de trabajo. (Válido igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 11. Variación "Alternativa"
                `Hola ${primerNombre}, 👋🏼👋🏼
Me comunico 📊📉📈 para presentarle una excelente propuesta.
Queremos ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a me da retorno para explicarle mayores detalles y nuestro método de trabajo. (Incluso si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 12. Variación "Beneficio"
                `Saludos ${primerNombre} 👋🏼📣.
Le contacto 📊📉📈 en relación a una excelente propuesta de beneficio para usted.
A fin de ayudarle a cancelar todas sus operaciones crediticias y mejorar su calificación, para poder acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si está interesado/a espero su retorno para brindarle mayores detalles y nuestro método de trabajo. (Igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 13. Variación "Iniciativa"
                `Buenos dias ${primerNombre} 👋🏼👋🏼📣.
Me comunico 📊📉📈 con una excelente iniciativa que quiero ofrecerle.
Para ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, logrando así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a me da retorno para darle mayores detalles y nuestro método de trabajo. (Aceptamos igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 14. Variación "Proyecto"
                `Buen día ${primerNombre}, 👋🏼📣📣
Le escribo 📊📉📈 respecto a una excelente propuesta que quiero ofrecerle.
Con la misión de ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si le interesa me da retorno para brindarle mayores detalles y nuestro método de trabajo. (Válido igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 15. Variación "Opción"
                `Hola ${primerNombre} 👋🏼👋🏼.
Me pongo en contacto 📊📉📈 por una excelente opción que quiero ofrecerle.
A fin de ayudarle a cancelar sus operaciones crediticias y recuperar su calificación, para acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a aguardo su retorno para brindarle mayores detalles y nuestro método de trabajo. (Aplica igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 16. Variación "Servicio"
                `Saludos ${primerNombre} 👋🏼📣.
Me comunico 📊📉📈 para ofrecerle una excelente propuesta de servicio.
Buscamos ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si está interesado/a me da retorno para explicarle mayores detalles y nuestro método de trabajo. (Igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 17. Variación "Posibilidad"
                `Buenos dias ${primerNombre}, 👋🏼👋🏼📣📣
Le contacto 📊📉📈 en relación a una excelente posibilidad que quiero ofrecerle.
El objetivo es ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, logrando acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a me da retorno para darle mayores detalles y nuestro método de trabajo. (Incluso si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 18. Variación "Ayuda Financiera"
                `Buen día ${primerNombre} 👋🏼📣.
Me comunico 📊📉📈 con una excelente propuesta de ayuda que quiero ofrecerle.
A fin de ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, para así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si le interesa me da retorno para brindarle mayores detalles y nuestro método de trabajo. (Válido igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 19. Variación "Reestructuración"
                `Hola ${primerNombre}, 👋🏼👋🏼📣
Le escribo 📊📉📈 referente a una excelente propuesta de reestructuración que quiero ofrecerle.
Para ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, pudiendo así acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
En caso que este interesado/a espero su retorno para comentarle mayores detalles y nuestro método de trabajo. (Igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`,

                // 20. Variación "Final"
                `Saludos ${primerNombre} 👋🏼📣📣.
Me pongo en contacto 📊📉📈 en relación a una excelente propuesta que quiero ofrecerle hoy.
Con el fin de ayudarle a cancelar sus operaciones crediticias y mejorar su calificación, logrando acceder a un crédito con el BANCO NACIONAL DE FOMENTO y llevar dinero en efectivo 💵💵💶‼️
Si está interesado/a me da retorno para brindarle mayores detalles y nuestro método de trabajo. (Aceptamos igual si contas con operación morosa en inforcomf). Solo habilitado a las personas que cobren por bnf.
Atte
Carolina Lopez
Analista Financiero`
            ];

            // Elegimos una al azar
            const mensajeFinal = variaciones[Math.floor(Math.random() * variaciones.length)];

            // 🔥 AQUÍ ESTÁ LA MODIFICACIÓN CLAVE: INYECTAMOS LA CÉDULA OCULTA 🔥
            const mensajeConSecreto = ocultarDatos(mensajeFinal, cliente.cedula);

            // 4. INTENTAR ENVÍO
            console.log(`📤 Enviando a ${primerNombre} (${cliente.celular})... Progreso: ${config.mensajesEnviadosHoy + 1}/${config.limiteDiario}`);
            
            // Enviamos el mensaje con el secreto invisible
            const enviado = await enviarMensajeTexto(cliente.celular, mensajeConSecreto);

            if (enviado) {
                cliente.estado = 'CONTACTADO';
                await cliente.save();

                // --- ACTUALIZAR CONTADOR ---
                config.mensajesEnviadosHoy += 1;
                await config.save(); // Guardamos el nuevo conteo

                // Delay aleatorio (Entre 3 y 6 minutos)
                const tiempoEspera = generarDelayAleatorio(3, 6); 
                console.log(`⏳ Esperando ${(tiempoEspera/1000/60).toFixed(1)} minutos para el siguiente...`);
                setTimeout(loop, tiempoEspera);
            } else {
                console.log(`⚠️ Falló envío a ${cliente.celular}.`);
                cliente.estado = 'RECHAZADO'; 
                await cliente.save();
                setTimeout(loop, 10000); 
            }

        } catch (error) {
            console.error('❌ Error en el loop de la cola:', error);
            setTimeout(loop, 60000);
        }
    };

    loop();
};

module.exports = { procesarCola };