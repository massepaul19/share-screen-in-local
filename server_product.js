// ============================================================
// server_product.js — Serveur PRODUCTION ESTLC Share Screen
// Auteur : MASSE MASSE PAUL-BASTHYLLE
//
// ARCHITECTURE PRODUCTION :
//   Internet → NGINX (HTTPS/443 + Let's Encrypt) → Node.js (HTTP/3443)
//
// NGINX gère  : SSL/TLS, WebSocket proxy, headers sécurité
// Node.js gère: Socket.IO signaling, WebRTC, API REST
//
// DÉMARRAGE :
//   PORT=3443 NODE_ENV=production node server_product.js
//   ou avec PM2 : pm2 start server_product.js --name share-screen
//
// PORTS :
//   443/tcp  — NGINX HTTPS (Let's Encrypt)
//   80/tcp   — NGINX HTTP (redirection + renouvellement certbot)
//   3443/tcp — Node.js (127.0.0.1 uniquement, jamais exposé)
// ============================================================

// PAS de dotenv — variables injectées par PM2 ecosystem
// ou passées directement : PORT=3443 node server_product.js

const express  = require('express');
const http     = require('http');
const socketIo = require('socket.io');
const path     = require('path');

const { setupSocketHandlers, globalState } = require('./server/socket-handlers');
const { getICEServers }                  = require('./server/ice-config');
const { displayServerInfo }               = require('./server/utils');
const pagesRouter                         = require('./routes/pages');
const { router: apiRouter, init: initApi } = require('./routes/api');

const app  = express();
const PORT = parseInt(process.env.PORT || '3443', 10);

// ── Middleware ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag:   true
}));
app.use('/libs', express.static(path.join(__dirname, 'node_modules')));
app.use(express.json({ limit: '10kb' }));
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use('/',    pagesRouter);
app.use('/api', apiRouter);

// ── Serveur HTTP ──────────────────────────────────────────────
const server = http.createServer(app);
server.keepAliveTimeout = 120000;
server.headersTimeout   = 125000;

// ── Socket.IO ─────────────────────────────────────────────────
const io = socketIo(server, {
  cors: {
    origin:      'https://share-screen.services-ztf.com',
    methods:     ['GET', 'POST'],
    credentials: true
  },
  transports:        ['websocket'],
  allowUpgrades:     false,
  pingTimeout:       20000,
  pingInterval:      8000,
  maxHttpBufferSize: 1e8,
  perMessageDeflate: false
});

// ── Démarrage ─────────────────────────────────────────────────
async function startServer() {
  try {
    // Injecter globalState dans les routes API pour /api/check-room et /api/status
    initApi(globalState);

    setupSocketHandlers(io);
    console.log('✅ Handlers Socket.IO chargés');

    server.listen(PORT, '127.0.0.1', () => {
      console.log('');
      console.log('════════════════════════════════════════════════════════');
      console.log('🚀  ESTLC SHARE SCREEN — PRODUCTION');
      console.log('════════════════════════════════════════════════════════');
      displayServerInfo('http', PORT);
      console.log(`🔒  SSL géré par       : NGINX + Let's Encrypt`);
      console.log(`🌍  URL publique       : https://share-screen.services-ztf.com`);
      console.log(`⚙️   NODE_ENV           : ${process.env.NODE_ENV || 'non défini'}`);
      console.log('════════════════════════════════════════════════════════');
      console.log('📋  Fonctionnalités actives :');
      console.log("    ✅ Partage d'écran WebRTC P2P");
      console.log('    ✅ Signalisation Socket.IO (WebSocket pur)');
      console.log("    ✅ HTTPS via NGINX + Let's Encrypt");
      console.log('════════════════════════════════════════════════════════');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error.message);
    process.exit(1);
  }
}

// ── Arrêt propre ──────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n⛔ ${signal} — arrêt propre...`);
  try { io.emit('server-shutdown', { reason: 'maintenance' }); } catch (_) {}
  io.close(() => {
    server.close(() => {
      console.log('✅ Serveur arrêté proprement');
      process.exit(0);
    });
  });
  setTimeout(() => { console.log('⚠️  Arrêt forcé'); process.exit(1); }, 5000);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException',  (err)    => console.error('❌ uncaughtException:',  err.message, err.stack));
process.on('unhandledRejection', (reason) => console.error('❌ unhandledRejection:', reason));

startServer();
