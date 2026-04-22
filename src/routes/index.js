'use strict';

const express    = require('express');
const router     = express.Router();

const healthController     = require('../controllers/healthController');
const ventilateurController = require('../controllers/ventilateurController');
const capteurController    = require('../controllers/capteurController');
const alerteController     = require('../controllers/alerteController');

// ─── Santé du serveur ─────────────────────────────────────────────────────────
router.get('/health', healthController.check);
router.get('/states', healthController.states);

// ─── Webhooks entrants depuis Laravel ─────────────────────────────────────────

// Ventilateurs (vitesse + mode contrôleur)
router.post('/broadcast/ventilateur', ventilateurController.broadcast);

// Capteurs THI (température, humidité, ITH)
router.post('/broadcast/capteur', capteurController.broadcast);

// Alertes (ITH critique, seuil dépassé, etc.)
router.post('/broadcast/alerte', alerteController.broadcast);

module.exports = router;