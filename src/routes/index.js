'use strict';

const express    = require('express');
const router     = express.Router();

const config                = require('../config');
const { requireSecret }     = require('../middlewares/requireSecret');
const healthController      = require('../controllers/healthController');
const ventilateurController = require('../controllers/ventilateurController');
const brumisateurController = require('../controllers/brumisateurController');
const capteurController     = require('../controllers/capteurController');
const alerteController      = require('../controllers/alerteController');

// ─── Santé du serveur ─────────────────────────────────────────────────────────
router.get('/health', healthController.check);

// Debug : introuvable en production, protégé par le secret sinon
router.get('/states', (req, res, next) => {
    if (config.isProduction()) {
        return res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable.` });
    }
    return requireSecret(req, res, next);
}, healthController.states);

// ─── Webhooks entrants depuis Laravel (en-tête X-WS-Secret) ───────────────────
router.use('/broadcast', requireSecret);

// Ventilateurs (vitesse + mode contrôleur)
router.post('/broadcast/ventilateur', ventilateurController.broadcast);

// Brumisateurs (état marche/arrêt + durées de cycle)
router.post('/broadcast/brumisateur', brumisateurController.broadcast);

// Capteurs THI (température, humidité, ITH)
router.post('/broadcast/capteur', capteurController.broadcast);

// Alertes (ITH critique, seuil dépassé, etc.)
router.post('/broadcast/alerte', alerteController.broadcast);

module.exports = router;
