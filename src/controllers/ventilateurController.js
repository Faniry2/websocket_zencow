'use strict';

const socketService          = require('../services/socketService');
const { validate, schemas }   = require('../validation');

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
 *
 * Tout champ non listé ci-dessus est refusé (422).
 */
function broadcast(req, res) {
    const result = validate(schemas.ventilateur, req.body, 'ventilateur');
    if (result.status) return res.status(result.status).json(result.body);

    const payload = result.value;
    const ref     = payload.refActionneur ?? payload.devEui;
    if (ref === null || ref === undefined) {
        return res.status(422).json({ error: 'refActionneur ou devEui doit être renseigné.' });
    }

    // Clé unique incluant userId pour isoler par utilisateur
    const stateKey = `user:${payload.userId}:ventilateur:${ref}`;

    // Diffuser uniquement dans la room de l'utilisateur
    socketService.broadcast('ventilateur.update', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
