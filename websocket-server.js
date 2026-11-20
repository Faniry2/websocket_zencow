'use strict';

require('dotenv').config();
const app           = require('./src/app');
const socketService = require('./src/services/socketService');
const logger        = require('./src/logger');
const config        = require('./src/config');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.server.listen(PORT, HOST, () => {
    logger.info('══════════════════════════════════════════');
    logger.info('  ZenCow WebSocket Server');
    logger.info(`  Écoute    : http://${HOST}:${PORT}`);
    logger.info(`  Origines  : ${process.env.ALLOWED_ORIGIN || '(non défini : origine non vérifiée en websocket)'}`);
    logger.info(`  Auth      : ${config.authRequired() ? 'obligatoire' : 'rétrocompatible (WS_AUTH_REQUIRED=false)'}`);
    logger.info(`  Env       : ${process.env.NODE_ENV || 'development'}`);
    logger.info('══════════════════════════════════════════');
});

if (config.authRequired() && (!config.broadcastSecret() || !config.jwtSecret())) {
    logger.error('[CONFIG] WS_AUTH_REQUIRED=true mais WS_BROADCAST_SECRET ou WS_JWT_SECRET est vide : tout sera refusé.');
}

// ─── Arrêt propre (PM2, Docker) ───────────────────────────────────────────────
let stopping = false;
function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    logger.info(`[SHUTDOWN] ${signal} reçu, fermeture des connexions…`);

    // Au-delà de 10 s, on force l'arrêt
    setTimeout(() => process.exit(1), 10_000).unref();

    // io.close() ferme aussi le serveur HTTP
    socketService.close().then(() => {
        logger.info('[SHUTDOWN] Serveur arrêté.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException',  (err) => logger.error('[FATAL]', err));
process.on('unhandledRejection', (err) => logger.error('[REJECT]', err));
