'use strict';

const socketService          = require('../services/socketService');
const { validate, schemas }   = require('../validation');

/**
 * POST /broadcast/alerte
 *
 * Reçoit depuis Laravel une alerte déclenchée (ITH critique, seuil dépassé…).
 * (Non appelée par Laravel à ce jour, et aucun JS n'écoute `alerte.ith`.)
 *
 * Body attendu :
 * {
 *   "event":      "alerte.ith",
 *   "userId":     5,
 *   "capteurId":  42,
 *   "nom":        "Capteur Bâtiment A",
 *   "ith":        79.2,
 *   "niveau":     "critique",      // "attention" | "alerte" | "critique"
 *   "message":    "ITH critique dépassé : 79.2",
 *   "receivedAt": "2026-04-22T13:19:51.545+00:00"
 * }
 */
function broadcast(req, res) {
    const result = validate(schemas.alerte, req.body, 'alerte');
    if (result.status) return res.status(result.status).json(result.body);

    const payload = result.value;

    // ── Clé unique par user + capteur (préfixe `user:` : renvoyée à la connexion)
    const stateKey = `user:${payload.userId}:alerte:${payload.capteurId ?? 'global'}`;

    socketService.broadcast('alerte.ith', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
