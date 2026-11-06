/**
 * Registrace, přihlášení a odhlášení hráčského účtu.
 * Formuláře jsou delegované, protože se HTML obrazovek načítá až na vyžádání.
 */
import { api, bootstrapOnline, resetBootstrap } from './online/api.js';

let initialized = false;

function setMessage(formName, message = '', type = '') {
    const output = document.getElementById(formName + '-message');
    if (!output) return;
    output.textContent = message;
    output.className = 'auth-message' + (type ? ' ' + type : '');
}

async function refreshAccountMenu() {
    const data = await bootstrapOnline();
    const account = data.account;
    const authButtons = document.getElementById('auth-buttons');
    const userInfo = document.getElementById('user-info');

    if (authButtons) authButtons.classList.toggle('hidden', Boolean(account));
    if (userInfo) userInfo.classList.toggle('hidden', !account);

    if (account) {
        const displayName = document.getElementById('user-display-name');
        const wins = document.getElementById('user-wins');
        const games = document.getElementById('user-games');
        if (displayName) displayName.textContent = account.display_name || account.username;
        if (wins) wins.textContent = '0';
        if (games) games.textContent = '0';
    }
    return account;
}

async function submitAuthForm(form) {
    const isRegister = form.id === 'register-form';
    const formName = isRegister ? 'register' : 'login';
    const action = isRegister ? 'register' : 'login';
    const submitButton = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form).entries());

    setMessage(formName);
    if (submitButton) submitButton.disabled = true;

    try {
        await api(action, values);
        resetBootstrap();
        await refreshAccountMenu();
        form.reset();
        if (typeof window.showScreen === 'function') {
            await window.showScreen('main-menu');
        }
    } catch (error) {
        setMessage(formName, error.message || 'Požadavek se nepodařilo dokončit.', 'error');
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

async function logout() {
    try {
        await api('logout');
        resetBootstrap();
        await refreshAccountMenu();
        if (typeof window.showScreen === 'function') {
            await window.showScreen('main-menu');
        }
    } catch (error) {
        window.alert(error.message || 'Odhlášení se nepodařilo.');
    }
}

export function initAuth() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('screen-container');
    container?.addEventListener('submit', event => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (form.id !== 'login-form' && form.id !== 'register-form') return;
        event.preventDefault();
        void submitAuthForm(form);
    });

    window.logout = logout;
    void refreshAccountMenu().catch(error => {
        console.warn('Stav uživatelského účtu se nepodařilo načíst:', error);
    });
}
