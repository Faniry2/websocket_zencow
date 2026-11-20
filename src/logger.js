'use strict';

/**
 * Logger minimal à niveaux, réglable par LOG_LEVEL :
 *   silent | error | warn | info | debug
 * Défaut : info en production (une ligne par message diffusé), debug sinon.
 */
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function currentLevel() {
    const wanted = String(process.env.LOG_LEVEL || '').toLowerCase();
    if (wanted in LEVELS) return LEVELS[wanted];
    return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
}

function make(level, sink) {
    return (...args) => {
        if (currentLevel() >= LEVELS[level]) sink(...args);
    };
}

// Avertissements répétitifs (mode rétrocompatible) : au plus un par clé et par minute
const lastWarn = new Map();
function warnThrottled(key, ...args) {
    const now = Date.now();
    if ((lastWarn.get(key) || 0) + 60_000 > now) return;
    lastWarn.set(key, now);
    module.exports.warn(...args, '(répété au plus une fois par minute)');
}

module.exports = {
    error: make('error', console.error),
    warn:  make('warn',  console.warn),
    info:  make('info',  console.log),
    debug: make('debug', console.log),
    warnThrottled,
};
