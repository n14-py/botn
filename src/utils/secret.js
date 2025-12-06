// Herramienta para ocultar/leer datos invisibles en texto
// Usamos caracteres Zero-Width (Ancho Cero) que no se ven en WhatsApp

const ZERO_WIDTH_SPACE = '\u200B';
const ZERO_WIDTH_NON_JOINER = '\u200C';
const ZERO_WIDTH_JOINER = '\u200D'; // Usado como "paréntesis" de inicio/fin

const toBinary = (str) => {
    return str.split('').map(char => {
        return char.charCodeAt(0).toString(2).padStart(8, '0');
    }).join('');
};

const fromBinary = (str) => {
    return str.match(/.{1,8}/g).map(bin => {
        return String.fromCharCode(parseInt(bin, 2));
    }).join('');
};

// 🔒 OCULTAR: Convierte "12345" en caracteres invisibles
const ocultarDatos = (textoVisible, datosOcultos) => {
    const binario = toBinary(datosOcultos.toString());
    const invisible = binario.split('').map(b => 
        b === '1' ? ZERO_WIDTH_NON_JOINER : ZERO_WIDTH_SPACE
    ).join('');
    
    // Envolvemos en JOINERS para detectar dónde empieza y termina
    return `${textoVisible}${ZERO_WIDTH_JOINER}${invisible}${ZERO_WIDTH_JOINER}`;
};

// 🔓 REVELAR: Busca si hay algo oculto y lo devuelve
const revelarDatos = (textoConSecreto) => {
    if (!textoConSecreto) return null;

    // Buscamos el patrón entre los JOINERS (\u200D)
    const regex = /\u200D([\u200B\u200C]+)\u200D/;
    const match = textoConSecreto.match(regex);

    if (match && match[1]) {
        const binario = match[1].split('').map(char => 
            char === ZERO_WIDTH_NON_JOINER ? '1' : '0'
        ).join('');
        return fromBinary(binario);
    }
    return null;
};

module.exports = { ocultarDatos, revelarDatos };