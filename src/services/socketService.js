'use strict';

const { Server } = require('socket.io');

/**
 * socketService
 * ─────────────
 * Utilise les rooms Socket.io pour cibler les mises à jour par userId.
 *
 * Flux :
 *   1. Le navigateur se connecte et rejoint sa room : socket.join(`user:${userId}`)
 *   2. Laravel envoie POST /broadcast/ventilateur avec { userId, ... }
 *   3. Node.js diffuse uniquement dans la room `user:{userId}`
 *
 * Chaque éleveur ne reçoit QUE ses propres données.
 */

let io = null;

// Stockage en mémoire : dernière valeur par userId + type
// Structure : { 'user:52:ventilateur:98f2127d': payload }
const latestStates = new Map();

function init(server, allowedOrigin) {
    io = new Server(server, {
        cors: {
            origin:  allowedOrigin,
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        console.log(`[WS] Client connecté : ${socket.id}`);

        // ── Le client envoie son userId pour rejoindre sa room ────────────────
        // fan.js envoie : socket.emit('join', { userId })
        socket.on('join', ({ userId }) => {
            if (!userId) return;

            const room = `user:${userId}`;
            socket.join(room);
            console.log(`[WS] ${socket.id} a rejoint la room ${room}`);

            // Envoyer l'état courant uniquement pour cet utilisateur
            latestStates.forEach((payload, key) => {
                if (key.startsWith(`user:${userId}:`)) {
                    socket.emit(payload.event, payload);
                }
            });
        });

        socket.on('disconnect', (reason) => {
            console.log(`[WS] Client déconnecté : ${socket.id} — ${reason}`);
        });
    });

    console.log('[WS] Socket.io initialisé (rooms par userId)');
    return io;
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