function iniciar({ doc = document, criarCliente, consultar = fetch, navegar = url => location.assign(url) }) {
    let promessa;
    const obterCliente = () => {
        if (!promessa) promessa = (async () => {
            const resposta = await consultar('/auth/firebase/config', { credentials: 'same-origin' });
            if (!resposta.ok) throw new Error('config');
            return criarCliente(await resposta.json());
        })().catch(e => { promessa = null; throw e; });
        return promessa;
    };
    if (doc.getElementById('entrarGoogle')) {
        require('./firebaseGoogleUi').iniciarGoogle({ doc, obterCliente, consultar, navegar });
    }
}
module.exports = { iniciar };
