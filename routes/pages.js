// ============================================================
// routes/pages.js — Routes HTML de l'application Share Screen
// ============================================================

const express = require('express');
const path    = require('path');
const router  = express.Router();

const pub = (f) => path.join(__dirname, '..', 'public', f);

// Page d'accueil
router.get('/', (_req, res) => res.sendFile(pub('index.html')));

// Salle de partage (avec ou sans .html)
router.get('/room',      (_req, res) => res.sendFile(pub('room.html')));
router.get('/room.html', (_req, res) => res.sendFile(pub('room.html')));

// À propos
router.get('/a-propos',      (_req, res) => res.sendFile(pub('a-propos.html')));
router.get('/a-propos.html', (_req, res) => res.sendFile(pub('a-propos.html')));

module.exports = router;
