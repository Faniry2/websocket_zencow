'use strict';

const { Server } = require('socket.io');
const config     = require('../config');
const logger     = require('../logger');
const { socketAuth }        = require('../middlewares/socketAuth');
const { connectionLimiter } = require('../middlewares/rateLimit');

/**
 * socketService
 * ─────────────
 * Utilise les rooms Socket.io pour cibler les mises à jour par userId.
 *
 * Flux :
 *   1. Le navigateur se connecte avec un jeton signé par Laravel :
 *      io(wsUrl, { auth: { token } }). Le middleware socketAuth vérifie le
 *      jeton et le serveur place le socket dans la room `user:{userId}`.
 *      (Mode rétrocompatible WS_AUTH_REQUIRED=false : l'ancien
 *      socket.emit('join', { userId }) est encore accepté, avec avertissement.)
 *   2. Laravel envoie POST /broadcast/ventilateur avec { userId, ... }
 *   3. Node.js diffuse uniquement dans la room `user:{userId}`
 *
 * Chaque éleveur ne reçoit QUE ses propres données.
 */

let io = null;

// Stockage en mémoire : dernière valeur par userId + type
// Structure : { 'user:52:ventilateur:98f2127d': { payload, at } }
// Les états plus vieux que STATE_TTL_HOURS (défaut 24 h) sont supprimés.
const latestStates = new Map();
let purgeTimer = null;

function stateTtlMs() {
    const h = Number.parseFloat(process.env.STATE_TTL_HOURS);
    return (Number.isFinite(h) && h > 0 ? h : 24) * 3600 * 1000;
}

function purgeExpiredStates(now = Date.now()) {
    const ttl = stateTtlMs();
    let removed = 0;
    latestStates.forEach((entry, key) => {
        if (now - entry.at > ttl) { latestStates.delete(key); removed += 1; }
    });
    if (removed > 0) logger.debug(`[WS] ${removed} état(s) expiré(s) supprimé(s)`);
    return removed;
}

/**
 * Vérifie l'origine de chaque poignée de main, y compris en transport
 * websocket (l'option `cors` ne s'applique qu'au polling).
 * Appliqué uniquement si ALLOWED_ORIGIN est défini.
 * Applique aussi la limite de connexions par IP (RATE_LIMIT_CONNECTIONS).
 */
function allowRequest(req, cb) {
    if (!connectionLimiter.hit(req)) return cb('Trop de connexions', false);

    const origins = config.allowedOrigins();
    if (origins.length === 0) return cb(null, true);

    const origin = req.headers.origin;
    const ok = origins.includes(origin);
    if (!ok) {
        logger.warn(`[WS] Origine refusée : ${origin || '(absente)'}`);
        return cb(null, false);
    }
    cb(null, true);
}

function init(server, corsOrigin) {
    io = new Server(server, {
        cors: {
            origin:  corsOrigin,
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
        allowRequest,
    });

    io.use(socketAuth);

    purgeTimer = setInterval(purgeExpiredStates, 10 * 60 * 1000);
    purgeTimer.unref();

    io.on('connection', (socket) => {
        logger.debug(`[WS] Client connecté : ${socket.id}`);

        // ── Jeton valide : room de l'utilisateur authentifié ──────────────────
        if (socket.data.userId) {
            joinUserRoom(socket, socket.data.userId);
        }

        // ── Ancien protocole : le client envoie lui-même son userId ───────────
        socket.on('join', (data) => {
            if (socket.data.userId) return; // déjà authentifié : userId client ignoré

            if (config.authRequired()) {
                logger.warn(`[WS] ${socket.id} : 'join' ignoré (WS_AUTH_REQUIRED=true)`);
                return;
            }

            const userId = data && data.userId;
            if (!userId) return;

            logger.warnThrottled('legacy-join', `[WS] 'join' non authentifié accepté (user:${userId}, WS_AUTH_REQUIRED=false)`);
            joinUserRoom(socket, userId);
        });

        socket.on('disconnect', (reason) => {
            logger.debug(`[WS] Client déconnecté : ${socket.id} — ${reason}`);
        });
    });

    logger.info('[WS] Socket.io initialisé (rooms par userId)');
    return io;
}

/**
 * Place le socket dans la room de l'utilisateur et lui renvoie les derniers
 * états connus de cet utilisateur uniquement.
 */
function joinUserRoom(socket, userId) {
    const room = `user:${userId}`;
    socket.join(room);
    logger.debug(`[WS] ${socket.id} a rejoint la room ${room}`);

    const ttl = stateTtlMs();
    const now = Date.now();
    latestStates.forEach((entry, key) => {
        if (key.startsWith(`${room}:`) && now - entry.at <= ttl) {
            socket.emit(entry.event, entry.payload);
        }
    });
}

/**
 * Diffuse un événement uniquement dans la room de l'utilisateur.
 *
 * @param {string} event    Nom de l'événement Socket.io
 * @param {string} stateKey Clé unique (ex: 'user:52:ventilateur:98f2127d')
 * @param {object} payload  Données à diffuser — doit contenir { userId }
 */
function broadcast(event, stateKey, payload) {
    if (!io) throw new Error('socketService non initialisé.');

    const userId = payload.userId;
    if (!userId) {
        logger.warn('[WS] broadcast sans userId — ignoré');
        return;
    }

    // Mémoriser le dernier état
    latestStates.set(stateKey, { event, payload, at: Date.now() });

    // Diffuser UNIQUEMENT dans la room de cet utilisateur
    const room = `user:${userId}`;
    io.to(room).emit(event, payload);

    logger.info(`[WS] Broadcast : ${event} | room=${room} | key=${stateKey}`);
}

function clientsCount() {
    return io ? io.engine.clientsCount : 0;
}

function getAllStates() {
    const out = {};
    latestStates.forEach((entry, key) => {
        out[key] = { event: entry.event, ...entry.payload, storedAt: new Date(entry.at).toISOString() };
    });
    return out;
}

function clearStates() {
    latestStates.clear();
}

/** Ferme socket.io (et le serveur HTTP qui le porte). */
function close() {
    return new Promise((resolve) => {
        if (purgeTimer) clearInterval(purgeTimer);
        if (!io) return resolve();
        io.close(() => resolve());
    });
}

module.exports = {
    init, broadcast, clientsCount, getAllStates, clearStates, purgeExpiredStates, close,
};