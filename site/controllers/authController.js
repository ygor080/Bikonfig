const UsuarioModel = require('../models/usuarioModel');

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const REGRAS_SENHA = [
    { chave: 'tamanho', teste: senha => senha.length >= 8, mensagem: 'ter pelo menos 8 caracteres' },
    { chave: 'minuscula', teste: senha => /[a-z]/.test(senha), mensagem: 'ao menos uma letra minúscula' },
    { chave: 'maiuscula', teste: senha => /[A-Z]/.test(senha), mensagem: 'ao menos uma letra maiúscula' },
    { chave: 'numero', teste: senha => /[0-9]/.test(senha), mensagem: 'ao menos um número' },
    { chave: 'especial', teste: senha => /[^A-Za-z0-9]/.test(senha), mensagem: 'ao menos um caractere especial (ex: ! @ # $ % *)' }
];

function validarForcaSenha(senha) {
    if (!senha) return REGRAS_SENHA.map(r => r.mensagem);
    return REGRAS_SENHA.filter(regra => !regra.teste(senha)).map(regra => regra.mensagem);
}

function validarCadastro({ nome, email, senha, confirmarSenha }) {
    if (!nome || nome.trim().length < 3) {
        return 'O usuário deve ter pelo menos 3 caracteres.';
    }
    if (nome.trim().length > 40) {
        return 'O usuário deve ter no máximo 40 caracteres.';
    }
    if (!email || !REGEX_EMAIL.test(email.trim())) {
        return 'Informe um e-mail válido.';
    }
    const faltando = validarForcaSenha(senha);
    if (faltando.length > 0) {
        return 'A senha precisa: ' + faltando.join(', ') + '.';
    }
    if (senha !== confirmarSenha) {
        return 'As senhas não conferem.';
    }
    return null;
}

const authController = {
    exibirLogin: (req, res) => {
        if (req.session.user) return res.redirect('/home');
        res.render('login', { erro: null });
    },

    processarLogin: async (req, res) => {
        const { usuario, senha } = req.body;

        if (!usuario || !senha) {
            return res.render('login', { erro: 'Preencha usuário e senha.' });
        }

        const user = await UsuarioModel.validarLogin(usuario.trim(), senha);

        if (user) {
            req.session.user = user;
            res.redirect('/home');
        } else {
            res.render('login', { erro: 'Usuário ou senha inválidos.' });
        }
    },

    exibirCadastro: (req, res) => {
        if (req.session.user) return res.redirect('/home');
        res.render('cadastro', { erro: null, valores: {} });
    },

    processarCadastro: async (req, res) => {
        const { nome, email, senha, confirmarSenha } = req.body;

        const erroValidacao = validarCadastro({ nome, email, senha, confirmarSenha });
        if (erroValidacao) {
            return res.render('cadastro', {
                erro: erroValidacao,
                valores: { nome, email }
            });
        }

        const resultado = await UsuarioModel.cadastrar({ nome: nome.trim(), email: email.trim().toLowerCase(), senha });

        if (resultado.erro) {
            return res.render('cadastro', {
                erro: resultado.erro,
                valores: { nome, email }
            });
        }

        req.session.user = resultado.usuario;
        res.redirect('/home');
    },

    logout: (req, res) => {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
};

module.exports = authController;
