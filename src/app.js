'use strict';

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const socketService = require('./services/socketService');
const routes       = require('./routes/index');
const config       = require('./config');

// Origine CORS vérifiée à chaque requête (ALLOWED_ORIGIN peut en lister plusieurs)
function corsOrigin(origin, cb) {
    cb(null, !origin || config.corsOrigins().includes(origin));
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// ─── Socket.io ────────────────────────────────────────────────────────────────
socketService.init(server, corsOrigin);

// ─── Routes HTTP ──────────────────────────────────────────────────────────────
app.use('/', routes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable.` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
});

module.exports = { app, server };