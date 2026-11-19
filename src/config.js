'use strict';

/**
 * Configuration lue dans process.env à chaque appel (et non une seule fois au
 * démarrage), ce qui permet aux tests de changer de mode sans recharger l'app.
 */

function authRequired() {
    return String(process.env.WS_AUTH_REQUIRED || 'false').toLowerCase() === 'true';
}

function broadcastSecret() {
    return process.env.WS_BROADCAST_SECRET || '';
}

function isProduction() {
    return process.env.NODE_ENV === 'production';
}

const DEFAULT_ORIGIN = 'http://localhost:8000';

/**
 * Origines du site autorisées, découpées sur `,`.
 * ex. ALLOWED_ORIGIN=https://zencow.fr,https://www.zencow.fr
 * Renvoie [] si ALLOWED_ORIGIN n'est pas défini.
 */
function allowedOrigins() {
    return String(process.env.ALLOWED_ORIGIN || '')
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

/** Origines pour CORS : celles d'ALLOWED_ORIGIN, ou l'ancienne valeur par défaut. */
function corsOrigins() {
    const origins = allowedOrigins();
    return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

module.exports = { authRequired, broadcastSecret, isProduction, allowedOrigins, corsOrigins };
