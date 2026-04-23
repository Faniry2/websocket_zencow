'use strict';

const socketService = require('../services/socketService');

/**
 * POST /broadcast/ventilateur
 *
 * Body attendu :
 * {
 *   "event":         "ventilateur.update",
 *   "userId":        52,               <- obligatoire pour cibler la room
 *   "devEui":        "2cf7f120635002e6",
 *   "deviceName":    "Ventilateur 7D12F298",
 *   "refActionneur": "98f2127d",
 *   "vitesse":       75,
 *   "mode":          1,
 *   "modeLabel":     "actif",
 *   "receivedAt":    "2026-04-22T13:19:51.545+00:00",
 *   "configId":      4
 * }
 */
function broadcast(req, res) {
    const payload = req.body;

    const required = ['event', 'userId', 'devEui', 'refActionneur', 'vitesse', 'mode'];
    const missing  = required.filter((k) => payload[k] === undefined);

    if (missing.length > 0) {
        return res.status(422).json({
            error:   'Champs manquants dans le payload ventilateur.',
            missing,
        });
    }

    if (payload.vitesse < 0 || payload.vitesse > 100) {
        return res.status(422).json({ error: 'vitesse doit etre entre 0 et 100.' });
    }

    // Cle unique incluant userId pour isoler par utilisateur
    const stateKey = `user:${payload.userId}:ventilateur:${payload.refActionneur}`;

    // Diffuser uniquement dans la room de l utilisateur
    socketService.broadcast('ventilateur.update', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };