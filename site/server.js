const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const authRoutes = require('./routes/authRoutes');
const catalogoRoutes = require('./routes/catalogoRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.use(require('./middleware/segurancaConteudo'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

app.use('/', authRoutes);
app.use('/catalogo', catalogoRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/home');
    } else {
        res.redirect('/login');
    }
});

app.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('home', {
        usuario: req.session.user,
        titulo: 'Home - Bikonfig'
    });
});

async function iniciar() {
    app.listen(process.env.PORT || 3000, () => {
        console.log('Servidor rodando em http://localhost:' + (process.env.PORT || 3000));
    });
}

iniciar();
