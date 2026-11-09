// /tests/account-auth-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('online API exposes registration, login and logout actions', () => {
    const api = read('online-api.php');
    assert.match(api, /case 'register':\s+onlineAuthRegister/);
    assert.match(api, /case 'login':\s+onlineAuthLogin/);
    assert.match(api, /case 'logout':\s+onlineAuthLogout/);
    assert.match(api, /'account' => \$account/);
});

test('account passwords are hashed and verified with PHP password helpers', () => {
    const auth = read('lib/account-auth.php');
    assert.match(auth, /password_hash\(\$password, PASSWORD_DEFAULT\)/);
    assert.match(auth, /password_verify\(\$password, \$account\['password_hash'\]\)/);
});

test('login merges anonymous game identity into the account identity', () => {
    const auth = read('lib/account-auth.php');
    assert.match(auth, /function onlineAuthMergeIdentity/);
    assert.match(auth, /game_participants/);
    assert.match(auth, /online_games/);
    assert.match(auth, /game_invites/);
    assert.match(auth, /player_devices/);
});

test('account schema is repeatable and references player identities', () => {
    const schema = read('install/schema.sql');
    assert.match(schema, /CREATE TABLE IF NOT EXISTS \{DB_PREFIX\}player_accounts/);
    assert.match(schema, /UNIQUE KEY uq_player_account_username \(username\)/);
    assert.match(schema, /password_hash VARCHAR\(255\) NOT NULL/);
    assert.match(schema, /fk_account_identity/);
});

test('main menu and dynamically loaded forms expose account actions', () => {
    const index = read('index.php');
    const navigation = read('js/navigation.js');
    const auth = read('js/auth.js');
    const login = read('screens/login.php');
    const register = read('screens/register.php');
    assert.doesNotMatch(index, /id="register-menu-btn"/);
    assert.match(index, /id="login-menu-btn"/);
    assert.match(index, /id="account-avatar-btn"/);
    assert.match(index, /data-account-action="profile"/);
    assert.match(index, /data-account-action="games"/);
    assert.match(index, /data-account-action="stats"/);
    assert.match(navigation, /import\('\.\/auth\.js'\)/);
    assert.match(auth, /addEventListener\('submit'/);
    assert.match(login, /id="login-form"/);
    assert.match(register, /id="register-form"/);
});


test('profile screen can update account details and display player statistics', () => {
    const profile = read('screens/profile.php');
    const controller = read('js/profile.js');
    const api = read('online-api.php');
    const screenRouter = read('screen.php');
    assert.match(screenRouter, /'profile' => 'profile\.php'/);
    assert.match(profile, /name="display_name"/);
    assert.match(profile, /id="profile-color"/);
    assert.match(profile, /id="profile-statistics"/);
    assert.match(controller, /api\('update_profile'/);
    assert.match(controller, /api\('profile_stats'/);
    assert.match(api, /case 'update_profile'/);
    assert.match(api, /case 'profile_stats'/);
});
