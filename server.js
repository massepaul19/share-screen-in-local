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

// 🆕 Modules mediasoup
const { RoomManager } = require('./server/room-manager');
const { setupVideoCallHandlers } = require('./server/videocall-handlers');
const { setupAudioCallHandlers } = require('./server/audiocall-handlers');

const app = express();
const PORT = process.env.PORT || 3443;

//Ici j'importe le module afin de rgler le problème de mediasoup

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

// 🆕 Initialiser mediasoup
const roomManager = new RoomManager();

async function initMediasoup() {
  try {
    await roomManager.init();
    console.log('✅ mediasoup initialisé avec succès');
    console.log(`   Workers: ${roomManager.workers.length}`);
  } catch (error) {
    console.error('❌ Erreur initialisation mediasoup:', error.message);
    // Ne pas exit, continuer sans mediasoup
    console.log('⚠️  Serveur continue sans mediasoup (partage d\'écran fonctionnera)');
  }
}

// Initialiser tous les handlers Socket.IO
async function setupAllHandlers() {
  // ✅ Handler partage d'écran (existant)
  setupSocketHandlers(io);
  console.log('✅ Handlers partage d\'écran chargés');

  // 🆕 Handlers appel vidéo (si mediasoup ok)
  if (roomManager.workers.length > 0) {
    setupVideoCallHandlers(io, roomManager);
    console.log('✅ Handlers appel vidéo chargés');

    setupAudioCallHandlers(io, roomManager);
    console.log('✅ Handlers appel audio chargés');
  } else {
    console.log('⚠️  Appels vidéo/audio non disponibles (mediasoup non chargé)');
  }
}

// Démarrer le serveur
async function startServer() {
  try {
    // 1. Initialiser mediasoup (optionnel)
    await initMediasoup();

    // 2. Setup handlers
    await setupAllHandlers();

    // 3. Démarrer le serveur HTTP(S)
    server.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('🚀 SERVEUR ESTLC SHARE SCREEN DÉMARRÉ');
      console.log('═══════════════════════════════════════════════');
      displayServerInfo(protocol, PORT);
      console.log('');
      console.log('📋 Fonctionnalités actives:');
      console.log('   ✅ Partage d\'écran WebRTC (P2P)');
      console.log('   ✅ Chat en temps réel');
      console.log('   ✅ Réactions vidéo');
      console.log('   ✅ Demandes de partage');
      
      if (roomManager.workers.length > 0) {
        console.log('   ✅ Appels vidéo de groupe (SFU)');
        console.log('   ✅ Appels audio de groupe (SFU)');
        console.log('');
        console.log(`💾 Workers mediasoup: ${roomManager.workers.length}`);
        console.log(`🔧 Ports WebRTC: 40000-49999`);
      }
      
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('');
    });

    // Stats périodiques (optionnel)
    setInterval(() => {
      const rooms = roomManager.getAllRooms();
      const totalParticipants = rooms.reduce((sum, room) => 
        sum + room.participants.size, 0
      );

      if (rooms.length > 0) {
        console.log('📊 Rooms actives:', rooms.length, '| Participants:', totalParticipants);
      }
    }, 300000); // Toutes les 5 minutes

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error.message);
    process.exit(1);
  }
}

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Arrêt du serveur...');
  
  // Fermer les rooms mediasoup
  if (roomManager) {
    const rooms = roomManager.getAllRooms();
    rooms.forEach(room => {
      try {
        roomManager.deleteRoom(room.roomId);
      } catch (err) {
        console.error('Erreur fermeture room:', err.message);
      }
    });
  }
  
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

// ========================================
// 📚 COURS : COMPRENDRE LES MODIFICATIONS
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│              🆕 CHANGEMENTS PAR RAPPORT À L'ORIGINAL            │
└─────────────────────────────────────────────────────────────────┘

1️⃣ IMPORTS AJOUTÉS
   const { RoomManager } = require('./server/room-manager');
   const { setupVideoCallHandlers } = require('./server/videocall-handlers');
   const { setupAudioCallHandlers } = require('./server/audiocall-handlers');

2️⃣ NOUVELLE INSTANCE
   const roomManager = new RoomManager();
   → Gère les salles d'appels vidéo/audio

3️⃣ FONCTION initMediasoup()
   → Initialise les workers mediasoup au démarrage
   → Si échec : serveur continue (partage d'écran fonctionnera)

4️⃣ FONCTION setupAllHandlers()
   → Setup handlers partage d'écran (existant)
   → Setup handlers vidéo/audio (si mediasoup ok)

5️⃣ FONCTION startServer()
   → Remplace le code de démarrage direct
   → Gère l'initialisation async
   → Affiche les fonctionnalités actives

6️⃣ SIGINT MODIFIÉ
   → Ferme les rooms mediasoup avant d'arrêter
   → Évite les connexions zombies


┌─────────────────────────────────────────────────────────────────┐
│              🔄 FLUX DE DÉMARRAGE                               │
└─────────────────────────────────────────────────────────────────┘

1. startServer() appelé
2. initMediasoup()
   → Crée workers (1 par CPU)
   → Si échec : continue sans mediasoup
3. setupAllHandlers()
   → Charge handlers partage d'écran
   → Si mediasoup ok : charge handlers vidéo/audio
4. server.listen()
   → Démarre le serveur
   → Affiche les infos
5. setInterval()
   → Stats périodiques toutes les 5 min


┌─────────────────────────────────────────────────────────────────┐
│              🛡️ GESTION D'ERREUR ROBUSTE                       │
└─────────────────────────────────────────────────────────────────┘

Si mediasoup échoue :
- Le serveur CONTINUE de démarrer
- Partage d'écran + chat FONCTIONNENT
- Appels vidéo/audio DÉSACTIVÉS

Avantage :
→ Ton serveur ne crash pas si mediasoup a un problème


┌─────────────────────────────────────────────────────────────────┐
│              📊 LOGS AMÉLIORÉS                                  │
└─────────────────────────────────────────────────────────────────┘

Au démarrage, affiche :
✅ Mode HTTPS activé
✅ mediasoup initialisé (X workers)
✅ Handlers partage d'écran chargés
✅ Handlers appel vidéo chargés
✅ Handlers appel audio chargés

Puis :
🚀 SERVEUR DÉMARRÉ
📋 Fonctionnalités actives
   ✅ Partage d'écran
   ✅ Chat
   ✅ Appels vidéo (SFU)
   ✅ Appels audio (SFU)
💾 Workers: X
🔧 Ports: 40000-49999


┌─────────────────────────────────────────────────────────────────┐
│              🔧 COMPATIBILITÉ                                   │
└─────────────────────────────────────────────────────────────────┘

✅ COMPATIBLE avec ton code existant :
- cert-generator.js
- socket-handlers.js
- utils.js
- ice-config.js
- Tous tes fichiers client (app.js, chat.js, etc.)

🆕 AJOUTE simplement :
- room-manager.js
- videocall-handlers.js
- audiocall-handlers.js
- videocall.js, audiocall.js, UI, CSS


┌─────────────────────────────────────────────────────────────────┐
│              ⚙️ CONFIGURATION                                   │
└─────────────────────────────────────────────────────────────────┘

Variables d'environnement :
PORT=3443 node server.js

Aucune autre config nécessaire !
mediasoup-config.js gère tout automatiquement.


┌─────────────────────────────────────────────────────────────────┐
│              🧪 TEST                                            │
└─────────────────────────────────────────────────────────────────┘

1. Installer mediasoup :
   npm install mediasoup

2. Lancer le serveur :
   node server.js

3. Vérifier les logs :
   ✅ mediasoup initialisé → OK
   ✅ Handlers chargés → OK

4. Ouvrir https://localhost:3443
   → Onglet "Partage d'écran" : fonctionne
   → Onglet "Appel vidéo" : fonctionne
   → Onglet "Appel audio" : fonctionne


┌─────────────────────────────────────────────────────────────────┐
│              ❓ FAQ                                             │
└─────────────────────────────────────────────────────────────────┘

Q: Si mediasoup échoue, le serveur crash ?
R: Non ! Le serveur continue et partage d'écran fonctionne.
   Seuls les appels vidéo/audio sont désactivés.

Q: Combien de CPU/RAM nécessaire ?
R: Minimum : 2 CPU, 2 GB RAM
   Recommandé : 4 CPU, 4 GB RAM

Q: Peut-on désactiver mediasoup temporairement ?
R: Oui, commenter ces lignes :
   // await initMediasoup();
   → Serveur démarre sans mediasoup

Q: Les ports 40000-49999 sont obligatoires ?
R: Oui pour mediasoup. Configurable dans mediasoup-config.js
   Pas besoin de les ouvrir sur réseau local.

Q: Compatibilité avec PM2 / Docker ?
R: Oui ! Fonctionne parfaitement.
   PM2 : pm2 start server.js
   Docker : Voir exemple dans README
*/
