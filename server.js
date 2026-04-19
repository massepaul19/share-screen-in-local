// ========================================
// server.js — Point d'entrée ESTLC Share Screen
// ========================================

const express  = require('express');
const https    = require('https');
const http     = require('http');
const socketIo = require('socket.io');
const path     = require('path');
const fs       = require('fs');

const { generateSelfSignedCert }          = require('./server/cert-generator');
const { setupSocketHandlers, globalState } = require('./server/socket-handlers');
const { displayServerInfo }               = require('./server/utils');
const pagesRouter                         = require('./routes/pages');
const { router: apiRouter, init: initApi } = require('./routes/api');

const app  = express();
const PORT = process.env.PORT || 3443;

// ── Middleware ────────────────────────────────────────────────
app.use('/libs', express.static('node_modules'));
app.use(express.static('public'));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.use('/',    pagesRouter);
app.use('/api', apiRouter);

// ── SSL ──────────────────────────────────────────────────────
const certPaths = generateSelfSignedCert();
let server, protocol;

if (certPaths) {
  try {
    server   = https.createServer({
      key:  fs.readFileSync(certPaths.key),
      cert: fs.readFileSync(certPaths.cert)
    }, app);
    protocol = 'https';
    console.log('🔒 Mode HTTPS activé');
  } catch (err) {
    console.error('❌ Erreur SSL:', err.message);
    server   = http.createServer(app);
    protocol = 'http';
  }
} else {
  server   = http.createServer(app);
  protocol = 'http';
  console.log('⚠️  Mode HTTP');
}

// ── Socket.IO ─────────────────────────────────────────────────
const io = socketIo(server, {
  cors:              { origin: '*', methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 1e8,
  pingTimeout:       60000,
  pingInterval:      25000,
  transports:        ['websocket', 'polling']
});

// ── Démarrage ─────────────────────────────────────────────────
async function startServer() {
  try {
    // Injecter globalState dans les routes API (pour /api/check-room)
    initApi(globalState);

    // Handlers Socket.IO
    setupSocketHandlers(io);
    console.log('✅ Handlers Socket.IO chargés');

    server.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('🚀 SERVEUR ESTLC SHARE SCREEN DÉMARRÉ');
      console.log('═══════════════════════════════════════════════');
      displayServerInfo(protocol, PORT);
      console.log('');
      console.log('📋 Fonctionnalités actives :');
      console.log('   ✅ Partage d\'écran WebRTC P2P');
      console.log('   ✅ Signalisation via WebSockets');
      console.log('   ✅ Destruction auto des salles vides (15 min)');
      console.log('   ✅ Vérification unicité des codes de salle');
      console.log('   ✅ Gestion micros (mute-all / unmute-all)');
      console.log('   ✅ Routes centralisées dans routes/');
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erreur démarrage:', error.message);
    process.exit(1);
  }
}

// ── Arrêt propre ──────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n⏹️  Arrêt du serveur...');
  io.close(() => server.close(() => { console.log('✅ Arrêté'); process.exit(0); }));
});
process.on('SIGTERM', () => {
  server.close(() => { console.log('✅ Arrêté (SIGTERM)'); process.exit(0); });
});
process.on('uncaughtException',  (err)    => console.error('❌ uncaughtException:',  err.message, err.stack));
process.on('unhandledRejection', (reason) => console.error('❌ unhandledRejection:', reason));

startServer();
