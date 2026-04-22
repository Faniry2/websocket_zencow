'use strict';

const socketService = require('../services/socketService');

/**
 * POST /broadcast/alerte
 *
 * Reçoit depuis Laravel une alerte déclenchée (ITH critique, seuil dépassé…).
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
    const payload = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    const required = ['event', 'userId', 'ith', 'niveau'];
    const missing  = required.filter((k) => payload[k] === undefined);

    if (missing.length > 0) {
        return res.status(422).json({
            error:   'Champs manquants dans le payload alerte.',
            missing,
        });
    }

    const niveauxValides = ['attention', 'alerte', 'critique'];
    if (!niveauxValides.includes(payload.niveau)) {
        return res.status(422).json({
            error: `niveau doit être : ${niveauxValides.join(', ')}.`,
        });
    }

    // ── Clé unique par user + capteur ──────────────────────────────────────
    const stateKey = `alerte:${payload.userId}:${payload.capteurId ?? 'global'}`;

    // ── Diffuser via Socket.io ─────────────────────────────────────────────
    socketService.broadcast('alerte.ith', stateKey, payload);

    res.json({
        status:  'broadcasted',
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
