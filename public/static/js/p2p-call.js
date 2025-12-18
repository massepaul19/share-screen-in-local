// public/static/p2p-call.js
class P2PCallManager {
  constructor(socket) {
    this.socket = socket;
    this.currentCall = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.ui = null; // ✅ UI instance
    
    this.setupSocketListeners();
  }
  
  // ===== 🎨 LIER L'INTERFACE UTILISATEUR =====
  setUI(ui) {
    this.ui = ui;
    console.log('🔗 UI liée au P2PCallManager');
  }

  // ===== 📞 INITIER UN APPEL =====
  async initiateCall(targetId, callType = 'video') {
    try {
      console.log(`📞 Appel de ${targetId.slice(0, 8)} (${callType})`);
      
      // Demander les permissions média
      this.localStream = await this.getLocalStream(callType);
      
      // Envoyer la demande au serveur
      this.socket.emit('p2p-call-request', {
        targetId: targetId,
        callType: callType
      });
      
      this.currentCall = {
        targetId: targetId,
        callType: callType,
        status: 'calling'
      };
      
      // Afficher "Appel en cours..."
      if (this.ui) {
        this.ui.showCallingState(targetId, callType);
      }
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'appel:', error);
      alert('Impossible d\'accéder à la caméra/micro');
    }
  }
  
  // ===== 🎥 OBTENIR LE STREAM LOCAL =====
  async getLocalStream(callType) {
    const constraints = {
      audio: true,
      video: callType === 'video' ? {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } : false
    };
    
    return await navigator.mediaDevices.getUserMedia(constraints);
  }
  
  // ===== ✅ ACCEPTER UN APPEL =====
  async acceptCall(callId, callerId, callType) {
    try {
      console.log(`✅ Acceptation de l'appel ${callId.slice(0, 10)}`);
      
      // Obtenir le stream local
      this.localStream = await this.getLocalStream(callType);
      
      // Créer la connexion WebRTC
      await this.createPeerConnection(callId, callerId);
      
      // Notifier le serveur
      this.socket.emit('p2p-call-accept', { callId });
      
      this.currentCall = {
        callId: callId,
        peerId: callerId,
        callType: callType,
        status: 'accepted'
      };
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'acceptation:', error);
      this.socket.emit('p2p-call-reject', { callId });
    }
  }
  
  // ===== 🔗 CRÉER LA CONNEXION WEBRTC =====
  async createPeerConnection(callId, peerId) {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    this.peerConnection = new RTCPeerConnection(config);
    
    // Ajouter les tracks locaux
    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });
    
    // Recevoir les tracks distants
    this.peerConnection.ontrack = (event) => {
      console.log('🎥 Stream distant reçu');
      this.remoteStream = event.streams[0];
      this.onRemoteStream(this.remoteStream);
    };
    
    // ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('p2p-call-ice-candidate', {
          callId: callId,
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };
    
    // Surveiller l'état
    this.peerConnection.onconnectionstatechange = () => {
      console.log('🔄 État connexion:', this.peerConnection.connectionState);
      
      if (this.peerConnection.connectionState === 'connected') {
        this.onCallConnected();
      } else if (['disconnected', 'failed', 'closed'].includes(this.peerConnection.connectionState)) {
        this.endCall();
      }
    };
  }
  
  // ===== 📤 CRÉER ET ENVOYER L'OFFER =====
  async createAndSendOffer(callId, targetId) {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    this.socket.emit('p2p-call-offer', {
      callId: callId,
      targetId: targetId,
      offer: offer
    });
  }
  
  // ===== 📥 CRÉER ET ENVOYER L'ANSWER =====
  async createAndSendAnswer(callId, targetId, offer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    this.socket.emit('p2p-call-answer', {
      callId: callId,
      targetId: targetId,
      answer: answer
    });
  }
  
  // ===== 📴 TERMINER L'APPEL =====
  endCall() {
    console.log('📴 Fin de l\'appel');
    
    if (this.currentCall?.callId) {
      this.socket.emit('p2p-call-end', {
        callId: this.currentCall.callId
      });
    }
    
    this.cleanup();
  }
  
  // ===== 🧹 NETTOYAGE =====
  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.currentCall = null;
    this.remoteStream = null;
  }
  
  // ===== 🎧 ÉCOUTE DES ÉVÉNEMENTS SOCKET =====
  setupSocketListeners() {
    // Appel initié
    this.socket.on('p2p-call-initiated', (data) => {
      console.log('📞 Appel initié vers', data.receiverName);
    });
    
    // Appel entrant
    this.socket.on('p2p-incoming-call', (data) => {
      console.log('📞 Appel entrant de', data.callerName);
      this.onIncomingCall(data);
    });
    
    // Appel accepté (côté appelant)
    this.socket.on('p2p-call-accepted', async (data) => {
      console.log('✅ Appel accepté par', data.receiverName);
      
      await this.createPeerConnection(data.callId, data.receiverId);
      await this.createAndSendOffer(data.callId, data.receiverId);
      
      this.currentCall.callId = data.callId;
      this.currentCall.status = 'connected';
    });
    
    // Appel refusé
    this.socket.on('p2p-call-rejected', (data) => {
      alert(`Appel refusé par ${data.receiverName}`);
      this.cleanup();
    });
    
    // Appel terminé
    this.socket.on('p2p-call-ended', (data) => {
      alert(`${data.endedBy} a raccroché`);
      this.cleanup();
    });
    
    // Timeout
    this.socket.on('p2p-call-timeout', () => {
      alert('Pas de réponse');
      this.cleanup();
    });
    
    // Offer reçue
    this.socket.on('p2p-call-offer', async (data) => {
      await this.createAndSendAnswer(data.callId, data.from, data.offer);
    });
    
    // Answer reçue
    this.socket.on('p2p-call-answer', async (data) => {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
    });
    
    // ICE candidate
    this.socket.on('p2p-call-ice-candidate', async (data) => {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    });
    
    // Erreur
    this.socket.on('p2p-call-error', (data) => {
      alert(`Erreur: ${data.message}`);
      this.cleanup();
    });
  }
  
  // ===== 🎨 CALLBACKS (à implémenter dans l'UI) =====
  onIncomingCall(data) {
    // À implémenter dans p2p-callUI.js
    if (this.ui) {
      this.ui.showIncomingCallModal(data);
    }
  }
  
  onRemoteStream(stream) {
    // À implémenter dans p2p-callUI.js
    if (this.ui) {
      this.ui.showRemoteVideo(stream);
    }
  }
  
  onCallConnected() {
    if (this.ui) {
      this.ui.showCallConnected();
    }
  }
}