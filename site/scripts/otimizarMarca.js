const sharp = require('sharp');
const path = require('node:path');
async function otimizar() {
    const pasta = path.join(__dirname, '../public/img'), origem = path.join(pasta, 'logo-bikonfig.png');
    for (const tamanho of [32, 96, 180]) await sharp(origem).resize(tamanho, tamanho, { fit: 'contain' })
        .png({ compressionLevel: 9 }).toFile(path.join(pasta, `logo-bikonfig-${tamanho}.png`));
    await sharp(origem).resize(80, 80, { fit: 'contain' }).webp({ quality: 85 }).toFile(path.join(pasta, 'logo-bikonfig-80.webp'));
}
if (require.main === module) otimizar().catch(() => { console.error('Não foi possível gerar os arquivos da marca.'); process.exitCode = 1; });
module.exports = { otimizar };
