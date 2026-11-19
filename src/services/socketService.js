'use strict';

const { Server } = require('socket.io');
const config     = require('../config');
const { socketAuth } = require('../middlewares/socketAuth');

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
// Structure : { 'user:52:ventilateur:98f2127d': payload }
const latestStates = new Map();

/**
 * Vérifie l'origine de chaque poignée de main, y compris en transport
 * websocket (l'option `cors` ne s'applique qu'au polling).
 * Appliqué uniquement si ALLOWED_ORIGIN est défini.
 */
function allowRequest(req, cb) {
    const origins = config.allowedOrigins();
    if (origins.length === 0) return cb(null, true);

    const origin = req.headers.origin;
    const ok = origins.includes(origin);
    if (!ok) console.warn(`[WS] Origine refusée : ${origin || '(absente)'}`);
    cb(null, ok);
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

    io.on('connection', (socket) => {
        console.log(`[WS] Client connecté : ${socket.id}`);

        // ── Jeton valide : room de l'utilisateur authentifié ──────────────────
        if (socket.data.userId) {
            joinUserRoom(socket, socket.data.userId);
        }

        // ── Ancien protocole : le client envoie lui-même son userId ───────────
        socket.on('join', (data) => {
            if (socket.data.userId) return; // déjà authentifié : userId client ignoré

            if (config.authRequired()) {
                console.warn(`[WS] ${socket.id} : 'join' ignoré (WS_AUTH_REQUIRED=true)`);
                return;
            }

            const userId = data && data.userId;
            if (!userId) return;

            console.warn(`[WS] ${socket.id} : 'join' non authentifié pour user:${userId} (WS_AUTH_REQUIRED=false)`);
            joinUserRoom(socket, userId);
        });

        socket.on('disconnect', (reason) => {
            console.log(`[WS] Client déconnecté : ${socket.id} — ${reason}`);
        });
    });

    console.log('[WS] Socket.io initialisé (rooms par userId)');
    return io;
}

/**
 * Place le socket dans la room de l'utilisateur et lui renvoie les derniers
 * états connus de cet utilisateur uniquement.
 */
function joinUserRoom(socket, userId) {
    const room = `user:${userId}`;
    socket.join(room);
    console.log(`[WS] ${socket.id} a rejoint la room ${room}`);

    latestStates.forEach((payload, key) => {
        if (key.startsWith(`${room}:`)) {
            socket.emit(payload.event, payload);
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
        console.warn('[WS] broadcast sans userId — ignoré');
        return;
    }

    // Mémoriser le dernier état
    latestStates.set(stateKey, { event, ...payload });

    // Diffuser UNIQUEMENT dans la room de cet utilisateur
    const room = `user:${userId}`;
    io.to(room).emit(event, payload);

    console.log(`[WS] Broadcast : ${event} | room=${room} | key=${stateKey}`);
}

function clientsCount() {
    return io ? io.engine.clientsCount : 0;
}

function getAllStates() {
    return Object.fromEntries(latestStates);
}

module.exports = { init, broadcast, clientsCount, getAllStates };