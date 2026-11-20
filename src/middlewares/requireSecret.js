'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

const HEADER = 'x-ws-secret';

/**
 * Compare deux chaînes en temps constant. On compare les empreintes SHA-256
 * pour que timingSafeEqual reçoive toujours deux tampons de même longueur
 * (il lève une exception sinon, et la longueur ne doit pas fuiter).
 */
function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

/** true si la requête porte un en-tête X-WS-Secret correct. */
function hasValidSecret(req) {
    const expected = config.broadcastSecret();
    const provided = req.get(HEADER);
    if (!expected || typeof provided !== 'string' || provided === '') return false;
    return safeEqual(provided, expected);
}

function unauthorized(res) {
    return res.status(401).json({ error: 'Non autorisé.' });
}

/**
 * Middleware Express : exige l'en-tête X-WS-Secret = WS_BROADCAST_SECRET.
 *
 * - WS_AUTH_REQUIRED=true  : en-tête obligatoire, sinon 401.
 * - WS_AUTH_REQUIRED=false : mode rétrocompatible. Sans en-tête, la requête
 *   passe avec un avertissement. Un en-tête fourni est quand même vérifié.
 */
function requireSecret(req, res, next) {
    const provided = req.get(HEADER);

    if (provided !== undefined) {
        if (hasValidSecret(req)) return next();
        logger.warn(`[AUTH] ${req.method} ${req.originalUrl} : X-WS-Secret invalide (${req.ip})`);
        return unauthorized(res);
    }

    if (config.authRequired()) {
        logger.warn(`[AUTH] ${req.method} ${req.originalUrl} : X-WS-Secret absent (${req.ip})`);
        return unauthorized(res);
    }

    logger.warnThrottled(`legacy-secret:${req.path}`, `[AUTH] ${req.method} ${req.originalUrl} sans X-WS-Secret accepté (WS_AUTH_REQUIRED=false)`);
    return next();
}

module.exports = { requireSecret, hasValidSecret, safeEqual };
