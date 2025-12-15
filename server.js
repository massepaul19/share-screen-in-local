// server.js - Point d'entrée principal
const express = require('express');
const https = require('https');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

// Importer les modules
const { generateSelfSignedCert } = require('./server/cert-generator');
const { setupSocketHandlers } = require('./server/socket-handlers');
const { displayServerInfo } = require('./server/utils');
const { getICEServers } = require('./server/ice-config');

const app = express();
const PORT = process.env.PORT || 3443;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// ✅ AJOUT: Route pour la page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes API
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

// Initialiser les handlers Socket.IO
setupSocketHandlers(io);

// Démarrer le serveur
server.listen(PORT, '0.0.0.0', () => {
  displayServerInfo(protocol, PORT);
});

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
