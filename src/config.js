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

module.exports = { authRequired, broadcastSecret, isProduction };
