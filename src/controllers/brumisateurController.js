'use strict';

const socketService          = require('../services/socketService');
const { validate, schemas }   = require('../validation');

/**
 * POST /broadcast/brumisateur
 *
 * Reçoit depuis Laravel (mesureApiController) l'état d'un brumisateur et le
 * diffuse dans la room de l'éleveur. brumisateur.js écoute `brumisateur.update`.
 *
 * Body attendu :
 * {
 *   "event":         "brumisateur.update",
 *   "userId":        52,               <- obligatoire pour cibler la room
 *   "devEui":        "2cf7f120635002e6",
 *   "deviceName":    "Brumisateur 7D12F298",
 *   "refActionneur": "98f2127d",
 *   "etat":          1,                <- 0 = arrêt, 1 = marche
 *   "dureeOn":       60,               <- secondes, nombre >= 0 ou null
 *   "dureeOff":      120,              <- secondes, nombre >= 0 ou null
 *   "dureeTotale":   3600,             <- secondes, nombre >= 0 ou null
 *   "receivedAt":    "2026-04-22T13:19:51.545+00:00",
 *   "configId":      3
 * }
 *
 * devEui et refActionneur doivent être présents (null accepté, mais pas les
 * deux). Tout champ non listé ci-dessus est refusé (422).
 */
function broadcast(req, res) {
    const result = validate(schemas.brumisateur, req.body, 'brumisateur');
    if (result.status) return res.status(result.status).json(result.body);

    const payload = result.value;
    const ref     = payload.refActionneur ?? payload.devEui;
    if (ref === null || ref === undefined) {
        return res.status(422).json({ error: 'refActionneur ou devEui doit être renseigné.' });
    }

    // Préfixe `user:` obligatoire : l'état est renvoyé à la connexion
    const stateKey = `user:${payload.userId}:brumisateur:${ref}`;

    socketService.broadcast('brumisateur.update', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
