// ============================================================
// routes/api.js — API REST de l'application Share Screen
// ============================================================

const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const { getICEServers } = require('../server/ice-config');

// Référence vers le globalState de socket-handlers (injecté via init())
let _globalState = null;

function init(globalState) {
  _globalState = globalState;
}

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Générer un nom unique avec timestamp
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    // Types de fichiers autorisés
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
      'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/flac',
      'application/pdf'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'), false);
    }
  }
});

// GET /api/status — Santé du serveur
router.get('/status', (_req, res) => {
  res.json({
    status:    'online',
    timestamp: Date.now(),
    env:       process.env.NODE_ENV || 'development',
    rooms:     _globalState ? _globalState.rooms.size : 0,
    users:     _globalState ? _globalState.connectedUsers.size : 0
  });
});

// GET /api/ice-servers — Configuration ICE pour WebRTC
router.get('/ice-servers', (_req, res) => {
  res.json({ iceServers: getICEServers() });
});

// GET /api/check-room/:code — Vérifie si un code de salle est déjà utilisé
// Retourne { exists: true/false, userCount: N }
router.get('/check-room/:code', (req, res) => {
  if (!_globalState) return res.json({ exists: false, userCount: 0 });

  const code      = req.params.code?.toLowerCase().trim();
  const roomState = _globalState.rooms.get(code);

  if (!roomState) {
    return res.json({ exists: false, userCount: 0 });
  }

  // La salle existe — compter les users actifs dedans
  const userCount = Array.from(_globalState.connectedUsers.values())
    .filter(u => u.room === code).length;

  res.json({ exists: true, userCount });
});

// POST /api/upload — Upload de fichiers pour le partage de contenu
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier reçu' });
    }

    // Générer l'URL accessible du fichier
    const fileUrl = `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      fileUrl: fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
  }
});

// Servir les fichiers uploadés statiquement
router.use('/uploads', express.static(path.join(__dirname, '../uploads')));

module.exports = { router, init };
