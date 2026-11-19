'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const { io } = require('socket.io-client');

const ORIGIN           = 'https://zencow.test';
const BROADCAST_SECRET = crypto.randomBytes(32).toString('hex');
const JWT_SECRET       = crypto.randomBytes(32).toString('hex');

/**
 * Démarre une instance du serveur sur un port libre de 127.0.0.1.
 * Chaque fichier de test tourne dans son propre processus (node --test),
 * donc chaque fichier a sa propre instance.
 */
async function startServer(env = {}) {
    Object.assign(process.env, {
        NODE_ENV:            'test',
        LOG_LEVEL:           'silent',
        ALLOWED_ORIGIN:      ORIGIN,
        WS_BROADCAST_SECRET: BROADCAST_SECRET,
        WS_JWT_SECRET:       JWT_SECRET,
        WS_AUTH_REQUIRED:    'true',
    }, env);

    const { app, server } = require('../src/app');
    const socketService   = require('../src/services/socketService');

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;

    return {
        app,
        url,
        socketService,
        close: () => socketService.close(),
    };
}

function makeToken(userId, { expiresIn = 3600, secret = JWT_SECRET, iatOffset = 0 } = {}) {
    const now = Math.floor(Date.now() / 1000) + iatOffset;
    return jwt.sign({ sub: userId, iat: now, exp: now + expiresIn }, secret, { algorithm: 'HS256', noTimestamp: true });
}

/** Jeton non signé (alg "none") : doit être refusé. */
function unsignedToken(userId) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: userId, iat: now, exp: now + 3600 })}.`;
}

/**
 * Ouvre un client socket.io. Résout avec { socket, events } une fois
 * connecté (events collecte tout ce qui est reçu dès la connexion), rejette
 * avec l'erreur de connexion sinon.
 */
function connect(url, { token, origin = ORIGIN, transport = 'websocket' } = {}) {
    return new Promise((resolve, reject) => {
        const socket = io(url, {
            transports:   [transport],
            reconnection: false,
            forceNew:     true,
            timeout:      3000,
            auth:         token !== undefined ? { token } : {},
            extraHeaders: origin ? { Origin: origin } : {},
        });
        const events = [];
        socket.onAny((event, payload) => events.push({ event, payload }));
        socket.on('connect', () => resolve({ socket, events }));
        socket.on('connect_error', (err) => { socket.close(); reject(err); });
    });
}

/** Attend un événement, ou rejette après `ms`. */
function waitFor(socket, event, ms = 1000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${event} non reçu`)), ms);
        socket.once(event, (p) => { clearTimeout(t); resolve(p); });
    });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function brumisateurPayload(overrides = {}) {
    return {
        event: 'brumisateur.update',
        devEui: '2cf7f120635002e6', deviceName: 'Brumisateur test', refActionneur: 'b1',
        etat: 1, dureeOn: 60, dureeOff: 120, dureeTotale: 3600,
        receivedAt: '2026-11-19T10:00:00.000+00:00', userId: 52, configId: 3,
        ...overrides,
    };
}

function ventilateurPayload(overrides = {}) {
    return {
        event: 'ventilateur.update',
        devEui: '2cf7f120635002e7', deviceName: 'Ventilateur test', refActionneur: 'v1',
        vitesse: 75, mode: 2, modeLabel: 'actif',
        receivedAt: '2026-11-19T10:00:00.000+00:00', userId: 52, configId: 4,
        ...overrides,
    };
}

module.exports = {
    ORIGIN, BROADCAST_SECRET, JWT_SECRET,
    startServer, makeToken, unsignedToken, connect, waitFor, delay,
    brumisateurPayload, ventilateurPayload,
};
