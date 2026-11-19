'use strict';

const socketService          = require('../services/socketService');
const { validate, schemas }   = require('../validation');

/**
 * POST /broadcast/capteur
 *
 * Reçoit depuis Laravel les mesures THI d'un capteur.
 * (Non appelée par Laravel à ce jour, et aucun JS n'écoute `capteur.mesure`.)
 *
 * Body attendu :
 * {
 *   "event":      "capteur.mesure",
 *   "userId":     52,               <- obligatoire pour cibler la room
 *   "capteurId":  42,
 *   "devEui":     "abc123def456",
 *   "nom":        "Capteur Bâtiment A",
 *   "temperature": 28.5,
 *   "humidite":   72.0,
 *   "ith":        68.3,
 *   "receivedAt": "2026-04-22T13:19:51.545+00:00"
 * }
 */
function broadcast(req, res) {
    const result = validate(schemas.capteur, req.body, 'capteur');
    if (result.status) return res.status(result.status).json(result.body);

    const payload = result.value;

    // ── Clé unique par user + capteur (préfixe `user:` : renvoyée à la connexion)
    const stateKey = `user:${payload.userId}:capteur:${payload.capteurId}`;

    socketService.broadcast('capteur.mesure', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
