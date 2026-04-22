'use strict';

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const socketService = require('./services/socketService');
const routes       = require('./routes/index');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:8000';

// ─── Express ──────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// ─── Socket.io ────────────────────────────────────────────────────────────────
socketService.init(server, ALLOWED_ORIGIN);

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