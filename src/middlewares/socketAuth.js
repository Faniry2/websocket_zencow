'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config');
const logger = require('../logger');

/**
 * Vérifie un jeton navigateur émis par Laravel.
 *
 * Format : JWT HS256 signé avec WS_JWT_SECRET,
 *   header  { "alg": "HS256", "typ": "JWT" }
 *   payload { "sub": <userId>, "iat": <sec>, "exp": <sec> }
 *
 * @returns {number} userId
 * @throws  {Error}  si le jeton est absent, mal signé, expiré ou incomplet
 */
function verifyToken(token) {
    const secret = config.jwtSecret();
    if (!secret) throw new Error('WS_JWT_SECRET non configuré');
    if (typeof token !== 'string' || token === '') throw new Error('jeton absent');

    // algorithms : refuse tout autre algorithme que HS256 (dont "none")
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });

    if (typeof payload !== 'object' || payload === null) throw new Error('payload invalide');
    if (typeof payload.exp !== 'number') throw new Error('exp manquant');

    const userId = typeof payload.sub === 'string' && /^\d+$/.test(payload.sub)
        ? Number(payload.sub)
        : payload.sub;
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('sub invalide');

    return userId;
}

/**
 * Middleware socket.io : io.use(socketAuth)
 *
 * - Jeton fourni (handshake.auth.token) : toujours vérifié ; si valide,
 *   socket.data.userId = sub, sinon connexion refusée ("unauthorized").
 * - Jeton absent : refusé si WS_AUTH_REQUIRED=true ; sinon accepté avec un
 *   avertissement (mode rétrocompatible : le client utilisera `join`).
 */
function socketAuth(socket, next) {
    const token = socket.handshake.auth && socket.handshake.auth.token;

    if (token !== undefined && token !== null && token !== '') {
        try {
            socket.data.userId = verifyToken(token);
            return next();
        } catch (err) {
            logger.warn(`[WS] Jeton refusé (${socket.id}) : ${err.message}`);
            return next(new Error('unauthorized'));
        }
    }

    if (config.authRequired()) {
        logger.warn(`[WS] Connexion sans jeton refusée (${socket.id})`);
        return next(new Error('unauthorized'));
    }

    logger.warnThrottled('legacy-socket', '[WS] Connexion sans jeton acceptée (WS_AUTH_REQUIRED=false)');
    return next();
}

module.exports = { socketAuth, verifyToken };
