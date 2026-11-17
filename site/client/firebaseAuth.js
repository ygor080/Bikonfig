const { initializeApp } = require('firebase/app');
const { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup,
    browserPopupRedirectResolver, sendPasswordResetEmail, sendEmailVerification } = require('firebase/auth');
const { iniciar } = require('./firebaseAuthUi');
document.addEventListener('DOMContentLoaded', () => iniciar({
    async criarCliente(config) {
        const auth = initializeAuth(initializeApp(config), {
            persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver
        });
        await auth.authStateReady();
        auth.languageCode = 'pt-BR';
        return {
            entrar: (email, senha) => signInWithEmailAndPassword(auth, email, senha),
            cadastrar: (email, senha) => createUserWithEmailAndPassword(auth, email, senha),
            recuperar: email => sendPasswordResetEmail(auth, email),
            verificarEmail: usuario => sendEmailVerification(usuario),
            google: () => {
                const provedor = new GoogleAuthProvider();
                provedor.setCustomParameters({ prompt: 'select_account' });
                return signInWithPopup(auth, provedor, browserPopupRedirectResolver);
            },
            sair: () => signOut(auth)
        };
    }
}));
