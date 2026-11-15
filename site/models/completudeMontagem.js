const normalizarSpec = require('./normalizarSpec');

const TIPOS_MONTAGEM = ['com-marchas', 'single-speed', 'suspensao-total'];
const tipoValido = tipo => TIPOS_MONTAGEM.includes(tipo);

function avaliarCompletude(pecas, tipo = 'com-marchas') {
    if (!tipoValido(tipo)) throw new Error('Tipo de montagem inválido.');
    const requisitos = [];
    const confirmar = [];
    const slug = p => p.subcategoria || p.categoria;
    function posicao(p) {
        if (/-dianteir[ao](?:-|$)/.test(slug(p) || '')) return 'dianteira';
        if (/-traseir[ao](?:-|$)/.test(slug(p) || '')) return 'traseira';
        return p.posicao || null;
    }
    function tem(categorias, lado) {
        return pecas.some(p => {
            const inclui = Array.isArray(p.specs?.componentes_inclusos) ? p.specs.componentes_inclusos : [];
            const atende = categorias.includes(slug(p)) || categorias.some(c => inclui.includes(c));
            return atende && (!lado || posicao(p) === lado || p.specs?.vendido_em_par === true);
        });
    }
    function exigir(chave, nome, atendido) {
        requisitos.push({ chave, nome, atendido: !!atendido });
    }
    for (const [categoria, nome] of [
        ['quadro', 'Quadro'], ['quadro-garfo', 'Garfo ou suspensão dianteira'], ['direcao', 'Caixa de direção'],
        ['guidao', 'Guidão'], ['guidao-avanco', 'Avanço/mesa'], ['selim', 'Selim'],
        ['selim-canote', 'Canote'], ['pedivela', 'Pedivela'], ['pedivela-movimento-central', 'Movimento central'],
        ['pedal', 'Pedais'], ['corrente', 'Corrente']
    ]) exigir(categoria, nome, tem(categoria === 'pedal' ? ['pedal', 'outros-pedal'] : [categoria]));
    exigir('apoio-maos', 'Manoplas ou fita de guidão', tem(['guidao-manoplas', 'guidao-fita']));

    for (const lado of ['dianteira', 'traseira']) {
        const sufixo = lado === 'dianteira' ? 'dianteiro' : 'traseiro';
        const rodaCompleta = tem(['rodas', 'rodas-' + lado], lado);
        const avulsas = [tem(['rodas-aro'], lado), tem(['rodas-raio'], lado), tem(['rodas-cubo', 'rodas-cubo-' + sufixo], lado)];
        exigir('roda-' + lado, 'Roda ' + lado + ' completa ou aro, cubo e raios', rodaCompleta || avulsas.every(Boolean));
        exigir('pneu-' + lado, 'Pneu ' + lado, tem(['pneus'], lado));
        exigir('fixacao-' + lado, 'Fixação da roda ' + lado, tem(['fixacao-roda', 'fixacao-roda-' + sufixo], lado));
        exigir('freio-' + lado, 'Conjunto de freio ' + sufixo,
            tem(['freios', 'freios-' + sufixo], lado));
        const pneu = pecas.find(p => slug(p) === 'pneus' && (posicao(p) === lado || p.specs?.vendido_em_par === true));
        if (pneu?.specs?.tubeless === true && !tem(['rodas-camara-ar'], lado)) {
            confirmar.push({ chave: 'tubeless-' + lado,
                nome: 'Confirmar sistema tubeless ' + lado + ' completo e adequado ao aro/pneu (válvula, vedação e itens exigidos pelo fabricante).' });
        } else {
            exigir('camara-' + lado, 'Câmara de ar ' + lado + ' ou sistema tubeless confirmado', tem(['rodas-camara-ar'], lado));
        }
        const freio = pecas.find(p => ['freios', 'freios-' + sufixo].includes(slug(p))
            && (posicao(p) === lado || p.specs?.vendido_em_par === true));
        const padrao = normalizarSpec(freio?.specs?.padrao_freio, 'padrao_freio');
        if (padrao?.startsWith('disco')) {
            exigir('disco-' + lado, 'Disco de freio ' + sufixo,
                tem(['freios-disco'], lado) || freio.specs?.inclui_disco === true);
        } else if (freio && !padrao) {
            confirmar.push({ chave: 'padrao-freio-' + lado, nome: 'Informar o padrão do freio ' + sufixo + ' para verificar se exige disco.' });
        }
    }

    if (tipo === 'single-speed') {
        exigir('transmissao-single-speed', 'Pinhão/roda livre para single-speed confirmado',
            tem(['transmissao-single-speed']) || pecas.some(p => ['cassete', 'rodas-cubo-traseiro'].includes(slug(p))
                && p.specs?.tipo_transmissao === 'single-speed'));
    } else {
        exigir('cassete', 'Cassete', tem(['cassete']));
        exigir('cambio-traseiro', 'Câmbio traseiro', tem(['cambio-traseiro-desviador']));
        exigir('trocador-traseiro', 'Comando/trocador traseiro', tem(['cambio-traseiro-trocador']));
        const pedivela = pecas.find(p => slug(p) === 'pedivela');
        const coroas = normalizarSpec(pedivela?.specs?.numero_coroas, 'numero_coroas');
        if (Number(coroas) > 1 || tem(['cambio-dianteiro-desviador', 'cambio-dianteiro-trocador'])) {
            exigir('cambio-dianteiro', 'Câmbio dianteiro para múltiplas coroas', tem(['cambio-dianteiro-desviador']));
            exigir('trocador-dianteiro', 'Comando/trocador dianteiro', tem(['cambio-dianteiro-trocador']));
        } else if (pedivela && coroas === null) {
            confirmar.push({ chave: 'numero-coroas', nome: 'Informar o número de coroas do pedivela para verificar a necessidade do câmbio dianteiro.' });
        }
    }
    if (tipo === 'suspensao-total') exigir('amortecedor', 'Amortecedor traseiro', tem(['quadro-amortecedor']));
    const faltantes = requisitos.filter(r => !r.atendido);
    return {
        tipo, status: faltantes.length ? 'incompleta' : confirmar.length ? 'confirmacao_necessaria' : 'itens_selecionados',
        total: requisitos.length, selecionados: requisitos.length - faltantes.length,
        faltantes, confirmar,
        observacao: 'Lista orientativa de componentes principais. Confirme conteúdo dos conjuntos, quantidades, cabos/mangueiras, fixadores e montagem com um profissional. A lista não certifica compatibilidade ou segurança.'
    };
}

module.exports = { avaliarCompletude, tipoValido };
