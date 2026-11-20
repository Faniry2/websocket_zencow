'use strict';

const logger = require('../logger');

/**
 * Limite de débit par IP, en mémoire, par fenêtre fixe d'une minute.
 *
 * Les adresses de boucle locale (127.0.0.1, ::1) ne sont pas limitées : en
 * prod, Laravel et le proxy appellent le serveur en local. Derrière un proxy,
 * TRUST_PROXY=true fait utiliser la dernière adresse de X-Forwarded-For
 * (celle ajoutée par le proxy de confiance, devant un seul proxy).
 *
 *   RATE_LIMIT_BROADCAST   requêtes /broadcast/* par IP et par minute (défaut 600, 0 = illimité)
 *   RATE_LIMIT_CONNECTIONS connexions socket.io par IP et par minute (défaut 120, 0 = illimité)
 */
const WINDOW_MS = 60_000;
const LOOPBACK  = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function clientIp(req) {
    if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
        const fwd = req.headers['x-forwarded-for'];
        // Dernière adresse : celle ajoutée par notre proxy (les précédentes
        // peuvent être forgées par le client)
        if (typeof fwd === 'string' && fwd.trim() !== '') return fwd.split(',').pop().trim();
    }
    return (req.socket && req.socket.remoteAddress) || 'inconnue';
}

function limitFrom(envName, fallback) {
    const n = Number.parseInt(process.env[envName], 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function createLimiter(envName, fallback) {
    const hits = new Map(); // ip -> { count, resetAt }

    const timer = setInterval(() => {
        const now = Date.now();
        hits.forEach((v, ip) => { if (v.resetAt <= now) hits.delete(ip); });
    }, WINDOW_MS);
    timer.unref();

    /** @returns {boolean} true si la requête est autorisée */
    function hit(req) {
        const limit = limitFrom(envName, fallback);
        if (limit === 0) return true;

        const ip = clientIp(req);
        if (LOOPBACK.has(ip)) return true;

        const now = Date.now();
        let entry = hits.get(ip);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + WINDOW_MS };
            hits.set(ip, entry);
        }
        entry.count += 1;

        if (entry.count > limit) {
            if (entry.count === limit + 1) logger.warn(`[RATE] ${envName} dépassée pour ${ip}`);
            return false;
        }
        return true;
    }

    return { hit, reset: () => hits.clear() };
}

const broadcastLimiter  = createLimiter('RATE_LIMIT_BROADCAST', 600);
const connectionLimiter = createLimiter('RATE_LIMIT_CONNECTIONS', 120);

/** Middleware Express pour /broadcast/* */
function broadcastRateLimit(req, res, next) {
    if (broadcastLimiter.hit(req)) return next();
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'Trop de requêtes.' });
}

module.exports = { broadcastRateLimit, broadcastLimiter, connectionLimiter, clientIp };
