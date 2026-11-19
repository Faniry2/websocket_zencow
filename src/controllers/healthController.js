'use strict';

const socketService      = require('../services/socketService');
const { hasValidSecret } = require('../middlewares/requireSecret');

/**
 * GET /health
 * Statut public du serveur. Les compteurs (clients, états, mémoire) ne sont
 * renvoyés qu'aux requêtes portant le secret X-WS-Secret.
 */
function check(req, res) {
    const body = {
        status:    'ok',
        uptime_s:  Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
    };

    if (hasValidSecret(req)) {
        body.clients   = socketService.clientsCount();
        body.states    = Object.keys(socketService.getAllStates()).length;
        body.memory_mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    }

    res.json(body);
}

/**
 * GET /states
 * Dernier état connu de tous les équipements (debug, hors production).
 */
function states(req, res) {
    res.json(socketService.getAllStates());
}

module.exports = { check, states };
