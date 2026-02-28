// ========================================
// server.js - Point d'entrée principal avec mediasoup
// ========================================

const express = require('express');
const https = require('https');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

// ✅ Modules existants
const { generateSelfSignedCert } = require('./server/cert-generator');
const { setupSocketHandlers } = require('./server/socket-handlers');
const { displayServerInfo } = require('./server/utils');
const { getICEServers } = require('./server/ice-config');

const app = express();
const PORT = process.env.PORT || 3443;

app.use('/libs', express.static('node_modules'));

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: Date.now()
  });
});

app.get('/api/ice-servers', (req, res) => {
  res.json({ iceServers: getICEServers() });
});

// Configuration SSL
const certPaths = generateSelfSignedCert();
let server, protocol;

if (certPaths) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(certPaths.key),
      cert: fs.readFileSync(certPaths.cert)
    };
    server = https.createServer(httpsOptions, app);
    protocol = 'https';
    console.log('🔒 Mode HTTPS activé');
  } catch (err) {
    console.error('❌ Erreur SSL:', err.message);
    server = http.createServer(app);
    protocol = 'http';
  }
} else {
  server = http.createServer(app);
  protocol = 'http';
  console.log('⚠️  Mode HTTP');
}

// Configuration Socket.IO
const io = socketIo(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  maxHttpBufferSize: 1e8, 
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Initialiser tous les handlers Socket.IO
async function setupAllHandlers() {
  // ✅ Handler partage d'écran (existant)
  setupSocketHandlers(io);
  console.log('✅ Handlers partage d\'écran chargés');
}

// Démarrer le serveur
async function startServer() {
  try {
    // 1. Setup handlers
    await setupAllHandlers();

    // 2. Démarrer le serveur HTTP(S)
    server.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('🚀 SERVEUR ESTLC SHARE SCREEN DÉMARRÉ');
      console.log('═══════════════════════════════════════════════');
      displayServerInfo(protocol, PORT);
      console.log('');
      console.log('📋 Fonctionnalités actives:');
      console.log('   ✅ Partage d\'écran en réseau local (WebRTC P2P)');
      console.log('   ✅ Signalisation via WebSockets');
      
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error.message);
    process.exit(1);
  }
}

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Arrêt du serveur...');
  
  io.close(() => {
    server.close(() => {
      console.log('✅ Serveur arrêté\n');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Signal SIGTERM reçu, arrêt du serveur...');
  server.close(() => {
    console.log('✅ Serveur arrêté');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exception non gérée:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesse rejetée non gérée:', reason);
});

// Lancer le serveur
startServer();
