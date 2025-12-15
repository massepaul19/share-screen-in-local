// ========================================
// public/app.js - Application client CORRIGÉE
// ========================================

// ===== CONFIGURATION =====
const socket = io({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10
});

// ===== ÉTAT GLOBAL =====
let state = {
  localStream: null,
  peerConnections: new Map(),
  isSharing: false,
  myName: '',
  hostId: null,
  iceServers: [],
  statsInterval: null,
  isFullscreen: false
};

// ===== ÉLÉMENTS DOM =====
const elements = {
  nameInput: document.getElementById('nameInput'),
  shareBtn: document.getElementById('shareBtn'),
  stopBtn: document.getElementById('stopBtn'),
  videoContainer: document.getElementById('videoContainer'),
  userCount: document.getElementById('userCount'),
  sharingStatus: document.getElementById('sharingStatus'),
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  alertContainer: document.getElementById('alertContainer')
};

// ========================================
// UTILITAIRES
// ========================================

function showAlert(message, type = 'info', duration = 5000) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} show`;
  alert.textContent = message;
  
  elements.alertContainer.innerHTML = '';
  elements.alertContainer.appendChild(alert);
  
  if (duration > 0) {
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 300);
    }, duration);
  }
}

async function fetchICEServers() {
  try {
    const response = await fetch('/api/ice-servers');
    const data = await response.json();
    state.iceServers = data.iceServers;
    console.log('📡 ICE servers chargés:', state.iceServers.length, 'serveurs');
  } catch (err) {
    console.error('❌ Erreur chargement ICE servers:', err);
    state.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }
}

// ========================================
// GESTION DU PLEIN ÉCRAN
// ========================================

function toggleFullscreen() {
  if (!state.isFullscreen) {
    enterFullscreen();
  } else {
    exitFullscreen();
  }
}

function enterFullscreen() {
  const container = elements.videoContainer;
  
  if (container.requestFullscreen) {
    container.requestFullscreen();
  } else if (container.webkitRequestFullscreen) {
    container.webkitRequestFullscreen();
  } else if (container.mozRequestFullScreen) {
    container.mozRequestFullScreen();
  } else if (container.msRequestFullscreen) {
    container.msRequestFullscreen();
  } else {
    container.classList.add('fullscreen');
  }
  
  state.isFullscreen = true;
  showVideoHint('Cliquez pour quitter le plein écran 🔽');
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  } else {
    elements.videoContainer.classList.remove('fullscreen');
  }
  
  state.isFullscreen = false;
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('msfullscreenchange', handleFullscreenChange);

function handleFullscreenChange() {
  const isFullscreen = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
  
  state.isFullscreen = isFullscreen;
  
  if (isFullscreen) {
    elements.videoContainer.classList.add('fullscreen');
  } else {
    elements.videoContainer.classList.remove('fullscreen');
  }
}

function showVideoHint(text) {
  const existingHint = elements.videoContainer.querySelector('.video-hint');
  if (existingHint) {
    existingHint.remove();
  }
  
  const hint = document.createElement('div');
  hint.className = 'video-hint';
  hint.innerHTML = `<span>🔍</span><span>${text}</span>`;
  elements.videoContainer.appendChild(hint);
  
  setTimeout(() => hint.remove(), 3000);
}

elements.videoContainer.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  
  const hasVideo = elements.videoContainer.querySelector('video');
  if (hasVideo) {
    toggleFullscreen();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.isFullscreen) {
    exitFullscreen();
  }
});

// ========================================
// GESTION SOCKET.IO
// ========================================

socket.on('connect', () => {
  console.log('✅ Connecté au serveur | Socket ID:', socket.id);
  elements.connectionText.textContent = 'Connecté';
  elements.connectionStatus.style.background = '#d1fae5';
  
  state.myName = elements.nameInput.value.trim() || `User-${socket.id.slice(0, 4)}`;
  socket.emit('register', { name: state.myName });
});

socket.on('disconnect', () => {
  console.log('❌ Déconnecté du serveur');
  elements.connectionText.textContent = 'Déconnecté';
  elements.connectionStatus.style.background = '#fee2e2';
  showAlert('Connexion perdue. Reconnexion...', 'warning');
});

socket.on('reconnect', () => {
  console.log('🔄 Reconnecté au serveur');
  showAlert('Reconnexion réussie !', 'success');
  setTimeout(() => location.reload(), 1000);
});

socket.on('initial-state', (initialState) => {
  console.log('📊 État initial:', initialState);
  elements.userCount.textContent = initialState.connectedUsers;
  
  if (initialState.isSharing) {
    state.hostId = initialState.hostId;
    elements.sharingStatus.textContent = `${initialState.hostName} partage son écran`;
    
    if (!initialState.isYouHost) {
      elements.shareBtn.disabled = true;
      showAlert(`${initialState.hostName} partage actuellement`, 'info');
      console.log('👁️ Envoi viewer-ready vers hôte:', initialState.hostId);
      socket.emit('viewer-ready', { hostId: initialState.hostId });
    } else {
      state.isSharing = true;
      elements.shareBtn.style.display = 'none';
      elements.stopBtn.style.display = 'flex';
    }
  }
});

socket.on('user-count-update', (data) => {
  elements.userCount.textContent = data.count;
});

// ========================================
// GESTION DU PARTAGE
// ========================================

elements.shareBtn.addEventListener('click', async () => {
  state.myName = elements.nameInput.value.trim() || `User-${socket.id.slice(0, 4)}`;
  console.log('📤 Demande de partage pour:', state.myName);
  socket.emit('request-share', { name: state.myName });
});

socket.on('share-approved', async () => {
  console.log('✅ Partage approuvé - Démarrage capture écran...');
  
  try {
    elements.shareBtn.disabled = true;
    elements.shareBtn.innerHTML = '<span>⏳</span><span>Chargement...</span>';

    state.localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 }
      },
      audio: false
    });

    console.log('✅ Écran capturé, tracks:', state.localStream.getTracks().length);

    socket.emit('share-started', { name: state.myName });
    displayLocalVideo();

    state.isSharing = true;
    elements.shareBtn.style.display = 'none';
    elements.stopBtn.style.display = 'flex';
    elements.sharingStatus.textContent = 'Vous partagez votre écran';
    showAlert('Partage démarré !', 'success');

    state.localStream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('⏹️ Partage arrêté par l\'utilisateur');
      stopSharing();
    });

  } catch (err) {
    console.error('❌ Erreur capture écran:', err);
    elements.shareBtn.disabled = false;
    elements.shareBtn.innerHTML = '<span>📹</span><span>Partager mon écran</span>';
    
    if (err.name === 'NotAllowedError') {
      showAlert('Permission refusée. Autorisez le partage.', 'error');
    } else {
      showAlert('Erreur: ' + err.message, 'error');
    }
  }
});

socket.on('share-blocked', (data) => {
  showAlert(`${data.currentHost} partage déjà son écran`, 'warning');
});

function displayLocalVideo() {
  elements.videoContainer.innerHTML = '';
  const video = document.createElement('video');
  video.srcObject = state.localStream;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  elements.videoContainer.appendChild(video);
  
  setTimeout(() => {
    showVideoHint('Cliquez pour agrandir en plein écran 🔍');
  }, 2000);
}

// ========================================
// WEBRTC PEER CONNECTIONS (CORRIGÉ)
// ========================================

socket.on('viewer-joined', async (data) => {
  console.log('👁️ Nouveau viewer rejoint:', data.viewerId.slice(0, 6));
  if (!state.isSharing || !state.localStream) {
    console.warn('⚠️ Pas de stream local disponible');
    return;
  }
  
  await createPeerConnection(data.viewerId, true);
});

socket.on('host-started-sharing', (data) => {
  console.log('🎥 Hôte commence à partager:', data.hostName);
  state.hostId = data.hostId;
  elements.sharingStatus.textContent = `${data.hostName} partage son écran`;
  elements.shareBtn.disabled = true;
  showAlert(`${data.hostName} partage maintenant`, 'info');
  
  console.log('👁️ Envoi viewer-ready vers hôte:', data.hostId);
  socket.emit('viewer-ready', { hostId: data.hostId });
});

async function createPeerConnection(peerId, isInitiator) {
  console.log(`🔗 Création connexion peer avec ${peerId.slice(0, 6)} (initiator: ${isInitiator})`);
  
  // Configuration compatible multi-navigateurs
  const pc = new RTCPeerConnection({ 
    iceServers: state.iceServers,
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all', // Permet UDP et TCP
    iceCandidatePoolSize: 10 // Pré-collecte des ICE candidates
  });
  
  state.peerConnections.set(peerId, pc);

  // ✅ NOUVEAU: Gestion des états de connexion
  pc.onconnectionstatechange = () => {
    console.log(`[${peerId.slice(0, 6)}] Connection state: ${pc.connectionState}`);
    
    if (pc.connectionState === 'connected') {
      console.log(`✅ WebRTC connecté avec ${peerId.slice(0, 6)}`);
      // ✅ ENVOYER L'ÉVÉNEMENT AU SERVEUR
      socket.emit('webrtc-connected', {
        peerId: peerId,
        hostId: state.hostId || socket.id
      });
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      console.error(`❌ Connexion ${pc.connectionState} avec ${peerId.slice(0, 6)}`);
      // ✅ ENVOYER L'ERREUR AU SERVEUR
      socket.emit('webrtc-error', {
        error: `Connection ${pc.connectionState}`,
        peerId: peerId
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[${peerId.slice(0, 6)}] ICE state: ${pc.iceConnectionState}`);
    
    if (pc.iceConnectionState === 'failed') {
      console.error(`❌ ICE failed avec ${peerId.slice(0, 6)}`);
      socket.emit('webrtc-error', {
        error: 'ICE connection failed',
        peerId: peerId
      });
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice', {
        candidate: event.candidate,
        to: peerId
      });
    } else {
      console.log(`[${peerId.slice(0, 6)}] ICE gathering terminé`);
    }
  };

  if (isInitiator && state.localStream) {
    // Hôte: ajouter le stream
    console.log(`[${peerId.slice(0, 6)}] Ajout des tracks au peer (${state.localStream.getTracks().length} tracks)`);
    
    state.localStream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, state.localStream);
      console.log(`  ✅ Track ajouté: ${track.kind} (${track.label})`);
    });

    try {
      // Créer offer avec options pour compatibilité multi-navigateurs
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      
      console.log(`[${peerId.slice(0, 6)}] 📤 Envoi offer (${offer.sdp.length} bytes)`);
      
      socket.emit('webrtc-offer', {
        offer: offer,
        to: peerId
      });
    } catch (err) {
      console.error(`[${peerId.slice(0, 6)}] ❌ Erreur création offer:`, err);
      socket.emit('webrtc-error', {
        error: err.message,
        peerId: peerId
      });
    }
    
  } else {
    // Viewer: recevoir le stream
    pc.ontrack = (event) => {
      console.log(`[${peerId.slice(0, 6)}] ✅ Track reçu: ${event.track.kind}`);
      console.log(`[${peerId.slice(0, 6)}] Streams disponibles:`, event.streams.length);
      console.log(`[${peerId.slice(0, 6)}] Track readyState:`, event.track.readyState);
      
      if (event.streams && event.streams[0]) {
        console.log(`[${peerId.slice(0, 6)}] 📺 Affichage du stream...`);
        displayRemoteVideo(event.streams[0]);
        showAlert('Affichage du partage', 'success');
        
        setTimeout(() => {
          showVideoHint('Cliquez pour agrandir en plein écran 🔍');
        }, 2000);
      } else {
        console.warn(`[${peerId.slice(0, 6)}] ⚠️ Aucun stream dans l'événement track`);
      }
    };
  }

  return pc;
}

function displayRemoteVideo(stream) {
  console.log('📺 Affichage vidéo distante');
  console.log('  Tracks:', stream.getTracks().length);
  console.log('  Active:', stream.active);
  
  stream.getTracks().forEach(track => {
    console.log(`  - ${track.kind}: ${track.readyState} (${track.label})`);
  });
  
  elements.videoContainer.innerHTML = '';
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false; // Viewer ne doit pas être muted
  
  // Forcer le play si autoplay échoue
  video.play().catch(err => {
    console.error('❌ Erreur video.play():', err);
    showAlert('Cliquez sur la vidéo pour démarrer la lecture', 'warning');
  });
  
  video.onloadedmetadata = () => {
    console.log('✅ Métadonnées chargées:', video.videoWidth, 'x', video.videoHeight);
    if (video.videoWidth === 0) {
      console.error('⚠️ Largeur vidéo = 0, problème de stream');
    }
  };
  
  video.onplay = () => {
    console.log('▶️ Vidéo en lecture');
  };
  
  video.onerror = (e) => {
    console.error('❌ Erreur élément vidéo:', e);
  };
  
  elements.videoContainer.appendChild(video);
}

// ========================================
// SIGNALING WEBRTC (CORRIGÉ)
// ========================================

socket.on('webrtc-offer', async (data) => {
  console.log('📥 Offer reçue de', data.from.slice(0, 6));
  
  try {
    const pc = await createPeerConnection(data.from, false);
    
    console.log('  Définition RemoteDescription...');
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    console.log('  Création Answer...');
    // Créer answer avec options pour compatibilité
    const answer = await pc.createAnswer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: true
    });
    
    await pc.setLocalDescription(answer);
    
    console.log('  📤 Envoi Answer');
    socket.emit('webrtc-answer', {
      answer: answer,
      to: data.from
    });
  } catch (err) {
    console.error('❌ Erreur traitement offer:', err);
    socket.emit('webrtc-error', {
      error: err.message,
      peerId: data.from
    });
  }
});

socket.on('webrtc-answer', async (data) => {
  console.log('📥 Answer reçue de', data.from.slice(0, 6));
  
  const pc = state.peerConnections.get(data.from);
  if (pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      console.log('  ✅ RemoteDescription définie');
    } catch (err) {
      console.error('❌ Erreur setRemoteDescription:', err);
      socket.emit('webrtc-error', {
        error: err.message,
        peerId: data.from
      });
    }
  } else {
    console.warn('⚠️ PeerConnection non trouvée pour', data.from.slice(0, 6));
  }
});

socket.on('webrtc-ice', async (data) => {
  const pc = state.peerConnections.get(data.from);
  if (pc && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      // Log uniquement le premier ICE
      if (!pc._iceReceived) {
        console.log(`🧊 Premier ICE candidate reçu de ${data.from.slice(0, 6)}`);
        pc._iceReceived = true;
      }
    } catch (err) {
      console.error('❌ Erreur addIceCandidate:', err);
    }
  }
});

// ========================================
// ARRÊT DU PARTAGE
// ========================================

elements.stopBtn.addEventListener('click', stopSharing);

function stopSharing() {
  console.log('⏹️ Arrêt du partage...');
  
  if (state.isFullscreen) {
    exitFullscreen();
  }

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      track.stop();
      console.log('  ✅ Track arrêté:', track.kind);
    });
    state.localStream = null;
  }

  state.peerConnections.forEach((pc, peerId) => {
    console.log('  🗑️ Fermeture peer:', peerId.slice(0, 6));
    pc.close();
  });
  state.peerConnections.clear();

  socket.emit('stop-share');

  state.isSharing = false;
  elements.shareBtn.style.display = 'flex';
  elements.shareBtn.disabled = false;
  elements.shareBtn.innerHTML = '<span>📹</span><span>Partager mon écran</span>';
  elements.stopBtn.style.display = 'none';

  elements.videoContainer.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-icon">🖥️</div>
      <h3>Partage arrêté</h3>
      <p>Cliquez sur "Partager mon écran" pour recommencer</p>
    </div>
  `;

  elements.sharingStatus.textContent = 'Aucun partage actif';
  showAlert('Partage arrêté', 'info');
}

socket.on('host-stopped-sharing', (data) => {
  console.log('⏹️ Hôte a arrêté le partage:', data.message);
  
  if (state.isFullscreen) {
    exitFullscreen();
  }

  state.peerConnections.forEach(pc => pc.close());
  state.peerConnections.clear();
  state.hostId = null;

  elements.shareBtn.disabled = false;
  elements.sharingStatus.textContent = 'Aucun partage actif';

  if (!state.isSharing) {
    elements.videoContainer.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">🖥️</div>
        <h3>Partage terminé</h3>
        <p>${data.message}</p>
      </div>
    `;
    showAlert(data.message, 'info');
  }
});

// ========================================
// INITIALISATION
// ========================================

window.addEventListener('beforeunload', () => {
  if (state.isSharing) {
    stopSharing();
  }
});

window.addEventListener('orientationchange', () => {
  if (state.isFullscreen) {
    setTimeout(() => {
      const video = elements.videoContainer.querySelector('video');
      if (video) {
        video.style.width = '100%';
        video.style.height = '100%';
      }
    }, 100);
  }
});

// Charger les ICE servers au démarrage
fetchICEServers().then(() => {
  console.log('🚀 Application initialisée');
});
