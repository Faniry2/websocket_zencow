'use strict';

const socketService = require('../services/socketService');

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
    const payload = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    const required = ['event', 'userId', 'capteurId', 'ith'];
    const missing  = required.filter((k) => payload[k] === undefined);

    if (missing.length > 0) {
        return res.status(422).json({
            error:   'Champs manquants dans le payload capteur.',
            missing,
        });
    }

    // ── Clé unique par user + capteur (préfixe `user:` : renvoyée à la connexion)
    const stateKey = `user:${payload.userId}:capteur:${payload.capteurId}`;

    // ── Diffuser via Socket.io ─────────────────────────────────────────────
    socketService.broadcast('capteur.mesure', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
