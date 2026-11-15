// Normalização para comparação; os dados originais do produto são preservados.
function textoBase(valor) {
    if (!['string', 'number'].includes(typeof valor)) return null;
    if (typeof valor === 'number' && !Number.isFinite(valor)) return null;
    const texto = String(valor).normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/\s+/g, ' ');
    return !texto || /^(?:n\/a|na|null|undefined|nao informado|nao informada|desconhecido|desconhecida|-)$/.test(texto)
        ? null : texto;
}

const numero = texto => {
    const valor = Number(texto.replace(',', '.'));
    return Number.isFinite(valor) && valor > 0 ? String(valor) : null;
};

function normalizarAro(texto) {
    const medida = texto.match(/^(?:aro\s*)?(\d+(?:[.,]\d+)?)\s*(?:["″”]|pol\.?|polegadas?|in|inches)?$/);
    // Não deduz equivalências entre nomenclaturas (ex.: 700c e 29).
    return medida ? numero(medida[1]) : null;
}

function normalizarEixo(texto) {
    texto = texto.replace(/×/g, 'x')
        .replace(/milimetros?\b/g, 'mm').replace(/centimetros?\b/g, 'cm')
        .replace(/fecho rapido|quick[ -]?release/g, 'qr')
        .replace(/eixo passante|thru[ -]?axle|through[ -]?axle/g, 'thru-axle')
        .replace(/super[ -]?boost/g, 'superboost');
    const marcadores = [];
    texto = texto.replace(/\b(superboost|boost|qr|thru-axle)\b/g, marcador => {
        marcadores.push(marcador);
        return ' ';
    }).trim();
    if (marcadores.includes('qr') && marcadores.includes('thru-axle')) return null;
    const partes = texto.split(/\s*x\s*/);
    if (partes.length > 2) return null;
    const medidas = partes.map(parte => parte.trim().match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm)?$/));
    if (medidas.some(medida => !medida)) return null;
    const unidadeFinal = medidas.at(-1)[2];
    const padrao = medidas.map(medida => {
        const valor = numero(medida[1]);
        if (valor === null) return null;
        // Em "148 x 12 mm", a unidade final vale para as duas dimensões.
        const unidade = medida[2] || unidadeFinal;
        if (!unidade) return valor;
        return String(Number((Number(valor) * (unidade === 'cm' ? 10 : 1)).toFixed(8))) + 'mm';
    });
    if (padrao.includes(null)) return null;
    return padrao.join('x') + (marcadores.length ? ' ' + [...new Set(marcadores)].sort().join(' ') : '');
}

function normalizarSpec(valor, campo) {
    const texto = textoBase(valor);
    if (texto === null) return null;
    if (campo === 'aro') return normalizarAro(texto);
    if (campo === 'numero_coroas') {
        const medida = texto.match(/^(\d+)\s*(?:coroas?)?$/);
        return medida ? numero(medida[1]) : null;
    }
    if (campo === 'velocidades') {
        const medida = texto.match(/^(\d+)\s*(?:v|vel\.?|velocidades?|speed|speeds)?$/);
        return medida ? numero(medida[1]) : null;
    }
    if (campo === 'diametro_eixo') return normalizarEixo(texto);
    if (campo === 'padrao_freio') {
        const padrao = texto.replace(/^(?:freio\s+)?(?:a\s+)?(?:disco|disc|disk)(?:\s+brake)?\b/, 'disco')
            .replace(/^(?:freio\s+)?v[ -]?brake$/, 'v-brake')
            .replace(/\bhydraulic\b/g, 'hidraulico').replace(/\bmechanical\b/g, 'mecanico');
        return padrao;
    }
    return texto;
}

module.exports = normalizarSpec;
