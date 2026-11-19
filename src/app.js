'use strict';

const express       = require('express');
const http          = require('http');
const cors          = require('cors');
const socketService = require('./services/socketService');
const routes        = require('./routes/index');
const config        = require('./config');
const logger        = require('./logger');

// Origine CORS vérifiée à chaque requête (ALLOWED_ORIGIN peut en lister plusieurs)
function corsOrigin(origin, cb) {
    cb(null, !origin || config.corsOrigins().includes(origin));
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
    app.set('trust proxy', 1); // un seul proxy de confiance devant Node
}

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10kb' }));

// ─── Socket.io ────────────────────────────────────────────────────────────────
socketService.init(server, corsOrigin);

// ─── Routes HTTP ──────────────────────────────────────────────────────────────
app.use('/', routes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable.` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    // Erreurs du parseur JSON (corps invalide ou trop gros) : erreur du client
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Corps de requête trop volumineux.' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON invalide.' });
    }
    logger.error('[ERROR]', err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
});

module.exports = { app, server };
