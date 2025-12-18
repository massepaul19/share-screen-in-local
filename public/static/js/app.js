// ========================================
// public/app.js - Version avec système de demande de partage
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
  isFullscreen: false
};

// ===== ÉLÉMENTS DOM =====
const elements = {
  nameInput: document.getElementById('nameInput'),
  shareBtn: document.getElementById('shareBtn'),
  requestBtn: document.getElementById('requestBtn'),  // ✅ AJOUTÉ
  stopBtn: document.getElementById('stopBtn'),
  videoContainer: document.getElementById('videoContainer'),
  userCount: document.getElementById('userCount'),
  sharingStatus: document.getElementById('sharingStatus'),
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  alertContainer: document.getElementById('alertContainer')
};

// ===== GESTIONNAIRES =====
let chatManager = null;
let shareRequestManager = null; 
let p2pCallManager = null;  
let p2pCallUI = null;
let p2pUsersManager = null; // ✅ AJOUTÉ

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

// Exposer showAlert globalement pour le chat
window.showAlert = showAlert;

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
  
  const defaultName = `User-${socket.id.slice(0, 4).toUpperCase()}`;
  state.myName = defaultName;
  socket.emit('register', { name: defaultName });
  
  // Initialiser le chat après la connexion
  if (!chatManager) {
    chatManager = new ChatManager(socket);
    window.chatManager = chatManager;
  }
  
  // ✅ INITIALISER LE GESTIONNAIRE DE DEMANDES
  if (!shareRequestManager) {
    shareRequestManager = new ShareRequestManager(socket, state, elements);
    window.shareRequestManager = shareRequestManager;
  }

  // ✅ INITIALISER LES APPELS P2P ICI
  if (!p2pCallManager) {
    p2pCallManager = new P2PCallManager(socket);
    p2pCallUI = new P2PCallUI(p2pCallManager);
    p2pCallManager.setUI(p2pCallUI);
    
    // Exposer globalement
    window.p2pCallManager = p2pCallManager;
    window.p2pCallUI = p2pCallUI;
    
    console.log('✅ Gestionnaires d\'appels P2P initialisés');
  }

  // ✅ Initialiser P2P Users Manager
  if (!p2pUsersManager) {
    p2pUsersManager = new P2PUsersManager(socket);
    window.p2pUsersManager = p2pUsersManager;
    console.log('✅ Gestionnaire de liste P2P initialisé');
  }

  // Initialiser le gestionnaire de réactions vidéo
  if (typeof initVideoReactions === 'function') {
    initVideoReactions(socket);
  }
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
      // ✅ AFFICHER LE BOUTON "DEMANDER À PARTAGER"
      elements.shareBtn.style.display = 'none';
      elements.requestBtn.style.display = 'flex';
      
      if (window.videoReactionManager) {
        window.videoReactionManager.show();
      }

      showAlert(`${initialState.hostName} partage actuellement`, 'info');
      console.log('👁️ Envoi viewer-ready vers hôte:', initialState.hostId);
      socket.emit('viewer-ready', { hostId: initialState.hostId });
    } else {
      state.isSharing = true;
      elements.shareBtn.style.display = 'none';
      elements.stopBtn.style.display = 'flex';
      if (window.videoReactionManager) {
        window.videoReactionManager.show();
      }
    }
  }
});

socket.on('user-count-update', (data) => {
  elements.userCount.textContent = data.count;
});

socket.on('host-name-updated', (data) => {
  if (state.hostId) {
    elements.sharingStatus.textContent = `${data.newName} partage son écran`;
  }
});

// Mettre à jour le nom pour le partage d'écran
elements.nameInput.addEventListener('change', () => {
  const newName = elements.nameInput.value.trim();
  if (newName) {
    state.myName = newName;
  }
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
    elements.requestBtn.style.display = 'none';  // ✅ CACHER LE BOUTON DE DEMANDE
    elements.stopBtn.style.display = 'flex';
    elements.sharingStatus.textContent = 'Vous partagez votre écran';
    if (window.videoReactionManager) {
      window.videoReactionManager.show();
    }
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
// WEBRTC PEER CONNECTIONS
// ========================================

socket.on('viewer-joined', async (data) => {
  console.log('👁️ Nouveau viewer rejoint:', data.viewerName || data.viewerId.slice(0, 6));
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
  
  // ✅ AFFICHER LE BOUTON "DEMANDER À PARTAGER"
  elements.shareBtn.style.display = 'none';
  elements.requestBtn.style.display = 'flex';
  
  if (window.videoReactionManager) {
    window.videoReactionManager.show();
  }

  showAlert(`${data.hostName} partage maintenant`, 'info');
  
  console.log('👁️ Envoi viewer-ready vers hôte:', data.hostId);
  socket.emit('viewer-ready', { hostId: data.hostId });
});

async function createPeerConnection(peerId, isInitiator) {
  console.log(`🔗 Création connexion peer avec ${peerId.slice(0, 6)} (initiator: ${isInitiator})`);
  
  const pc = new RTCPeerConnection({ 
    iceServers: state.iceServers,
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  });
  
  state.peerConnections.set(peerId, pc);

  pc.onconnectionstatechange = () => {
    console.log(`[${peerId.slice(0, 6)}] Connection state: ${pc.connectionState}`);
    
    if (pc.connectionState === 'connected') {
      console.log(`✅ WebRTC connecté avec ${peerId.slice(0, 6)}`);
      socket.emit('webrtc-connected', {
        peerId: peerId,
        hostId: state.hostId || socket.id
      });
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      console.error(`❌ Connexion ${pc.connectionState} avec ${peerId.slice(0, 6)}`);
      socket.emit('webrtc-error', {
        error: `Connection ${pc.connectionState}`,
        peerId: peerId
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[${peerId.slice(0, 6)}] ICE state: ${pc.iceConnectionState}`);
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
    console.log(`[${peerId.slice(0, 6)}] Ajout des tracks au peer`);
    
    state.localStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localStream);
      console.log(`  ✅ Track ajouté: ${track.kind}`);
    });

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      
      console.log(`[${peerId.slice(0, 6)}] 📤 Envoi offer`);
      
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
    pc.ontrack = (event) => {
      console.log(`[${peerId.slice(0, 6)}] ✅ Track reçu: ${event.track.kind}`);
      
      if (event.streams && event.streams[0]) {
        console.log(`[${peerId.slice(0, 6)}] 📺 Affichage du stream...`);
        displayRemoteVideo(event.streams[0]);
        if (window.videoReactionManager) {
          window.videoReactionManager.show();
        }
        showAlert('Affichage du partage', 'success');
        
        setTimeout(() => {
          showVideoHint('Cliquez pour agrandir en plein écran 🔍');
        }, 2000);
      }
    };
  }

  return pc;
}

function displayRemoteVideo(stream) {
  console.log('📺 Affichage vidéo distante');
  
  elements.videoContainer.innerHTML = '';
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  
  video.play().catch(err => {
    console.error('❌ Erreur video.play():', err);
    showAlert('Cliquez sur la vidéo pour démarrer la lecture', 'warning');
  });
  
  elements.videoContainer.appendChild(video);
}

// ========================================
// SIGNALING WEBRTC
// ========================================

socket.on('webrtc-offer', async (data) => {
  console.log('📥 Offer reçue de', data.from.slice(0, 6));
  
  try {
    const pc = await createPeerConnection(data.from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    const answer = await pc.createAnswer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: true
    });
    
    await pc.setLocalDescription(answer);
    
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
    }
  }
});

socket.on('webrtc-ice', async (data) => {
  const pc = state.peerConnections.get(data.from);
  if (pc && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      if (!pc._iceReceived) {
        console.log(`🧊 ICE candidate reçu de ${data.from.slice(0, 6)}`);
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
    });
    state.localStream = null;
  }

  state.peerConnections.forEach((pc) => {
    pc.close();
  });
  state.peerConnections.clear();

  socket.emit('stop-share');

  state.isSharing = false;
  elements.shareBtn.style.display = 'flex';
  elements.shareBtn.disabled = false;
  elements.shareBtn.innerHTML = '<span>📹</span><span>Partager mon écran</span>';
  elements.requestBtn.style.display = 'none';  // ✅ CACHER LE BOUTON DE DEMANDE
  elements.stopBtn.style.display = 'none';

  if (window.videoReactionManager) {
    window.videoReactionManager.hide();
  }

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

  // ✅ RÉAFFICHER LE BOUTON "PARTAGER MON ÉCRAN"
  elements.shareBtn.style.display = 'flex';
  elements.shareBtn.disabled = false;
  elements.requestBtn.style.display = 'none';
  elements.sharingStatus.textContent = 'Aucun partage actif';

  if (window.videoReactionManager) {
    window.videoReactionManager.hide();
  }

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

// ✅ NOUVEAU: Arrêt forcé du partage (quand l'hôte accepte une demande)
socket.on('force-stop-share', (data) => {
  console.log('⚠️ Arrêt forcé du partage:', data.reason);
  
  if (state.isFullscreen) {
    exitFullscreen();
  }

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      track.stop();
    });
    state.localStream = null;
  }

  state.peerConnections.forEach((pc) => {
    pc.close();
  });
  state.peerConnections.clear();

  state.isSharing = false;
  elements.shareBtn.style.display = 'flex';
  elements.shareBtn.disabled = false;
  elements.shareBtn.innerHTML = '<span>📹</span><span>Partager mon écran</span>';
  elements.requestBtn.style.display = 'none';
  elements.stopBtn.style.display = 'none';

  if (window.videoReactionManager) {
    window.videoReactionManager.hide();
  }

  elements.videoContainer.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-icon">🖥️</div>
      <h3>Partage transféré</h3>
      <p>${data.message}</p>
    </div>
  `;

  elements.sharingStatus.textContent = 'Aucun partage actif';
  showAlert(data.message, 'success');
});

// ========================================
// INITIALISATION
// ========================================

window.addEventListener('beforeunload', () => {
  if (state.isSharing) {
    stopSharing();
  }
});

// Charger les ICE servers au démarrage
fetchICEServers().then(() => {
  console.log('🚀 Application initialisée');
});
