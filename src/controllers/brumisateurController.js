'use strict';

const socketService = require('../services/socketService');

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
 */
const DUREES = ['dureeOn', 'dureeOff', 'dureeTotale'];

function broadcast(req, res) {
    const payload = req.body || {};

    const required = ['event', 'userId', 'devEui', 'refActionneur', 'etat'];
    const missing  = required.filter((k) => payload[k] === undefined || payload[k] === null);

    if (missing.length > 0) {
        return res.status(422).json({
            error:   'Champs manquants dans le payload brumisateur.',
            missing,
        });
    }

    const dureesInvalides = DUREES.filter((k) => {
        const v = payload[k];
        if (v === undefined || v === null) return false;
        return typeof v !== 'number' || !Number.isFinite(v) || v < 0;
    });

    if (dureesInvalides.length > 0) {
        return res.status(422).json({
            error:   'Les durées doivent être des nombres >= 0 ou null.',
            invalid: dureesInvalides,
        });
    }

    // Préfixe `user:` obligatoire : l'état est renvoyé à la connexion
    const stateKey = `user:${payload.userId}:brumisateur:${payload.refActionneur}`;

    socketService.broadcast('brumisateur.update', stateKey, payload);

    res.json({
        status:  'broadcasted',
        room:    `user:${payload.userId}`,
        clients: socketService.clientsCount(),
        key:     stateKey,
    });
}

module.exports = { broadcast };
