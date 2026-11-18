const PDFDocument = require('pdfkit');
const path = require('node:path');
const moeda = valor => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function criarPdfMontagem(linhas, nomeUsuario) {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true,
        info: { Title: 'Bikonfig - Resumo da montagem', Author: 'Bikonfig' } });
    const limite = 745, largura = doc.page.width-96;
    function cabecalho() {
        doc.image(path.join(__dirname, '../public/img/logo-bikonfig-96.png'), 48, 35, { width: 36, height: 36 });
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#ef6000').text('Bikonfig', 94, 36);
        doc.font('Helvetica').fontSize(10).fillColor('#444').text('Lista de peças da bicicleta', 94, 60);
        doc.moveTo(48, 86).lineTo(48+largura, 86).strokeColor('#dddddd').stroke();
        doc.y = 100; doc.x = 48;
    }
    cabecalho();
    doc.fontSize(9).fillColor('#555').text('Gerado para: ' + String(nomeUsuario).slice(0,120));
    doc.text('Data: ' + new Date().toLocaleDateString('pt-BR')).moveDown();
    function garantir(altura) { if (doc.y+altura>limite) { doc.addPage(); cabecalho(); } }
    linhas.forEach((linha, indice) => {
        // Fatias pequenas permitem continuar nomes longos sem cruzar rodapés.
        let restante = String(linha.nome).slice(0,6000); const partes = [];
        while (restante.length>500) { let corte=restante.lastIndexOf(' ',500); if (corte<1) corte=500; partes.push(restante.slice(0,corte)); restante=restante.slice(corte).trimStart(); }
        partes.push(restante || 'Peça');
        partes.forEach((parte, i) => {
            doc.font('Helvetica').fontSize(10);
            const texto = (i===0 ? (indice+1)+'. ' : '(continuação) ') + parte;
            const altura = doc.heightOfString(texto, { width: largura-125 });
            garantir(altura+34);
            const y = doc.y;
            doc.fillColor('#222').text(texto, 48, y, { width: largura-125 });
            const depois = doc.y;
            if (i===0) doc.font('Helvetica-Bold').fillColor('#d95500').text(moeda(linha.preco), 48+largura-115, y, { width: 115, align: 'right' });
            doc.y = depois+5;
        });
        garantir(25);
        doc.font('Helvetica').fontSize(9);
        if (linha.link) doc.fillColor('#075b9b').text('Ver produto na loja', 48, doc.y, { link: linha.link, underline: true, width: largura });
        else doc.fillColor('#777').text('Link indisponível', 48, doc.y, { width: largura });
        doc.y += 10; doc.moveTo(48,doc.y).lineTo(48+largura,doc.y).strokeColor('#eeeeee').stroke(); doc.y += 10;
    });
    garantir(85);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#222').text('Total: ' + moeda(linhas.reduce((s,l)=>s+Number(l.preco),0)),48,doc.y);
    doc.moveDown().font('Helvetica').fontSize(9).fillColor('#555').text('Preços podem mudar. Confira valores, estoque e especificações na loja. Esta lista não certifica compatibilidade ou segurança.', { width: largura });
    const paginas = doc.bufferedPageRange();
    for (let i=0;i<paginas.count;i++) {
        doc.switchToPage(i); const margem = doc.page.margins.bottom; doc.page.margins.bottom=0;
        doc.font('Helvetica').fontSize(8).fillColor('#777').text('Bikonfig | '+(i+1)+' / '+paginas.count, 48, 790, { width: largura, align: 'center', lineBreak: false });
        doc.page.margins.bottom=margem;
    }
    return doc;
}
module.exports = { criarPdfMontagem };
