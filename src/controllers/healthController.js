'use strict';

const socketService = require('../services/socketService');

/**
 * GET /health
 * Vérifie que le serveur tourne correctement.
 */
function check(req, res) {
    res.json({
        status:     'ok',
        clients:    socketService.clientsCount(),
        states:     Object.keys(socketService.getAllStates()).length,
        uptime_s:   Math.round(process.uptime()),
        memory_mb:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        timestamp:  new Date().toISOString(),
    });
}

/**
 * GET /states
 * Retourne le dernier état connu de tous les équipements (debug).
 */
function states(req, res) {
    res.json(socketService.getAllStates());
}

module.exports = { check, states };
