// server/socket-handlers.js - Version finale avec chat amélioré (mentions + réponses)
const { getClientIP, detectBrowser, log } = require('./utils');

// État global
const globalState = {
  isSharing: false,
  hostSocketId: null,
  hostName: null,
  connectedUsers: new Map(),
  activeConnections: new Map(),
  chatMessages: new Map(), // Stockage des messages pour les réponses
  startTime: Date.now()
};

// ===== UTILITAIRE: Diffuser la liste des utilisateurs actifs =====
function broadcastUsersUpdate(io) {
  const users = Array.from(globalState.connectedUsers.values()).map(user => ({
    id: user.socketId,
    name: user.name
  }));
  
  io.emit('users-update', users);
  log(`👥 USERS UPDATE | ${users.length} utilisateur(s) actif(s)`);
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const clientIP = getClientIP(socket);
    const browser = detectBrowser(socket.handshake.headers['user-agent']);
    
    log(`🟢 CONNEXION | ${socket.id.slice(0, 6)} | ${browser} | ${clientIP}`);

    // Créer l'utilisateur par défaut
    const defaultName = `User-${socket.id.slice(0, 4)}`;
    globalState.connectedUsers.set(socket.id, {
      socketId: socket.id,
      name: defaultName,
      ip: clientIP,
      browser,
      joinedAt: new Date().toISOString()
    });

    // Envoyer l'état initial
    socket.emit('initial-state', {
      isSharing: globalState.isSharing,
      hostName: globalState.hostName,
      hostId: globalState.hostSocketId,
      isYouHost: socket.id === globalState.hostSocketId,
      connectedUsers: globalState.connectedUsers.size
    });

    // Diffuser la liste des utilisateurs mise à jour
    broadcastUsersUpdate(io);

    // ===== REGISTER USER =====
    socket.on('register', (data) => {
      const userName = data.name?.trim() || `User-${socket.id.slice(0, 4)}`;
      
      // Mettre à jour l'utilisateur
      const user = globalState.connectedUsers.get(socket.id);
      if (user) {
        user.name = userName;
        globalState.connectedUsers.set(socket.id, user);
      }

      log(`👤 REGISTER | ${userName} (${browser})`);
      
      io.emit('user-count-update', { 
        count: globalState.connectedUsers.size 
      });
      
      // Diffuser la liste mise à jour
      broadcastUsersUpdate(io);
    });

    // ===== UPDATE NAME (depuis le chat) =====
    socket.on('update-name', (data) => {
      const newName = data.name?.trim();
      const user = globalState.connectedUsers.get(socket.id);
      
      if (user && newName) {
        const oldName = user.name;
        user.name = newName;
        globalState.connectedUsers.set(socket.id, user);
        
        log(`✏️  UPDATE NAME | ${oldName} → ${newName}`);
        
        // Si l'utilisateur est en train de partager, mettre à jour le nom affiché
        if (socket.id === globalState.hostSocketId) {
          globalState.hostName = newName;
          io.emit('host-name-updated', {
            newName: newName
          });
        }
        
        // Message système optionnel pour informer du changement de nom
        io.emit('system-message', {
          type: 'name-change',
          text: `${oldName} est maintenant ${newName}`,
          timestamp: new Date().toISOString()
        });
        
        // Diffuser la liste des utilisateurs mise à jour
        broadcastUsersUpdate(io);
      }
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
      
      // Mettre à jour le nom dans connectedUsers
      if (user) {
        user.name = userName;
        globalState.connectedUsers.set(socket.id, user);
      }
      
      globalState.isSharing = true;
      globalState.hostSocketId = socket.id;
      globalState.hostName = userName;

      log(`🎥 SHARE START | ${userName} partage son écran`);

      socket.broadcast.emit('host-started-sharing', {
        hostName: userName,
        hostId: socket.id
      });
      
      // Diffuser la liste des utilisateurs mise à jour
      broadcastUsersUpdate(io);
    });

    // ===== VIEWER READY =====
    socket.on('viewer-ready', (data) => {
      const viewer = globalState.connectedUsers.get(socket.id);
      const viewerName = viewer?.name || `User-${socket.id.slice(0, 4)}`;
      
      log(`👁️  VIEWER READY | ${viewerName} prêt à recevoir`);
      
      const hostSocket = io.sockets.sockets.get(data.hostId);
      if (hostSocket) {
        const connectionId = `${data.hostId}-${socket.id}`;
        globalState.activeConnections.set(connectionId, {
          hostId: data.hostId,
          viewerId: socket.id,
          viewerName: viewerName,
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

    // ===== WEBRTC SIGNALING =====
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
        
        const connectionId = `${socket.id}-${data.to}`;
        const conn = globalState.activeConnections.get(connectionId);
        if (conn) {
          conn.status = 'offer-sent';
          conn.offerTime = Date.now();
        }
      } else {
        log(`❌ OFFER FAILED | Destination ${data.to.slice(0, 6)} non trouvée`);
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
      }
    });

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

    socket.on('webrtc-error', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      log(`❌ WEBRTC ERROR | ${user?.name || socket.id.slice(0, 6)} | ${data.error}`);
      
      for (const [connId, conn] of globalState.activeConnections) {
        if (conn.hostId === socket.id || conn.viewerId === socket.id) {
          globalState.activeConnections.delete(connId);
        }
      }
    });

    // ===== ✨ GESTION DES RÉACTIONS VIDÉO =====
    socket.on('video-reaction', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = data.userName || user?.name || 'Anonyme';

      log(`✨ REACTION | ${userName} a envoyé ${data.emoji}`);

      // Diffuser à tous les autres clients
      socket.broadcast.emit('video-reaction', {
        emoji: data.emoji,
        userName: userName
      });
    });


    // ===== 💬 GESTION DU CHAT AMÉLIORÉ =====
    
    // Envoi de message avec support des réponses
    socket.on('send-message', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || `User-${socket.id.slice(0, 4)}`;
      
      // Générer un ID unique pour le message
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const message = {
        id: messageId,
        senderId: socket.id,
        senderName: userName,
        text: data.text,
        timestamp: Date.now(),
        replyTo: data.replyTo || null // ID du message auquel on répond
      };
      
      // Stocker le message pour les réponses futures
      globalState.chatMessages.set(messageId, message);
      
      // Log avec indication de réponse
      const logText = data.replyTo 
        ? `💬 REPLY | ${userName} → ${data.text.substring(0, 40)}${data.text.length > 40 ? '...' : ''}`
        : `💬 MESSAGE | ${userName}: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`;
      log(logText);
      
      // Envoyer à tous (y compris l'expéditeur)
      io.emit('new-message', message);
      
      // Nettoyer les vieux messages (garder seulement les 100 derniers)
      if (globalState.chatMessages.size > 100) {
        const oldestKey = globalState.chatMessages.keys().next().value;
        globalState.chatMessages.delete(oldestKey);
      }
    });

    // Indicateur de frappe
    socket.on('typing', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || `User-${socket.id.slice(0, 4)}`;
      
      // Envoyer à tous sauf l'expéditeur
      socket.broadcast.emit('user-typing', {
        userId: socket.id,
        userName: userName,
        isTyping: data.isTyping
      });
    });

    // Demander l'historique des messages (optionnel)
    socket.on('request-chat-history', () => {
      const messages = Array.from(globalState.chatMessages.values())
        .slice(-50); // Envoyer les 50 derniers messages
      
      socket.emit('chat-history', { messages });
      log(`📜 HISTORY | Envoi de ${messages.length} messages à ${socket.id.slice(0, 6)}`);
    });

    // ===== 📢 GESTION DES DEMANDES DE PARTAGE =====
    
    // Réception d'une demande de partage
    socket.on('send-share-request', (data) => {
      const requester = globalState.connectedUsers.get(socket.id);
      const requesterName = data.name || requester?.name || `User-${socket.id.slice(0, 4)}`;
      
      log(`📥 SHARE REQUEST | ${requesterName} → Hôte ${data.targetHostId.slice(0, 6)}`);
      
      // Vérifier que l'hôte existe et partage toujours
      const targetSocket = io.sockets.sockets.get(data.targetHostId);
      
      if (!targetSocket) {
        log(`   ❌ Hôte ${data.targetHostId.slice(0, 6)} introuvable`);
        socket.emit('share-request-denied');
        return;
      }
      
      // Vérifier que l'hôte partage toujours
      if (data.targetHostId !== globalState.hostSocketId) {
        log(`   ❌ ${data.targetHostId.slice(0, 6)} ne partage plus`);
        socket.emit('share-request-denied');
        return;
      }
      
      // Envoyer la notification à l'hôte
      io.to(data.targetHostId).emit('share-request-received', {
        requesterName: requesterName,
        requesterId: socket.id
      });
      
      log(`   ✅ Notification envoyée à l'hôte ${data.targetHostId.slice(0, 6)}`);
    });
    
    // Acceptation d'une demande de partage
    socket.on('accept-share-request', (data) => {
      const host = globalState.connectedUsers.get(socket.id);
      const hostName = host?.name || `User-${socket.id.slice(0, 4)}`;
      
      log(`✅ SHARE ACCEPT | ${hostName} accepte ${data.requesterName}`);
      
      // Notifier le demandeur que sa demande est acceptée
      io.to(data.requesterId).emit('share-request-accepted');
      
      log(`   ✅ ${data.requesterName} notifié de l'acceptation`);
      
      // ✅ ARRÊTER AUTOMATIQUEMENT LE PARTAGE DE L'HÔTE ACTUEL
      if (socket.id === globalState.hostSocketId) {
        log(`   ⏹️  Arrêt automatique du partage de ${hostName}`);
        
        // Nettoyer les connexions actives
        for (const [connId, conn] of globalState.activeConnections) {
          if (conn.hostId === socket.id) {
            globalState.activeConnections.delete(connId);
          }
        }
        
        // Réinitialiser l'état global
        globalState.isSharing = false;
        globalState.hostSocketId = null;
        globalState.hostName = null;
        
        // Notifier l'hôte d'arrêter son partage
        socket.emit('force-stop-share', {
          reason: 'accepted-transfer',
          message: `Partage transféré à ${data.requesterName}`
        });
        
        log(`   ✅ Partage de ${hostName} arrêté automatiquement`);
      }
    });
    
    // Refus d'une demande de partage
    socket.on('deny-share-request', (data) => {
      const host = globalState.connectedUsers.get(socket.id);
      const hostName = host?.name || `User-${socket.id.slice(0, 4)}`;
      
      log(`❌ SHARE DENY | ${hostName} refuse la demande`);
      
      // Notifier le demandeur que sa demande est refusée
      io.to(data.requesterId).emit('share-request-denied');
      
      log(`   ✅ Demandeur ${data.requesterId.slice(0, 6)} notifié du refus`);
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
      
      // Message système de déconnexion (optionnel)
      io.emit('system-message', {
        type: 'user-left',
        text: `${userName} a quitté le chat`,
        timestamp: new Date().toISOString()
      });
      
      // Diffuser la liste des utilisateurs mise à jour
      broadcastUsersUpdate(io);
    });
  });

  // ===== TÂCHE PÉRIODIQUE: Diffuser la liste des utilisateurs =====
  setInterval(() => {
    if (globalState.connectedUsers.size > 0) {
      broadcastUsersUpdate(io);
    }
  }, 30000); // Toutes les 30 secondes
}

module.exports = { setupSocketHandlers, globalState };
