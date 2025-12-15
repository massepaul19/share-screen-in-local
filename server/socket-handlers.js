// server/socket-handlers.js - Version avec logs WebRTC détaillés
const { getClientIP, detectBrowser, log } = require('./utils');

// État global
const globalState = {
  isSharing: false,
  hostSocketId: null,
  hostName: null,
  connectedUsers: new Map(),
  activeConnections: new Map(), // Tracker les connexions WebRTC
  startTime: Date.now()
};

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const clientIP = getClientIP(socket);
    const browser = detectBrowser(socket.handshake.headers['user-agent']);
    
    log(`🟢 CONNEXION | ${socket.id.slice(0, 6)} | ${browser} | ${clientIP}`);

    // Envoyer l'état initial
    socket.emit('initial-state', {
      isSharing: globalState.isSharing,
      hostName: globalState.hostName,
      hostId: globalState.hostSocketId,
      isYouHost: socket.id === globalState.hostSocketId,
      connectedUsers: globalState.connectedUsers.size
    });

    // ===== REGISTER USER =====
    socket.on('register', (data) => {
      const userName = data.name?.trim() || `User-${socket.id.slice(0, 4)}`;
      
      globalState.connectedUsers.set(socket.id, {
        name: userName,
        ip: clientIP,
        browser,
        joinedAt: new Date().toISOString()
      });

      log(`👤 REGISTER | ${userName} (${browser})`);
      
      io.emit('user-count-update', { 
        count: globalState.connectedUsers.size 
      });
    });

    // ===== REQUEST SHARE =====
    socket.on('request-share', (data) => {
      if (globalState.isSharing && globalState.hostSocketId !== socket.id) {
        log(`⛔ SHARE BLOCKED | ${data.name} | Raison: ${globalState.hostName} partage déjà`);
        
        socket.emit('share-blocked', {
          reason: 'already-sharing',
          currentHost: globalState.hostName
        });
        return;
      }

      log(`✅ SHARE APPROVED | ${data.name} autorisé`);
      
      socket.emit('share-approved', {
        connectedUsers: globalState.connectedUsers.size - 1
      });
    });

    // ===== SHARE STARTED =====
    socket.on('share-started', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = data.name?.trim() || user?.name || `User-${socket.id.slice(0, 4)}`;
      
      globalState.isSharing = true;
      globalState.hostSocketId = socket.id;
      globalState.hostName = userName;

      log(`🎥 SHARE START | ${userName} partage son écran`);

      socket.broadcast.emit('host-started-sharing', {
        hostName: userName,
        hostId: socket.id
      });
    });

    // ===== VIEWER READY =====
    socket.on('viewer-ready', (data) => {
      const viewer = globalState.connectedUsers.get(socket.id);
      const viewerName = viewer?.name || socket.id.slice(0, 6);
      
      log(`👁️  VIEWER READY | ${viewerName} prêt à recevoir`);
      
      const hostSocket = io.sockets.sockets.get(data.hostId);
      if (hostSocket) {
        // Créer un tracker de connexion
        const connectionId = `${data.hostId}-${socket.id}`;
        globalState.activeConnections.set(connectionId, {
          hostId: data.hostId,
          viewerId: socket.id,
          status: 'pending',
          createdAt: Date.now()
        });

        hostSocket.emit('viewer-joined', {
          viewerId: socket.id,
          viewerName: viewerName
        });
        
        log(`📡 DEMANDE ENVOYÉE | Hôte → Viewer ${viewerName}`);
      } else {
        log(`❌ ERREUR | Hôte ${data.hostId} non trouvé`);
        socket.emit('connection-error', {
          error: 'Host not found'
        });
      }
    });

    // ===== STOP SHARE =====
    socket.on('stop-share', () => {
      if (socket.id !== globalState.hostSocketId) return;

      const hostName = globalState.hostName;
      
      log(`⏹️  SHARE STOP | ${hostName} a arrêté`);

      // Nettoyer les connexions actives
      for (const [connId, conn] of globalState.activeConnections) {
        if (conn.hostId === socket.id) {
          globalState.activeConnections.delete(connId);
        }
      }

      globalState.isSharing = false;
      globalState.hostSocketId = null;
      globalState.hostName = null;

      io.emit('host-stopped-sharing', {
        message: `${hostName} a arrêté le partage`,
        previousHost: hostName
      });
    });

    // ===== WEBRTC SIGNALING (AVEC LOGS DÉTAILLÉS) =====
    socket.on('webrtc-offer', (data) => {
      const fromUser = globalState.connectedUsers.get(socket.id);
      const toUser = globalState.connectedUsers.get(data.to);
      
      log(`📤 OFFER | ${fromUser?.name || socket.id.slice(0, 6)} → ${toUser?.name || data.to.slice(0, 6)}`);
      
      const targetSocket = io.sockets.sockets.get(data.to);
      if (targetSocket) {
        targetSocket.emit('webrtc-offer', {
          offer: data.offer,
          from: socket.id
        });
        
        // Mettre à jour le statut
        const connectionId = `${socket.id}-${data.to}`;
        const conn = globalState.activeConnections.get(connectionId);
        if (conn) {
          conn.status = 'offer-sent';
          conn.offerTime = Date.now();
        }
      } else {
        log(`❌ OFFER FAILED | Destination ${data.to.slice(0, 6)} non trouvée`);
        socket.emit('connection-error', { error: 'Peer not found' });
      }
    });

    socket.on('webrtc-answer', (data) => {
      const fromUser = globalState.connectedUsers.get(socket.id);
      const toUser = globalState.connectedUsers.get(data.to);
      
      log(`📥 ANSWER | ${fromUser?.name || socket.id.slice(0, 6)} → ${toUser?.name || data.to.slice(0, 6)}`);
      
      const targetSocket = io.sockets.sockets.get(data.to);
      if (targetSocket) {
        targetSocket.emit('webrtc-answer', {
          answer: data.answer,
          from: socket.id
        });
        
        // Mettre à jour le statut
        const connectionId = `${data.to}-${socket.id}`;
        const conn = globalState.activeConnections.get(connectionId);
        if (conn) {
          conn.status = 'answer-sent';
          conn.answerTime = Date.now();
        }
      } else {
        log(`❌ ANSWER FAILED | Destination ${data.to.slice(0, 6)} non trouvée`);
      }
    });

    socket.on('webrtc-ice', (data) => {
      const targetSocket = io.sockets.sockets.get(data.to);
      if (targetSocket) {
        targetSocket.emit('webrtc-ice', {
          candidate: data.candidate,
          from: socket.id
        });
        
        // Log uniquement le premier ICE candidate
        const connectionId = `${socket.id}-${data.to}`;
        const conn = globalState.activeConnections.get(connectionId);
        if (conn && !conn.iceStarted) {
          conn.iceStarted = true;
          log(`🧊 ICE | Échange de candidats démarré`);
        }
      }
    });

    // ===== NOUVEAU: Confirmation de connexion établie =====
    socket.on('webrtc-connected', (data) => {
      const connectionId = data.hostId === socket.id 
        ? `${socket.id}-${data.peerId}`
        : `${data.peerId}-${socket.id}`;
      
      const conn = globalState.activeConnections.get(connectionId);
      if (conn) {
        conn.status = 'connected';
        conn.connectedAt = Date.now();
        
        const duration = conn.connectedAt - conn.createdAt;
        const fromUser = globalState.connectedUsers.get(socket.id);
        
        log(`✅ WEBRTC CONNECTÉ | ${fromUser?.name || socket.id.slice(0, 6)} (${duration}ms)`);
      }
    });

    // ===== NOUVEAU: Erreur de connexion WebRTC =====
    socket.on('webrtc-error', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      log(`❌ WEBRTC ERROR | ${user?.name || socket.id.slice(0, 6)} | ${data.error}`);
      
      // Nettoyer la connexion échouée
      for (const [connId, conn] of globalState.activeConnections) {
        if (conn.hostId === socket.id || conn.viewerId === socket.id) {
          globalState.activeConnections.delete(connId);
        }
      }
    });

    // ===== DISCONNECT =====
    socket.on('disconnect', () => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || 'Inconnu';
      
      log(`🔴 DÉCONNEXION | ${userName} (${browser})`);

      // Nettoyer les connexions actives
      for (const [connId, conn] of globalState.activeConnections) {
        if (conn.hostId === socket.id || conn.viewerId === socket.id) {
          globalState.activeConnections.delete(connId);
          log(`🗑️  Connexion ${connId} nettoyée`);
        }
      }

      if (socket.id === globalState.hostSocketId) {
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

    // ===== DEBUG: Afficher l'état des connexions toutes les 30s =====
    setInterval(() => {
      if (globalState.activeConnections.size > 0) {
        log(`📊 Connexions actives: ${globalState.activeConnections.size}`);
        for (const [connId, conn] of globalState.activeConnections) {
          const age = Date.now() - conn.createdAt;
          log(`   ${connId.slice(0, 20)}... | ${conn.status} | ${(age/1000).toFixed(1)}s`);
        }
      }
    }, 30000);
  });
}

module.exports = { setupSocketHandlers, globalState };
