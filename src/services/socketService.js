'use strict';

const { Server } = require('socket.io');

/**
 * socketService
 * ─────────────
 * Service singleton qui gère :
 *   - l'initialisation de Socket.io
 *   - les connexions/déconnexions clients
 *   - la diffusion d'événements
 *   - le stockage en mémoire du dernier état par clé
 */

let io = null;

// Stockage en mémoire : dernière valeur reçue par type + clé
// Structure : { 'ventilateur:98f2127d': payload, 'capteur:abc123': payload }
const latestStates = new Map();

/**
 * Initialise Socket.io sur le serveur HTTP.
 * À appeler une seule fois au démarrage.
 */
function init(server, allowedOrigin) {
    io = new Server(server, {
        cors: {
            origin:  allowedOrigin,
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        console.log(`[WS] Client connecté    : ${socket.id} (total: ${io.engine.clientsCount})`);

        // Envoyer l'état courant de tous les équipements au nouveau client
        latestStates.forEach((payload, key) => {
            socket.emit(payload.event, payload);
        });

        socket.on('disconnect', (reason) => {
            console.log(`[WS] Client déconnecté  : ${socket.id} — ${reason}`);
        });
    });

    console.log('[WS] Socket.io initialisé');
    return io;
}

/**
 * Diffuse un événement à tous les clients connectés.
 * Mémorise aussi le dernier état pour les nouveaux clients.
 *
 * @param {string} event     Nom de l'événement Socket.io
 * @param {string} stateKey  Clé unique pour mémoriser l'état (ex: 'ventilateur:98f2127d')
 * @param {object} payload   Données à diffuser
 */
function broadcast(event, stateKey, payload) {
    if (!io) throw new Error('socketService non initialisé — appelez init() d\'abord.');

    // Mémoriser le dernier état
    latestStates.set(stateKey, { event, ...payload });

    // Diffuser à tous les clients
    io.emit(event, payload);

    console.log(`[WS] Broadcast : ${event} | key=${stateKey} | clients=${io.engine.clientsCount}`);
}

/**
 * Retourne le nombre de clients connectés.
 */
function clientsCount() {
    return io ? io.engine.clientsCount : 0;
}

/**
 * Retourne tous les états mémorisés (pour debug).
 */
function getAllStates() {
    return Object.fromEntries(latestStates);
}

module.exports = { init, broadcast, clientsCount, getAllStates };