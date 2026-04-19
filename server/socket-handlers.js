// server/socket-handlers.js - Version finale avec chat amélioré (mentions + réponses)
const { getClientIP, detectBrowser, log } = require('./utils');

// État global
const globalState = {
  connectedUsers: new Map(), // socket.id -> UserInfo (reste global pour retrouver les users)
  rooms: new Map() // roomId -> RoomState (Nouveau : état par salle)
};

// ===== UTILITAIRE: Récupérer l'état d'une salle =====
function getRoomState(roomId) {
  if (!globalState.rooms.has(roomId)) {
    globalState.rooms.set(roomId, {
      isSharing: false,
      hostSocketId: null,
      hostName: null,
      activeConnections: new Map(),
      chatMessages: new Map(),
      disconnectTimeouts: new Map(),
      startTime: Date.now(),
      adminSocketId: null // NOUVEAU : ID de l'administrateur de la salle
    });
  }
  return globalState.rooms.get(roomId);
}

// ============================================================
// DESTRUCTION AUTOMATIQUE DES SALLES VIDES
// ============================================================
const ROOM_EMPTY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const ROOM_EMPTY_WARN    =  2 * 60 * 1000; // Alerte 2 min avant destruction
const roomDestructionTimers = new Map(); // roomId -> { warnTimer, destroyTimer }

function scheduleRoomDestruction(io, roomId) {
  // Si un timer existe déjà, on l'annule d'abord
  cancelRoomDestruction(roomId);

  const warnTimer = setTimeout(() => {
    // Alerte aux users restants (si quelqu'un est revenu entre-temps)
    const usersInRoom = Array.from(globalState.connectedUsers.values())
      .filter(u => u.room === roomId).length;
    if (usersInRoom > 0) {
      // Des users sont revenus — annuler la destruction
      cancelRoomDestruction(roomId);
      return;
    }
    io.to(roomId).emit('room-closing-soon', {
      message: 'La salle sera fermée dans 2 minutes faute d\'activité.',
      secondsLeft: 120
    });
  }, ROOM_EMPTY_TIMEOUT - ROOM_EMPTY_WARN);

  const destroyTimer = setTimeout(() => {
    const usersInRoom = Array.from(globalState.connectedUsers.values())
      .filter(u => u.room === roomId).length;
    if (usersInRoom > 0) {
      cancelRoomDestruction(roomId);
      return;
    }
    // Destruction effective
    log(`🗑️  ROOM DESTROY | ${roomId} — vide depuis 15 min`);
    io.to(roomId).emit('room-destroyed', {
      message: 'La salle a été fermée automatiquement (inactivité).'
    });
    globalState.rooms.delete(roomId);
    roomDestructionTimers.delete(roomId);
  }, ROOM_EMPTY_TIMEOUT);

  roomDestructionTimers.set(roomId, { warnTimer, destroyTimer });
  log(`⏳ ROOM TIMER | ${roomId} — destruction dans 15 min si toujours vide`);
}

function cancelRoomDestruction(roomId) {
  const timers = roomDestructionTimers.get(roomId);
  if (timers) {
    clearTimeout(timers.warnTimer);
    clearTimeout(timers.destroyTimer);
    roomDestructionTimers.delete(roomId);
  }
}

// ===== UTILITAIRE: Diffuser la liste des utilisateurs actifs =====
function broadcastUsersUpdate(io, roomId) {
  const users = Array.from(globalState.connectedUsers.values())
    .filter(user => user.room === roomId)
    .map(user => ({
    id: user.socketId,
    name: user.name,
    handRaised: user.handRaised,
    micOn: user.micOn
  }));
  
  io.to(roomId).emit('users-update', users);
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
      joinedAt: new Date().toISOString(),
      userId: null, // Sera rempli au register
      room: null,
      handRaised: false,
      micOn: true // Par défaut activé
    });

    // Note : On n'envoie plus 'initial-state' ici car on ne connaît pas encore la salle.
    // Il sera envoyé dans l'événement 'register'.

    // ===== REGISTER USER =====
    socket.on('register', (data) => {
      const userName = data.name?.trim() || `User-${socket.id.slice(0, 4)}`;
      const userId = data.userId;
      const roomId = data.room || 'general';
      
      // Mettre à jour l'utilisateur
      const user = globalState.connectedUsers.get(socket.id);
      if (user) {
        user.name = userName;
        user.userId = userId;
        user.room = roomId;
        globalState.connectedUsers.set(socket.id, user);
      }

      const roomState = getRoomState(roomId);
      
      // Si l'utilisateur est marqué comme admin ou si c'est le premier, il devient admin
      if (data.isAdmin || !roomState.adminSocketId) {
        roomState.adminSocketId = socket.id;
      }

      // GESTION RECONNEXION HÔTE
      // Si un timeout de déconnexion existe pour cet userId, on l'annule
      if (userId && roomState.disconnectTimeouts.has(userId)) {
        log(`🔄 RECONNEXION HÔTE | ${userName} est revenu`);
        clearTimeout(roomState.disconnectTimeouts.get(userId));
        roomState.disconnectTimeouts.delete(userId);
        
        // Si c'était l'hôte, on met à jour le socket ID de l'hôte
        if (roomState.isSharing) {
           roomState.hostSocketId = socket.id;
        }
      }

      socket.join(roomId);
      log(`👤 REGISTER | ${userName} (${browser}) -> Room: ${roomId}`);

      // ===== ANNULER DESTRUCTION si un user rejoint une salle en attente =====
      cancelRoomDestruction(roomId);
      
      // Envoyer l'état initial de la salle spécifique
      socket.emit('initial-state', {
        isSharing: roomState.isSharing,
        hostName: roomState.hostName,
        hostId: roomState.hostSocketId,
        isYouHost: socket.id === roomState.hostSocketId,
        connectedUsers: Array.from(globalState.connectedUsers.values()).filter(u => u.room === roomId).length,
        // NOUVEAU : Liste complète pour le Mesh Audio
        connectedUsersList: Array.from(globalState.connectedUsers.values())
          .filter(u => u.room === roomId)
          .map(u => ({ id: u.socketId, name: u.name, handRaised: u.handRaised }))
      });

      // NOUVEAU : Notifier les autres pour initier l'audio P2P
      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        name: userName,
        handRaised: false
      });

      // Compter les utilisateurs dans cette salle
      const roomUsersCount = Array.from(globalState.connectedUsers.values()).filter(u => u.room === roomId).length;

      io.to(roomId).emit('user-count-update', { 
        count: roomUsersCount 
      });
      
      // Diffuser la liste mise à jour
      broadcastUsersUpdate(io, roomId);
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
        const roomState = getRoomState(user.room);
        
        // Si l'utilisateur est en train de partager, mettre à jour le nom affiché
        if (socket.id === roomState.hostSocketId) {
          roomState.hostName = newName;
          io.to(user.room).emit('host-name-updated', {
            newName: newName
          });
        }
        
        // Message système optionnel pour informer du changement de nom
        io.to(user.room).emit('system-message', {
          type: 'name-change',
          text: `${oldName} est maintenant ${newName}`,
          timestamp: new Date().toISOString()
        });
        
        // Diffuser la liste des utilisateurs mise à jour
        broadcastUsersUpdate(io, user.room);
      }
    });

    // ===== MIC STATUS (Synchronisation) =====
    socket.on('mic-status', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      if (user) {
        user.micOn = data.micOn;
        globalState.connectedUsers.set(socket.id, user);
        broadcastUsersUpdate(io, user.room);
      }
    });

    // ===== REQUEST SHARE =====
    socket.on('request-share', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const roomState = getRoomState(user.room);

      if (roomState.isSharing && roomState.hostSocketId !== socket.id) {
        log(`⛔ SHARE BLOCKED | ${data.name} | Raison: ${roomState.hostName} partage déjà`);
        
        socket.emit('share-blocked', {
          reason: 'already-sharing',
          currentHost: roomState.hostName
        });
        return;
      }

      log(`✅ SHARE APPROVED | ${data.name} autorisé`);
      
      socket.emit('share-approved', {
        connectedUsers: Array.from(globalState.connectedUsers.values()).filter(u => u.room === user.room).length - 1
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

      const roomState = getRoomState(user.room);
      roomState.isSharing = true;
      roomState.hostSocketId = socket.id;
      roomState.hostName = userName;

      log(`🎥 SHARE START | ${userName} partage son écran`);

      socket.to(user.room).emit('host-started-sharing', {
        hostName: userName,
        hostId: socket.id
      });
      
      // Diffuser la liste des utilisateurs mise à jour
      broadcastUsersUpdate(io, user.room);
    });

    // ===== VIEWER READY =====
    socket.on('viewer-ready', (data) => {
      const viewer = globalState.connectedUsers.get(socket.id);
      const viewerName = viewer?.name || `User-${socket.id.slice(0, 4)}`;
      const roomState = getRoomState(viewer.room);
      
      log(`👁️  VIEWER READY | ${viewerName} prêt à recevoir`);
      
      const hostSocket = io.sockets.sockets.get(data.hostId);
      if (hostSocket) {
        const connectionId = `${data.hostId}-${socket.id}`;
        roomState.activeConnections.set(connectionId, {
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
      const user = globalState.connectedUsers.get(socket.id);
      const roomState = getRoomState(user.room);

      if (socket.id !== roomState.hostSocketId) return;

      const hostName = roomState.hostName;
      
      log(`⏹️  SHARE STOP | ${hostName} a arrêté`);

      // Nettoyer les connexions actives
      for (const [connId, conn] of roomState.activeConnections) {
        if (conn.hostId === socket.id) {
          roomState.activeConnections.delete(connId);
        }
      }

      roomState.isSharing = false;
      roomState.hostSocketId = null;
      roomState.hostName = null;

      io.to(user.room).emit('host-stopped-sharing', {
        message: `${hostName} a arrêté le partage`,
        previousHost: hostName
      });
    });

    // ===== ✋ GESTION MAIN LEVÉE =====
    socket.on('toggle-hand', () => {
      const user = globalState.connectedUsers.get(socket.id);
      if (user) {
        user.handRaised = !user.handRaised;
        globalState.connectedUsers.set(socket.id, user);
        
        log(`✋ HAND | ${user.name} ${user.handRaised ? 'a levé' : 'a baissé'} la main`);
        
        // Diffuser la mise à jour à tout le monde
        io.to(user.room).emit('hand-update', {
          userId: socket.id,
          handRaised: user.handRaised,
          userName: user.name // Ajout du nom pour la notification
        });
        
        // Notifier SPÉCIFIQUEMENT l'hôte avec une alerte
        const roomState = getRoomState(user.room);
        if (roomState.hostSocketId && roomState.hostSocketId !== socket.id && user.handRaised) {
          io.to(roomState.hostSocketId).emit('hand-raised-alert', {
            userId: socket.id,
            userName: user.name
          });
        }
        
        broadcastUsersUpdate(io, user.room);
      }
    });

    // ===== 🎙️ GESTION MODÉRATEUR (MUTE/UNMUTE) =====
    
    // Couper le micro
    socket.on('mute-user', (data) => {
      const requester = globalState.connectedUsers.get(socket.id);
      const targetId = data.targetId;
      const roomState = getRoomState(requester.room);

      // Vérifier si le demandeur est l'hôte OU l'admin
      if (roomState.hostSocketId === socket.id || roomState.adminSocketId === socket.id) {
        log(`🔇 MUTE | ${requester.name} a coupé le micro de ${targetId.slice(0, 6)}`);
        io.to(targetId).emit('mute-command', { by: requester.name });
      }
    });

    // Autoriser le micro
    socket.on('allow-mic', (data) => {
      const requester = globalState.connectedUsers.get(socket.id);
      const targetId = data.targetId;
      const roomState = getRoomState(requester.room);

      // Vérifier si le demandeur est l'hôte OU l'admin
      if (roomState.hostSocketId === socket.id || roomState.adminSocketId === socket.id) {
        log(`🎤 ALLOW MIC | ${requester.name} autorise ${targetId.slice(0, 6)}`);
        io.to(targetId).emit('mic-allowed', { by: requester.name });
      }
    });

    // ===== MUTE ALL — Couper tous les micros (hôte/admin uniquement) =====
    socket.on('mute-all', () => {
      const requester = globalState.connectedUsers.get(socket.id);
      if (!requester) return;
      const roomState = getRoomState(requester.room);

      if (roomState.hostSocketId !== socket.id && roomState.adminSocketId !== socket.id) return;

      log(`🔇 MUTE ALL | ${requester.name} a coupé tous les micros`);

      // Couper tous sauf l'hôte lui-même
      Array.from(globalState.connectedUsers.values())
        .filter(u => u.room === requester.room && u.socketId !== socket.id)
        .forEach(u => {
          u.micOn = false;
          globalState.connectedUsers.set(u.socketId, u);
          io.to(u.socketId).emit('mute-command', { by: requester.name, muteAll: true });
        });

      broadcastUsersUpdate(io, requester.room);
      // Confirmer à l'hôte
      socket.emit('mute-all-done', {
        message: 'Tous les micros ont été coupés.'
      });
    });

    // ===== UNMUTE ALL — Réactiver tous les micros (hôte/admin uniquement) =====
    socket.on('unmute-all', () => {
      const requester = globalState.connectedUsers.get(socket.id);
      if (!requester) return;
      const roomState = getRoomState(requester.room);

      if (roomState.hostSocketId !== socket.id && roomState.adminSocketId !== socket.id) return;

      log(`🎤 UNMUTE ALL | ${requester.name} a réactivé tous les micros`);

      Array.from(globalState.connectedUsers.values())
        .filter(u => u.room === requester.room && u.socketId !== socket.id)
        .forEach(u => {
          io.to(u.socketId).emit('mic-allowed', { by: requester.name, unmuteAll: true });
        });

      socket.emit('unmute-all-done', {
        message: 'Tous les micros ont été réactivés.'
      });
    });

    // Baisser la main d'un utilisateur (par l'hôte)
    socket.on('lower-hand', (data) => {
      const requester = globalState.connectedUsers.get(socket.id);
      const targetId = data.targetId;
      const roomState = getRoomState(requester.room);

      // Vérifier si le demandeur est l'hôte OU l'admin
      if (roomState.hostSocketId === socket.id || roomState.adminSocketId === socket.id) {
        log(`✋ LOWER HAND | ${requester.name} baisse la main de ${targetId.slice(0, 6)}`);
        io.to(targetId).emit('lower-hand-command', { by: requester.name });
      }
    });

    // ===== WEBRTC SIGNALING =====
    socket.on('webrtc-offer', (data) => {
      const fromUser = globalState.connectedUsers.get(socket.id);
      const toUser = globalState.connectedUsers.get(data.to);
      const roomState = getRoomState(fromUser.room);
      
      log(`📤 OFFER | ${fromUser?.name || socket.id.slice(0, 6)} → ${toUser?.name || data.to.slice(0, 6)}`);
      
      const targetSocket = io.sockets.sockets.get(data.to);
      if (targetSocket) {
        targetSocket.emit('webrtc-offer', {
          offer: data.offer,
          from: socket.id
        });
        
        const connectionId = `${socket.id}-${data.to}`;
        const conn = roomState.activeConnections.get(connectionId);
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
      const roomState = getRoomState(fromUser.room);
      
      log(`📥 ANSWER | ${fromUser?.name || socket.id.slice(0, 6)} → ${toUser?.name || data.to.slice(0, 6)}`);
      
      const targetSocket = io.sockets.sockets.get(data.to);
      if (targetSocket) {
        targetSocket.emit('webrtc-answer', {
          answer: data.answer,
          from: socket.id
        });
        
        const connectionId = `${data.to}-${socket.id}`;
        const conn = roomState.activeConnections.get(connectionId);
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
      const user = globalState.connectedUsers.get(socket.id);
      const roomState = getRoomState(user.room);
      const connectionId = data.hostId === socket.id 
        ? `${socket.id}-${data.peerId}`
        : `${data.peerId}-${socket.id}`;
      
      const conn = roomState.activeConnections.get(connectionId);
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
      const roomState = getRoomState(user.room);
      log(`❌ WEBRTC ERROR | ${user?.name || socket.id.slice(0, 6)} | ${data.error}`);
      
      for (const [connId, conn] of roomState.activeConnections) {
        if (conn.hostId === socket.id || conn.viewerId === socket.id) {
          roomState.activeConnections.delete(connId);
        }
      }
    });

    // ===== ✨ GESTION DES RÉACTIONS VIDÉO =====
    socket.on('video-reaction', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || 'Anonyme';

      log(`✨ REACTION | ${userName} a envoyé ${data.emoji}`);

      // Diffuser à tous les autres clients
      socket.to(user.room).emit('video-reaction', {
        emoji: data.emoji,
        userName: userName
      });
    });

    // ===== 💬 GESTION DU CHAT AMÉLIORÉ =====
    
    // Envoi de message avec support des réponses
    socket.on('send-message', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || `User-${socket.id.slice(0, 4)}`;
      const roomState = getRoomState(user.room);
      
      // Générer un ID unique pour le message
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const message = {
        id: messageId,
        senderId: socket.id,
        senderName: userName,
        text: data.text,
        timestamp: Date.now(),
        to: data.to || null, // Ajout du destinataire pour le privé
        replyTo: data.replyTo || null // ID du message auquel on répond
      };
      
      // Stocker le message pour les réponses futures
      roomState.chatMessages.set(messageId, message);
      
      // Log avec indication de réponse
      const logText = data.replyTo 
        ? `💬 REPLY | ${userName} → ${data.text.substring(0, 40)}${data.text.length > 40 ? '...' : ''}`
        : data.to
        ? `🔒 PRIVATE | ${userName} → ${data.to.slice(0, 6)}: ${data.text.substring(0, 40)}`
        : `💬 MESSAGE | ${userName}: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`;
      log(logText);
      
      // Routage du message
      if (data.to) {
        // Message Privé : Envoyer seulement au destinataire et à l'expéditeur
        io.to(data.to).emit('new-message', { ...message, isPrivate: true });
        socket.emit('new-message', { ...message, isPrivate: true });
      } else {
        // Message Public : Envoyer à tout le monde dans la salle
        io.to(user.room).emit('new-message', message);
      }
      
      // Nettoyer les vieux messages (garder seulement les 100 derniers)
      if (roomState.chatMessages.size > 100) {
        const oldestKey = roomState.chatMessages.keys().next().value;
        roomState.chatMessages.delete(oldestKey);
      }
    });

    // Indicateur de frappe
    socket.on('typing', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || `User-${socket.id.slice(0, 4)}`;
      
      // Envoyer à tous sauf l'expéditeur
      socket.to(user.room).emit('user-typing', {
        userId: socket.id,
        userName: userName,
        isTyping: data.isTyping
      });
    });

    // Demander l'historique des messages (optionnel)
    socket.on('request-chat-history', () => {
      const user = globalState.connectedUsers.get(socket.id);
      const roomState = getRoomState(user.room);
      const messages = Array.from(roomState.chatMessages.values())
        .slice(-50); // Envoyer les 50 derniers messages
      
      socket.emit('chat-history', { messages });
      log(`📜 HISTORY | Envoi de ${messages.length} messages à ${socket.id.slice(0, 6)}`);
    });

    // ===== 📢 GESTION DES DEMANDES DE PARTAGE =====
    
    // Réception d'une demande de partage
    socket.on('send-share-request', (data) => {
      const requester = globalState.connectedUsers.get(socket.id);
      const requesterName = data.name || requester?.name || `User-${socket.id.slice(0, 4)}`;
      const roomState = getRoomState(requester.room);
      
      log(`📥 SHARE REQUEST | ${requesterName} → Hôte ${data.targetHostId.slice(0, 6)}`);
      
      // Vérifier que l'hôte existe et partage toujours
      const targetSocket = io.sockets.sockets.get(data.targetHostId);
      
      if (!targetSocket) {
        log(`   ❌ Hôte ${data.targetHostId.slice(0, 6)} introuvable`);
        socket.emit('share-request-denied');
        return;
      }
      
      // Vérifier que l'hôte partage toujours
      if (data.targetHostId !== roomState.hostSocketId) {
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
      const roomState = getRoomState(host.room);
      
      log(`✅ SHARE ACCEPT | ${hostName} accepte ${data.requesterName}`);
      
      // Notifier le demandeur que sa demande est acceptée
      io.to(data.requesterId).emit('share-request-accepted');
      
      log(`   ✅ ${data.requesterName} notifié de l'acceptation`);
      
      // ✅ ARRÊTER AUTOMATIQUEMENT LE PARTAGE DE L'HÔTE ACTUEL
      if (socket.id === roomState.hostSocketId) {
        log(`   ⏹️  Arrêt automatique du partage de ${hostName}`);
        
        // Nettoyer les connexions actives
        for (const [connId, conn] of roomState.activeConnections) {
          if (conn.hostId === socket.id) {
            roomState.activeConnections.delete(connId);
          }
        }
        
        // Réinitialiser l'état global
        roomState.isSharing = false;
        roomState.hostSocketId = null;
        roomState.hostName = null;
        
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

    // =====  GESTION DU PARTAGE DE FICHIERS =====
    socket.on('file-share', (data) => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || `User-${socket.id.slice(0, 4)}`;
      
      log(`📁 FILE | ${userName} partage : ${data.fileName} (${Math.round(data.fileSize/1024)} KB)`);
      
      const fileMessage = {
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: socket.id,
        senderName: userName,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        fileData: data.fileData, // Base64 ou ArrayBuffer
        timestamp: Date.now(),
        to: data.to || null,
        isPrivate: !!data.to
      };

      if (data.to) {
        // === FICHIER PRIVÉ ===
        // 1. Envoyer au destinataire
        io.to(data.to).emit('file-shared', fileMessage);
        // 2. Renvoyer à l'expéditeur (pour qu'il le voie dans son chat)
        socket.emit('file-shared', fileMessage);
      } else {
        // === FICHIER PUBLIC ===
        // Envoyer à tout le monde dans la room (y compris l'expéditeur)
        io.in(user.room).emit('file-shared', fileMessage);
      }
    });

    // ===== DISCONNECT =====
    socket.on('disconnect', () => {
      const user = globalState.connectedUsers.get(socket.id);
      const userName = user?.name || 'Inconnu';
      const userId = user?.userId;
      const roomState = user ? getRoomState(user.room) : null;
      
      log(`🔴 DÉCONNEXION | ${userName} (${browser})`);

      // Nettoyer les connexions actives
      if (roomState) {
        for (const [connId, conn] of roomState.activeConnections) {
          if (conn.hostId === socket.id || conn.viewerId === socket.id) {
            roomState.activeConnections.delete(connId);
          }
        }

      if (socket.id === roomState.hostSocketId) {
        log(`⏳ HÔTE DÉCONNECTÉ | Attente de reconnexion (15s)...`);
        
        // On ne coupe pas tout de suite, on attend 15s
        const timeout = setTimeout(() => {
          if (roomState.isSharing && roomState.hostSocketId === socket.id) {
            log(`⏹️  TIMEOUT HÔTE | Arrêt du partage`);
            roomState.isSharing = false;
            roomState.hostSocketId = null;
            roomState.hostName = null;
            roomState.disconnectTimeouts.delete(userId);

            io.to(user.room).emit('host-stopped-sharing', {
              message: `${userName} s'est déconnecté`,
              previousHost: userName,
              reason: 'disconnect'
            });
          }
        }, 15000); // 15 secondes de grâce
        
        if (userId) {
          roomState.disconnectTimeouts.set(userId, timeout);
        }
      }
      }

      globalState.connectedUsers.delete(socket.id);
      
      if (user && user.room) {
        const roomUsersCount = Array.from(globalState.connectedUsers.values()).filter(u => u.room === user.room).length;
        io.to(user.room).emit('user-count-update', { 
          count: roomUsersCount 
        });
        
        // Message système de déconnexion (optionnel)
        io.to(user.room).emit('system-message', {
          type: 'user-left',
          text: `${userName} a quitté le chat`,
          timestamp: new Date().toISOString()
        });
        
        // Diffuser la liste des utilisateurs mise à jour
        broadcastUsersUpdate(io, user.room);

        // ===== DESTRUCTION AUTOMATIQUE =====
        // Si la salle est maintenant vide, démarrer le timer de destruction
        if (roomUsersCount === 0) {
          scheduleRoomDestruction(io, user.room);
        }
      }
    });
  });

  // ===== TÂCHE PÉRIODIQUE: Diffuser la liste des utilisateurs =====
  setInterval(() => {
    // On pourrait optimiser en ne le faisant que pour les rooms actives
    const rooms = new Set(Array.from(globalState.connectedUsers.values()).map(u => u.room));
    for (const room of rooms) {
      broadcastUsersUpdate(io, room);
    }
  }, 30000); // Toutes les 30 secondes
}

module.exports = { setupSocketHandlers, globalState };
