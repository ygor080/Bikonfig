const { initializeApp } = require('firebase/app');
const { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signOut } = require('firebase/auth');
const { iniciar } = require('./firebaseAuthUi');
document.addEventListener('DOMContentLoaded', () => iniciar({
    criarCliente(config) {
        const auth = initializeAuth(initializeApp(config), { persistence: inMemoryPersistence });
        return {
            entrar: (email, senha) => signInWithEmailAndPassword(auth, email, senha),
            cadastrar: (email, senha) => createUserWithEmailAndPassword(auth, email, senha),
            sair: () => signOut(auth)
        };
    }
}));
