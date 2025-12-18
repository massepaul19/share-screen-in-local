// server/call-manager.js
const { log } = require('./utils');

// État des appels P2P
const activeP2PCalls = new Map(); // callId => { callerId, receiverId, type, status, ... }

function setupP2PCallHandlers(io, globalState) {
  
  io.on('connection', (socket) => {
    
    // ===== 📞 DEMANDE D'APPEL P2P =====
    socket.on('p2p-call-request', (data) => {
      const caller = globalState.connectedUsers.get(socket.id);
      const receiver = globalState.connectedUsers.get(data.targetId);
      
      // Vérifier que le destinataire existe
      if (!receiver) {
        socket.emit('p2p-call-error', { 
          reason: 'user-not-found',
          message: 'Utilisateur introuvable'
        });
        log(`❌ P2P CALL | Destinataire ${data.targetId.slice(0, 6)} introuvable`);
        return;
      }
      
      // Vérifier que le destinataire n'est pas déjà en appel
      const receiverInCall = Array.from(activeP2PCalls.values())
        .some(call => 
          (call.callerId === data.targetId || call.receiverId === data.targetId) &&
          call.status !== 'ended'
        );
      
      if (receiverInCall) {
        socket.emit('p2p-call-error', { 
          reason: 'user-busy',
          message: `${receiver.name || data.targetId.slice(0, 6)} est déjà en appel`
        });
        log(`⛔ P2P CALL | ${receiver.name || data.targetId.slice(0, 6)} déjà en appel`);
        return;
      }
      
      // Créer l'ID unique de l'appel
      const callId = `p2pcall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Enregistrer l'appel
      activeP2PCalls.set(callId, {
        callId,
        callerId: socket.id,
        callerName: caller?.name || socket.id.slice(0, 8),
        receiverId: data.targetId,
        receiverName: receiver?.name || data.targetId.slice(0, 8),
        callType: data.callType, // 'audio' ou 'video'
        status: 'ringing',
        createdAt: Date.now()
      });
      
      log(`📞 P2P CALL REQUEST | ${caller?.name || socket.id.slice(0, 6)} → ${receiver?.name || data.targetId.slice(0, 6)} (${data.callType})`);
      
      // Notifier le destinataire
      io.to(data.targetId).emit('p2p-incoming-call', {
        callId,
        callerId: socket.id,
        callerName: caller?.name || socket.id.slice(0, 8),
        callType: data.callType
      });
      
      // Confirmer à l'appelant
      socket.emit('p2p-call-initiated', { 
        callId,
        receiverName: receiver?.name || data.targetId.slice(0, 8)
      });
      
      // Timeout automatique après 30 secondes si pas de réponse
      setTimeout(() => {
        const call = activeP2PCalls.get(callId);
        if (call && call.status === 'ringing') {
          log(`⏱️  P2P CALL TIMEOUT | ${callId.slice(0, 10)}`);
          
          io.to(call.callerId).emit('p2p-call-timeout', { callId });
          io.to(call.receiverId).emit('p2p-call-cancelled', { callId });
          
          activeP2PCalls.delete(callId);
        }
      }, 30000);
    });
    
    // ===== ✅ ACCEPTATION D'APPEL =====
    socket.on('p2p-call-accept', (data) => {
      const call = activeP2PCalls.get(data.callId);
      
      if (!call) {
        socket.emit('p2p-call-error', { 
          reason: 'call-not-found',
          message: 'Appel introuvable'
        });
        return;
      }
      
      if (call.receiverId !== socket.id) {
        socket.emit('p2p-call-error', { 
          reason: 'unauthorized',
          message: 'Non autorisé'
        });
        return;
      }
      
      call.status = 'accepted';
      call.acceptedAt = Date.now();
      
      log(`✅ P2P CALL ACCEPTED | ${call.receiverName} accepte l'appel de ${call.callerName}`);
      
      // Notifier l'appelant
      io.to(call.callerId).emit('p2p-call-accepted', {
        callId: data.callId,
        receiverId: socket.id,
        receiverName: call.receiverName
      });
      
      // Confirmer au receveur
      socket.emit('p2p-call-ready', {
        callId: data.callId,
        callerId: call.callerId,
        callerName: call.callerName
      });
    });
    
    // ===== ❌ REFUS D'APPEL =====
    socket.on('p2p-call-reject', (data) => {
      const call = activeP2PCalls.get(data.callId);
      
      if (!call) return;
      
      log(`❌ P2P CALL REJECTED | ${call.receiverName} refuse l'appel de ${call.callerName}`);
      
      // Notifier l'appelant
      io.to(call.callerId).emit('p2p-call-rejected', {
        callId: data.callId,
        receiverName: call.receiverName
      });
      
      activeP2PCalls.delete(data.callId);
    });
    
    // ===== 📴 FIN D'APPEL =====
    socket.on('p2p-call-end', (data) => {
      const call = activeP2PCalls.get(data.callId);
      
      if (!call) return;
      
      const endedBy = socket.id === call.callerId ? call.callerName : call.receiverName;
      const otherUserId = socket.id === call.callerId ? call.receiverId : call.callerId;
      
      const duration = call.connectedAt ? Date.now() - call.connectedAt : 0;
      
      log(`📴 P2P CALL ENDED | ${endedBy} a raccroché (durée: ${Math.floor(duration / 1000)}s)`);
      
      // Notifier l'autre personne
      io.to(otherUserId).emit('p2p-call-ended', {
        callId: data.callId,
        endedBy: endedBy,
        duration: duration
      });
      
      activeP2PCalls.delete(data.callId);
    });
    
    // ===== 🔄 SIGNALING WEBRTC =====
    
    socket.on('p2p-call-offer', (data) => {
      const call = activeP2PCalls.get(data.callId);
      if (!call) return;
      
      log(`📤 P2P OFFER | ${data.callId.slice(0, 10)}`);
      
      io.to(data.targetId).emit('p2p-call-offer', {
        callId: data.callId,
        offer: data.offer,
        from: socket.id
      });
    });
    
    socket.on('p2p-call-answer', (data) => {
      const call = activeP2PCalls.get(data.callId);
      if (!call) return;
      
      call.status = 'connected';
      call.connectedAt = Date.now();
      
      log(`📥 P2P ANSWER | ${data.callId.slice(0, 10)} | Connexion établie`);
      
      io.to(data.targetId).emit('p2p-call-answer', {
        callId: data.callId,
        answer: data.answer,
        from: socket.id
      });
    });
    
    socket.on('p2p-call-ice-candidate', (data) => {
      io.to(data.targetId).emit('p2p-call-ice-candidate', {
        callId: data.callId,
        candidate: data.candidate,
        from: socket.id
      });
    });
    
    // ===== 🔌 DÉCONNEXION =====
    socket.on('disconnect', () => {
      // Terminer tous les appels de cet utilisateur
      for (const [callId, call] of activeP2PCalls) {
        if (call.callerId === socket.id || call.receiverId === socket.id) {
          const otherUserId = call.callerId === socket.id ? call.receiverId : call.callerId;
          const disconnectedName = call.callerId === socket.id ? call.callerName : call.receiverName;
          
          io.to(otherUserId).emit('p2p-call-ended', {
            callId: callId,
            endedBy: disconnectedName,
            reason: 'disconnected'
          });
          
          activeP2PCalls.delete(callId);
          
          log(`🔴 P2P CALL | Appel ${callId.slice(0, 10)} terminé (déconnexion de ${disconnectedName})`);
        }
      }
    });
  });
  
  // ===== 📊 TÂCHE PÉRIODIQUE: Nettoyer les vieux appels =====
  setInterval(() => {
    const now = Date.now();
    for (const [callId, call] of activeP2PCalls) {
      // Supprimer les appels en attente depuis plus de 2 minutes
      if (call.status === 'ringing' && (now - call.createdAt) > 120000) {
        activeP2PCalls.delete(callId);
        log(`🧹 CLEANUP | Appel ${callId.slice(0, 10)} expiré`);
      }
    }
  }, 60000); // Toutes les minutes
}

module.exports = { setupP2PCallHandlers, activeP2PCalls };