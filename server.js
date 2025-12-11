// server.js - Serveur de partage d'écran réseau local - VERSION CORRIGÉE
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = 3000;

// État global
let globalState = {
  isSharing: false,
  hostSocketId: null,
  hostName: null,
  connectedUsers: new Map(),
  startTime: null
};

// Middleware
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    isSharing: globalState.isSharing,
    hostName: globalState.hostName,
    connectedUsers: globalState.connectedUsers.size,
    uptime: globalState.startTime ? Date.now() - globalState.startTime : 0
  });
});

function getClientIP(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address.replace('::ffff:', '');
}

// Socket.io
io.on('connection', (socket) => {
  const clientIP = getClientIP(socket);
  const joinTime = new Date().toLocaleTimeString();
  
  console.log(`[${joinTime}] 🟢 CONNEXION | Socket: ${socket.id.slice(0, 6)} | IP: ${clientIP}`);

  socket.emit('initial-state', {
    isSharing: globalState.isSharing,
    hostName: globalState.hostName,
    hostId: globalState.hostSocketId,
    isYouHost: socket.id === globalState.hostSocketId,
    connectedUsers: globalState.connectedUsers.size
  });

  socket.on('register', (data) => {
    const userName = (data.name && data.name.trim()) || `User-${socket.id.slice(0, 4)}`;
    
    globalState.connectedUsers.set(socket.id, {
      name: userName,
      ip: clientIP,
      joinedAt: new Date().toISOString()
    });

    console.log(`[${new Date().toLocaleTimeString()}] 👤 REGISTER | ${userName} (${clientIP})`);

    io.emit('user-count-update', {
      count: globalState.connectedUsers.size
    });
  });

  // Demande de partage d'écran
  socket.on('request-share', (data) => {
    if (globalState.isSharing && globalState.hostSocketId !== socket.id) {
      console.log(`[${new Date().toLocaleTimeString()}] ⛔ SHARE BLOCKED | ${data.name} | Raison: ${globalState.hostName} partage déjà`);
      
      socket.emit('share-blocked', {
        reason: 'already-sharing',
        currentHost: globalState.hostName
      });
      return;
    }

    const userName = (data.name && data.name.trim()) || `User-${socket.id.slice(0, 4)}`;
    
    console.log(`[${new Date().toLocaleTimeString()}] ✅ SHARE APPROVED | ${userName} autorisé à partager`);

    // NE PAS METTRE À JOUR globalState ICI !
    // On attend la confirmation que la capture a réussi

    socket.emit('share-approved', {
      connectedUsers: globalState.connectedUsers.size - 1
    });
  });

  // NOUVEAU: Confirmation que la capture a réussi
  socket.on('share-started', (data) => {
    const user = globalState.connectedUsers.get(socket.id);
    const userName = (data.name && data.name.trim()) || 
                     (user && user.name) || 
                     `User-${socket.id.slice(0, 4)}`;
    
    // MAINTENANT on met à jour l'état global
    globalState.isSharing = true;
    globalState.hostSocketId = socket.id;
    globalState.hostName = userName;

    console.log(`[${new Date().toLocaleTimeString()}] 🎥 SHARE START | ${userName} partage confirmé`);

    // Notifier tous les autres
    socket.broadcast.emit('host-started-sharing', {
      hostName: userName,
      hostId: socket.id
    });
  });

  socket.on('viewer-ready', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] 👁️  VIEWER READY | Socket ${socket.id.slice(0, 6)} prêt à recevoir`);
    
    const hostSocket = io.sockets.sockets.get(data.hostId);
    if (!hostSocket) {
      console.log(`[${new Date().toLocaleTimeString()}] ❌ ERREUR: Hôte ${data.hostId} non trouvé`);
      return;
    }
    
    hostSocket.emit('viewer-joined', {
      viewerId: socket.id
    });
    
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Signal viewer-joined envoyé`);
  });

  socket.on('stop-share', () => {
    // Vérifier que c'est bien l'hôte
    if (socket.id !== globalState.hostSocketId) {
      console.log(`[${new Date().toLocaleTimeString()}] ⚠️  STOP IGNORED | ${socket.id.slice(0, 6)} n'est pas l'hôte`);
      return;
    }

    const hostName = globalState.hostName;
    
    console.log(`[${new Date().toLocaleTimeString()}] ⏹️  SHARE STOP | ${hostName} a arrêté le partage`);

    globalState.isSharing = false;
    globalState.hostSocketId = null;
    globalState.hostName = null;

    io.emit('host-stopped-sharing', {
      message: `${hostName} a arrêté le partage`,
      previousHost: hostName
    });
  });

  // WebRTC Signaling
  socket.on('webrtc-offer', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] 📤 WebRTC Offer: ${socket.id.slice(0, 6)} → ${data.to.slice(0, 6)}`);
    socket.to(data.to).emit('webrtc-offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] 📤 WebRTC Answer: ${socket.id.slice(0, 6)} → ${data.to.slice(0, 6)}`);
    socket.to(data.to).emit('webrtc-answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('webrtc-ice', (data) => {
    socket.to(data.to).emit('webrtc-ice', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on('disconnect', () => {
    const user = globalState.connectedUsers.get(socket.id);
    const userName = (user && user.name) || 'Inconnu';
    
    console.log(`[${new Date().toLocaleTimeString()}] 🔴 DÉCONNEXION | ${userName} | Socket: ${socket.id.slice(0, 6)}`);

    if (socket.id === globalState.hostSocketId) {
      console.log(`[${new Date().toLocaleTimeString()}] ⚠️  HOST DISCONNECT | ${userName} s'est déconnecté pendant le partage`);
      
      globalState.isSharing = false;
      globalState.hostSocketId = null;
      globalState.hostName = null;

      io.emit('host-stopped-sharing', {
        message: `${userName} s'est déconnecté`,
        previousHost: userName,
        reason: 'disconnect'
      });
    }

    globalState.connectedUsers.delete(socket.id);

    io.emit('user-count-update', {
      count: globalState.connectedUsers.size
    });
  });

  socket.on('ping', () => socket.emit('pong'));
});

function getAllNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name in interfaces) {
    const nets = interfaces[name];
    for (let i = 0; i < nets.length; i++) {
      const net = nets[i];
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address
        });
      }
    }
  }

  return addresses;
}

server.listen(PORT, '0.0.0.0', () => {
  const allIPs = getAllNetworkIPs();
  
  globalState.startTime = Date.now();

  console.clear();
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 SERVEUR DE PARTAGE D\'ÉCRAN - RÉSEAU LOCAL (avec TURN)');
  console.log('═'.repeat(80));
  console.log('\n📡 URLs D\'ACCÈS :\n');

  if (allIPs.length === 0) {
    console.log('   ⚠️  Aucune interface réseau détectée');
    console.log(`   ➜  http://localhost:${PORT}\n`);
  } else {
    allIPs.forEach(function(item) {
      const iface = item.interface;
      const address = item.address;
      const icon = iface.toLowerCase().includes('wi') || iface.toLowerCase().includes('wlan') ? '📶' : '🔌';
      console.log(`   ${icon}  ${iface.padEnd(20)} → http://${address}:${PORT}`);
    });
    console.log('');
  }

  console.log('💡 INSTRUCTIONS :\n');
  console.log('   1️⃣  Partagez l\'URL à tous les participants');
  console.log('   2️⃣  Cliquez "Partager mon écran"');
  console.log('   3️⃣  Sélectionnez l\'écran dans la popup');
  console.log('   4️⃣  Les autres voient automatiquement');

  console.log('\n⚙️  ÉTAT DU SERVEUR :\n');
  console.log(`   Port : ${PORT}`);
  console.log(`   PID  : ${process.pid}`);
  console.log(`   Node : ${process.version}`);

  console.log('\n' + '═'.repeat(80));
  console.log('✅ Serveur prêt ! En attente de connexions...');
  console.log('═'.repeat(80) + '\n');
});

process.on('uncaughtException', (err) => {
  console.error('\n❌ ERREUR CRITIQUE:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ PROMESSE REJETÉE:', reason);
});

process.on('SIGINT', () => {
  console.log('\n\n⏹️  Arrêt du serveur...');
  
  io.emit('server-shutdown', {
    message: 'Le serveur s\'arrête'
  });

  io.close(() => {
    server.close(() => {
      console.log('✅ Serveur arrêté proprement\n');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('⚠️  Arrêt forcé');
    process.exit(1);
  }, 5000);
});
