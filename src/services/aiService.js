// Usamos fetch nativo de Node.js v20+

const generarRespuestaIA = async (mensajeUsuario, historial, cliente) => {
    try {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        const url = 'https://api.deepseek.com/chat/completions';

        // 🛑 PROTECCIÓN DE BUCLE 🛑
        // Si el cliente ya terminó el proceso, la IA no debe intervenir más
        if (cliente.estado === 'APTO_CREDITO' || cliente.estado === 'RECHAZADO') {
            return "Tu caso ya ha sido procesado. Un asesor humano te contactará si es necesario.";
        }
        
        if (cliente.estado === 'ESPERANDO_VERIFICACION') {
            return "Aguardame un momento, estamos verificando con el sistema si puedes acceder al crédito ⏳.";
        }

        // Obtener el nombre para personalizar
        const nombreCliente = cliente.nombres ? cliente.nombres.split(' ')[0] : 'Estimado/a';

        // 1. Lógica del Flujo de Conversación
        let instruccionesEspecificas = "";

        // CASO A: Fase Inicial (Saludo o Explicación)
        if (cliente.estado === 'CONTACTADO' || cliente.estado === 'PENDIENTE') {
            instruccionesEspecificas = `
                TU TAREA PRINCIPAL ES DETECTAR LA INTENCIÓN DEL CLIENTE ("${mensajeUsuario}"):

                1. SI ES SOLO UN SALUDO (Ej: "Hola", "Buenas", "Qué tal", "Hola Carolina"):
                   - IMPORTANTE: Debes sonar MUY AMABLE y REAL, como una persona que está de buen humor.
                   - VARÍA tu respuesta, no digas siempre lo mismo.
                   - Usa frases cálidas como:
                     * "¡Hola ${nombreCliente}! Espero que estés teniendo un día espectacular hoy ☀️."
                     * "¡Buenas ${nombreCliente}! Qué gusto saludarte, espero que tu jornada vaya súper bien."
                     * "Hola hola ${nombreCliente}, un placer. Espero que estés excelente."
                   - AL FINAL DE ESE SALUDO CÁLIDO, agrega una pregunta corta y suave: "¿Te gustaría que te comente un poco sobre la propuesta para el crédito?"

                2. SI PIDE INFO O MUESTRA INTERÉS (Ej: "Info", "Sí", "Cómo es", "Me interesa", "Quiero saber más"):
                   - AHORA SÍ, responde con la explicación del negocio:
                   "Le explico, nos encargamos de que usted acceda a un crédito en BNF. Si tiene operaciones morosas o demanda, nos encargamos de pagar para que quede limpio su nombre. Una vez que el crédito salga, nos devuelve el dinero invertido más el honorario del trabajo 🤗. ¿Me indica su número de cédula si le interesa la gestión?"
            `;
        } 
        // CASO B: Ya le explicamos pero no pasó cédula
        else if (cliente.estado === 'INTERESADO') {
            instruccionesEspecificas = `
                - El cliente sigue preguntando pero NO ha dado números.
                - Tu único objetivo es obtener la Cédula.
                - Responde con amabilidad pero firmeza sobre el requisito: "Entiendo, pero para poder confirmarte si calificas, necesito sí o sí tu número de Cédula de Identidad primero, por favor."
            `;
        } 

        // 2. Personalidad General
        const systemPrompt = `
            Eres Carolina Lopez, Asesora Financiera.
            Estás hablando con: ${nombreCliente}.
            
            Tu objetivo final: Conseguir el número de CÉDULA para verificar si ACCEDE AL CRÉDITO.
            
            Reglas de Personalidad:
            1. Eres una persona real, cálida y empática. NO suenes robótica.
            2. Te gusta usar emojis ocasionales para suavizar la charla (✨, ☀️, 🤗, 👋🏼).
            3. Si el usuario envía un número que parece cédula, agradécele y dile que espere un momento.

            INSTRUCCIONES DE COMPORTAMIENTO PARA ESTE MENSAJE ESPECÍFICO:
            ${instruccionesEspecificas}
        `;

        let messages = [{ role: "system", content: systemPrompt }];

        // Historial
        const historialReciente = historial.slice(-6);
        historialReciente.forEach(msg => {
            messages.push({
                role: msg.rol === 'user' ? 'user' : 'assistant',
                content: msg.mensaje
            });
        });
        messages.push({ role: "user", content: mensajeUsuario });

        // Petición DeepSeek
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: messages,
                temperature: 0.4, // Subí un poco la temperatura para que tenga más creatividad al saludar
                max_tokens: 350,
                stream: false
            })
        });

        const data = await response.json();
        
        if (!response.ok) return "Disculpa, tengo un poco de lentitud en el sistema. ¿Me podrías repetir?";

        return data.choices[0].message.content;

    } catch (error) {
        console.error("❌ Error IA:", error);
        return "Estoy teniendo problemas de señal, ¿me escribes en un ratito?";
    }
};

module.exports = { generarRespuestaIA };