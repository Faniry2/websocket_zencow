'use strict';

const socketService = require('../services/socketService');

/**
 * POST /broadcast/ventilateur
 *
 * Reçoit depuis Laravel les données d'un ventilateur
 * issues du payload ChirpStack (fPort=8, typeTrame=17).
 *
 * Body attendu :
 * {
 *   "event":         "ventilateur.update",
 *   "devEui":        "2cf7f120635002e6",
 *   "deviceName":    "Ventilateur 7D12F298",
 *   "refActionneur": "98f2127d",
 *   "vitesse":       75,
 *   "mode":          1,
 *   "modeLabel":     "actif",
 *   "receivedAt":    "2026-04-22T13:19:51.545+00:00",
 *   "actionneur_id": 12
 * }
 */
function broadcast(req, res) {
    const payload = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    const required = ['event', 'devEui', 'refActionneur', 'vitesse', 'mode'];
    const missing  = required.filter((k) => payload[k] === undefined);

    if (missing.length > 0) {
        return res.status(422).json({
            error:   'Champs manquants dans le payload ventilateur.',
            missing,
        });
    }

    if (payload.vitesse < 0 || payload.vitesse > 100) {
        return res.status(422).json({ error: 'vitesse doit être entre 0 et 100.' });
    }

    // ── Clé unique pour mémoriser l'état ───────────────────────────────────
    const stateKey = `ventilateur:${payload.refActionneur}`;

    // ── Diffuser via Socket.io ─────────────────────────────────────────────
    socketService.broadcast('ventilateur.update', stateKey, payload);

    res.json({
        status:  'broadcasted',
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };