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

// ===== IDENTIFICATION UNIQUE (Pour reconnexion) =====
let userId = localStorage.getItem('share_userId');
if (!userId) {
  userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('share_userId', userId);
}

// ===== ÉTAT GLOBAL =====
let state = {
  localStream: null,
  micStream: null,        // Flux MICRO (Nouveau)
  peerConnections: new Map(),
  videoSenders: new Map(), // NEW: Store video RTCRtpSender objects for removal
  isSharing: false,
  myName: '',
  hostId: null,
  iceServers: [],
  isFullscreen: false,
  micOn: true,
  camOn: true,
  audioOutputOn: true,    // CHANGÉ : true par défaut pour entendre les autres
  handRaised: false,
  viewMode: 'list',
  participants: []        // NOUVEAU : Cache local des participants
};

// ===== ÉLÉMENTS DOM =====
const elements = {
  // Nouveaux éléments de room.html
  shareBtn: document.getElementById('btnScreen'),
  requestBtn: document.getElementById('btnRequest'),
  micBtn: document.getElementById('btnMic'),
  raiseHandBtn: document.getElementById('btnRaiseHand'), // Nouveau bouton
  speakerBtn: document.getElementById('btnSpeaker'),     // Bouton Haut-parleur
  camBtn: document.getElementById('btnCam'),
  reactBtn: document.getElementById('btnReact'),
  hangupBtn: document.getElementById('btnHangup'),
  videoContainer: document.getElementById('screenShareContainer'),
  screenVideo: document.getElementById('screenVideo'),
  screenPlaceholder: document.getElementById('screenPlaceholder'),
  participantCount: document.getElementById('participantCount'),
  sideParticipantCount: document.getElementById('sideParticipantCount'),
  sharerName: document.getElementById('sharerName'),
  shareBadge: document.getElementById('shareBadge'),
  participantsList: document.getElementById('participantsList'),
  expandBtn: document.getElementById('expandBtn'),
  alertContainer: document.body, // Pour les alertes
  btnViewList: document.getElementById('btnViewList'),
  btnViewGrid: document.getElementById('btnViewGrid')
};

// ===== GESTIONNAIRES =====
let chatManager = null;
let shareRequestManager = null; 

function initializeManagers() {
  // ✅ INITIALISATION IMMÉDIATE DES GESTIONNAIRES
  if (typeof ChatManager !== 'undefined' && !window.chatManager) {
    window.chatManager = new ChatManager(socket);
    if (state.myName) window.chatManager.setUserName(state.myName);
    console.log('✅ ChatManager initialisé.');
  }

  if (typeof ShareRequestManager !== 'undefined' && !window.shareRequestManager) {
    window.shareRequestManager = new ShareRequestManager(socket, state, elements);
    console.log('✅ ShareRequestManager initialisé.');
  } else {
    console.warn('⚠️ ShareRequestManager non défini ou déjà initialisé.');
  }

  if (typeof NotesManager !== 'undefined' && !window.notesManager) {
    window.notesManager = new NotesManager();
    
    // Lier le bouton header
    const btnNotes = document.getElementById('btnNotes');
    if (btnNotes) {
      btnNotes.addEventListener('click', () => window.notesManager.toggle());
    }
  }
}

// ========================================
// UTILITAIRES
// ========================================

function stringToColorGradient(str) {
  const colors = [
    ['#006400','#004d00'], ['#1a6b3c','#0f4a2a'], ['#7c3aed','#5b21b6'],
    ['#b45309','#92400e'], ['#0369a1','#075985'], ['#be185d','#9d174d'],
    ['#047857','#065f46'], ['#1d4ed8','#1e3a8a'], ['#9333ea','#7e22ce'],
    ['#c2410c','#9a3412'],
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function showAlert(message, type = 'info', duration = 4000) {
  // Supprimer les alertes existantes pour éviter l'empilement
  document.querySelectorAll('.alert').forEach(a => a.remove());

  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  
  document.body.appendChild(alert);
  
  // Forcer le reflow pour que la transition CSS s'applique
  requestAnimationFrame(() => alert.classList.add('show'));

  if (duration > 0) {
    setTimeout(() => {
      alert.classList.remove('show');
      // Supprimer l'élément du DOM après la fin de la transition
      alert.addEventListener('transitionend', () => alert.remove(), { once: true });
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

// ===== FONCTIONS AUDIO/VIDÉO (Déplacées au niveau global) =====

async function initAudio() {
  try {
    console.log('🎙️ Demande accès micro...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    state.micStream = stream;
    console.log('✅ Micro activé');
    
    state.micStream.getAudioTracks().forEach(track => track.enabled = state.micOn);
    updateMicButton(state.micOn);
    return true;
  } catch (err) {
    console.warn('⚠️ Accès micro refusé ou impossible:', err);
    showAlert('Microphone non détecté ou refusé. Vous ne pourrez pas parler.', 'warning');
    state.micOn = false;
    updateMicButton(false);
    if(elements.micBtn) elements.micBtn.disabled = true;
    return false;
  }
}

function toggleMic() { 
  state.micOn = !state.micOn; 
  updateMicButton(state.micOn);
  if (state.micStream) {
    state.micStream.getAudioTracks().forEach(track => track.enabled = state.micOn);
  }
  socket.emit('mic-status', { micOn: state.micOn });
}

function toggleCam() { 
  state.camOn = !state.camOn; 
  updateCamButton(state.camOn);
  
  // Si on partage : couper/activer la piste vidéo du stream local
  if (state.localStream) {
    state.localStream.getVideoTracks().forEach(track => track.enabled = state.camOn);
  }
  
  // Aussi couper/activer l'affichage de la vidéo reçue (pour simuler "couper la caméra")
  if (elements.screenVideo) {
    elements.screenVideo.style.opacity = state.camOn ? '1' : '0';
  }
}

function toggleAudioOutput() {
  state.audioOutputOn = !state.audioOutputOn;
  updateSpeakerButton(state.audioOutputOn);
  
  document.querySelectorAll('audio.remote-audio').forEach(el => {
    el.muted = !state.audioOutputOn;
  });
  
  showAlert(state.audioOutputOn ? 'Haut-parleur activé' : 'Haut-parleur désactivé', 'info');
}

function toggleHand() {
  state.handRaised = !state.handRaised;
  socket.emit('toggle-hand');
  
  if (state.handRaised) {
    elements.raiseHandBtn.classList.add('active');
    elements.raiseHandBtn.innerHTML = '<i class="fa-solid fa-hand-paper"></i>';
  } else {
    elements.raiseHandBtn.classList.remove('active');
    elements.raiseHandBtn.innerHTML = '<i class="fa-regular fa-hand-paper"></i>';
  }
}

// Fonctions de mise à jour UI
function updateMicButton(isOn) {
  if (!elements.micBtn) return;
  if (isOn) {
    elements.micBtn.classList.remove('danger');
    elements.micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  } else {
    elements.micBtn.classList.add('danger');
    elements.micBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
  }
}

function updateCamButton(isOn) {
  if (!elements.camBtn) return;
  if (isOn) {
    elements.camBtn.classList.remove('danger');
    elements.camBtn.innerHTML = '<i class="fa-solid fa-video"></i>';
  } else {
    elements.camBtn.classList.add('danger');
    elements.camBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
  }
}

function updateSpeakerButton(isOn) {
  if (!elements.speakerBtn) return;
  if (isOn) {
    elements.speakerBtn.classList.remove('danger');
    elements.speakerBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
  } else {
    elements.speakerBtn.classList.add('danger');
    elements.speakerBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
  }
}

function updateViewButtons() {
  if (state.viewMode === 'list') {
    elements.btnViewList.classList.add('active');
    elements.btnViewGrid.classList.remove('active');
  } else {
    elements.btnViewList.classList.remove('active');
    elements.btnViewGrid.classList.add('active');
  }
}

// ===== GESTION DU PARTAGE (CORRECTION) =====
let shareBtnListenerAdded = false;

function initShareButton() {
  // On s'assure d'avoir la bonne référence sans cloner
  elements.shareBtn = document.getElementById('btnScreen');
  
  if (shareBtnListenerAdded) return;
  shareBtnListenerAdded = true;
  
  elements.shareBtn.addEventListener('click', () => {
    console.log('🖱️ Clic bouton partage | isSharing:', state.isSharing);
    
    if (state.isSharing) {
      console.log('⏹️ Arrêt du partage demandé...');
      stopSharing();
    } else {
      console.log(`📤 Demande de partage pour: ${state.myName}`);
      socket.emit('request-share', { name: state.myName });
    }
  });
}

// ========================================
// GESTION DU PLEIN ÉCRAN
// ========================================

// ========================================
// GESTION SOCKET.IO
// ========================================

socket.on('connect', () => {
  console.log('✅ Connecté au serveur | Socket ID:', socket.id);

  const params = new URLSearchParams(window.location.search);
  state.myName = params.get('name') || `User-${socket.id.slice(0, 4)}`;
  const roomId = params.get('room') || 'general';
  document.getElementById('roomIdDisplay').textContent = roomId;
  socket.emit('register', { name: state.myName, room: roomId, userId: userId });

  // Initialiser les gestionnaires après la connexion et l'enregistrement
  initializeManagers();
  
  // Initialiser le bouton de partage
  initShareButton();

  // --- GESTION DES CONTRÔLES ---
  if (elements.micBtn) {
    elements.micBtn.addEventListener('click', toggleMic);
  }
  if (elements.raiseHandBtn) {
    elements.raiseHandBtn.addEventListener('click', toggleHand);
  }
  if (elements.speakerBtn) {
    elements.speakerBtn.addEventListener('click', toggleAudioOutput);
  }
  if (elements.camBtn) {
    elements.camBtn.addEventListener('click', toggleCam);
  }
  
  // Gestion vue participants
  if (elements.btnViewList) elements.btnViewList.addEventListener('click', () => {
    state.viewMode = 'list';
    updateViewButtons();
    renderParticipants(state.participants); // Instantané grâce au cache
  });
  if (elements.btnViewGrid) elements.btnViewGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    updateViewButtons();
    renderParticipants(state.participants); // Instantané grâce au cache
  });

  // --- GESTIONNAIRE DE RÉACTIONS ---
  const reactWrapper = document.querySelector('.react-wrapper');
  if (reactWrapper) {
    const picker = reactWrapper.querySelector('.reactions-picker');
    
    // Appliquer la classe CSS du chat pour avoir le même style
    picker.classList.add('emoji-picker');

    // Définir les catégories pour la vidéo (Filtré : Pas de sport/objets)
    const reactionCategories = {
      smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '🤗', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😌', '😔', '😪', '🤤', '😴', '😎', '🥳', '🤯', '😱'],
      gestures: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '👋', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '👊', '✊', '🤛', '🤜'],
      hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
      party: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🔥', '💯', '✨', '⚡', '⭐', '🌟', '💥', '💫']
    };

    // Construire le HTML structuré (Header + Content)
    const header = document.createElement('div');
    header.className = 'emoji-picker-header';
    
    const content = document.createElement('div');
    content.className = 'emoji-picker-content';
    
    const cats = [
      { id: 'smileys', icon: '😊' },
      { id: 'gestures', icon: '👍' },
      { id: 'hearts', icon: '❤️' },
      { id: 'party', icon: '🎉' }
    ];

    // Créer les onglets
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'emoji-category-btn';
      if (cat.id === 'smileys') btn.classList.add('active');
      btn.innerHTML = cat.icon;
      btn.onclick = (e) => {
        e.stopPropagation();
        // Gestion active
        header.querySelectorAll('.emoji-category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Remplir le contenu
        fillContent(cat.id);
      };
      header.appendChild(btn);
    });

    function fillContent(catId) {
      content.innerHTML = '';
      reactionCategories[catId].forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.textContent = emoji;
        btn.onclick = () => {
          sendReaction(emoji);
          reactWrapper.classList.remove('active');
        };
        content.appendChild(btn);
      });
    }

    // Initialiser
    picker.appendChild(header);
    picker.appendChild(content);
    fillContent('smileys');

    elements.reactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      reactWrapper.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!reactWrapper.contains(e.target)) {
        reactWrapper.classList.remove('active');
      }
    });
  }

  // Initialiser l'état des boutons
  updateMicButton(state.micOn);
  updateCamButton(state.camOn);
  updateSpeakerButton(state.audioOutputOn);

  // ===== INITIALISATION AUDIO (Démarrage) =====
  async function initAudio() {
    try {
      console.log('🎙️ Demande accès micro...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      state.micStream = stream;
      console.log('✅ Micro activé');
      
      // Appliquer l'état muet si nécessaire
      state.micStream.getAudioTracks().forEach(track => track.enabled = state.micOn);
      
    } catch (err) {
      console.warn('⚠️ Accès micro refusé ou impossible:', err);
      showAlert('Microphone non détecté ou refusé. Vous ne pourrez pas parler.', 'warning');
      state.micOn = false;
      updateMicButton(false);
      if(elements.micBtn) elements.micBtn.disabled = true;
    }
  }
  initAudio(); // Lancer au démarrage

  function toggleMic() { 
    state.micOn = !state.micOn; 
    updateMicButton(state.micOn);
    // Appliquer au stream micro
    if (state.micStream) {
      state.micStream.getAudioTracks().forEach(track => track.enabled = state.micOn);
    }
  }

  function toggleCam() { 
    state.camOn = !state.camOn; 
    updateCamButton(state.camOn);
    // Appliquer au stream si actif
    if (state.localStream) {
      state.localStream.getVideoTracks().forEach(track => track.enabled = state.camOn);
    }
  }

  function toggleAudioOutput() {
    state.audioOutputOn = !state.audioOutputOn;
    updateSpeakerButton(state.audioOutputOn);
    
    // Couper/Activer tous les éléments audio distants
    document.querySelectorAll('audio.remote-audio').forEach(el => {
      el.muted = !state.audioOutputOn;
    });
    
    showAlert(state.audioOutputOn ? 'Haut-parleur activé' : 'Haut-parleur désactivé', 'info');
  }

  function updateSpeakerButton(isOn) {
    if (!elements.speakerBtn) return;
    if (isOn) {
      elements.speakerBtn.classList.remove('danger');
      elements.speakerBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
      elements.speakerBtn.classList.add('danger');
      elements.speakerBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
  }

  function updateMicButton(isOn) {
    if (!elements.micBtn) return;
    // Style: Rouge si coupé (danger), normal si activé
    if (isOn) {
      elements.micBtn.classList.remove('danger');
      elements.micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    } else {
      elements.micBtn.classList.add('danger');
      elements.micBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
    }
  }

  function updateCamButton(isOn) {
    if (!elements.camBtn) return;
    if (isOn) {
      elements.camBtn.classList.remove('danger');
      elements.camBtn.innerHTML = '<i class="fa-solid fa-video"></i>';
    } else {
      elements.camBtn.classList.add('danger');
      elements.camBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
    }
  }

  function toggleHand() {
    state.handRaised = !state.handRaised;
    socket.emit('toggle-hand');
    
    // Feedback visuel immédiat sur le bouton
    if (state.handRaised) {
      elements.raiseHandBtn.classList.add('active');
      elements.raiseHandBtn.innerHTML = '<i class="fa-solid fa-hand-paper"></i>'; // Main pleine
    } else {
      elements.raiseHandBtn.classList.remove('active');
      elements.raiseHandBtn.innerHTML = '<i class="fa-regular fa-hand-paper"></i>'; // Main vide
    }
  }
  
  function updateViewButtons() {
    if (state.viewMode === 'list') {
      elements.btnViewList.classList.add('active');
      elements.btnViewGrid.classList.remove('active');
    } else {
      elements.btnViewList.classList.remove('active');
      elements.btnViewGrid.classList.add('active');
    }
  }
});

socket.on('disconnect', () => {
  console.log('❌ Déconnecté du serveur');
  showAlert('Connexion perdue. Reconnexion...', 'warning');
});

socket.on('reconnect', () => {
  console.log('🔄 Reconnecté au serveur');
  showAlert('Reconnexion réussie !', 'success');
  const params = new URLSearchParams(window.location.search);
  state.myName = params.get('name') || `User-${socket.id.slice(0, 4)}`;
  const roomId = params.get('room') || 'general';
  socket.emit('register', { name: state.myName, room: roomId });
});

socket.on('initial-state', async (initialState) => {
  console.log('📊 État initial:', initialState);
  updateParticipantCount(initialState.connectedUsers);

  // 1. D'ABORD initialiser l'audio
  await initAudio();

  // NOUVEAU : Se connecter aux autres utilisateurs pour l'audio (Mesh)
  if (initialState.connectedUsersList) {
    initialState.connectedUsersList.forEach(async user => {
      if (user.id !== socket.id) {
        await createPeerConnection(user.id, true); // Initier la connexion
      }
    });
  }
  
  if (initialState.isSharing) {
    state.hostId = initialState.hostId;
    elements.sharerName.textContent = initialState.hostName;
    elements.shareBadge.style.display = 'flex';
    
    // Si je suis l'hôte (reconnu par socket ID ou logique serveur), je reprends le contrôle
    if (initialState.isYouHost) {
      // On cache le bouton de demande si affiché
      if (window.shareRequestManager) window.shareRequestManager.hideRequestButton();
      
      // On réinitialise l'état local pour permettre de relancer le stream
      state.isSharing = false; 
      
      elements.shareBtn.style.display = 'flex';
      elements.shareBtn.classList.remove('active');
      elements.shareBtn.classList.remove('danger');
      elements.shareBtn.innerHTML = '<i class="fa-solid fa-display"></i>';
      elements.shareBtn.title = "Reprendre le partage";
      
      showAlert('Session restaurée. Cliquez pour reprendre le partage.', 'success');
    } else {
      showAlert(`${initialState.hostName} partage actuellement`, 'info');
      // Note: Avec le Mesh Audio, la connexion est déjà établie ou en cours.
      // On envoie quand même viewer-ready pour la logique de partage d'écran spécifique si besoin.
      
      // Afficher le bouton de demande
      if (window.shareRequestManager) window.shareRequestManager.showRequestButton();
    }
  } else {
    // Personne ne partage
    state.isSharing = false;
    elements.shareBtn.style.display = 'flex';
    elements.shareBtn.classList.remove('active');
    elements.sharerName.textContent = 'Personne';
    elements.shareBadge.style.display = 'none';
    
    // Message de bienvenue par défaut
    if (elements.screenPlaceholder) {
       elements.screenPlaceholder.querySelector('p').innerHTML = 'Bienvenue dans <strong>ESTLC SHARING SCREEN</strong><br>En attente du partage...';
    }
    
    if (window.shareRequestManager) window.shareRequestManager.hideRequestButton();
  }
});

socket.on('user-count-update', (data) => {
  updateParticipantCount(data.count);
});

socket.on('host-name-updated', (data) => {
  if (state.hostId) {
    elements.sharerName.textContent = data.newName;
  }
});

socket.on('users-update', (users) => {
  state.participants = users; // Mise à jour du cache local
  renderParticipants(users);
});

socket.on('user-joined', (newUser) => {
  console.log('👤 Nouvel utilisateur:', newUser.name);
  showAlert(`${newUser.name} a rejoint la session`, 'info');
  // On attend que le nouvel utilisateur initie la connexion (convention Mesh)
  // ou on peut initier aussi. Ici, on laisse faire l'initial-state du nouveau.
});

socket.on('mute-command', (data) => {
  if (state.micOn) {
    // On simule un clic sur le bouton micro pour tout mettre à jour proprement
    if (elements.micBtn) elements.micBtn.click();
    showAlert(`Votre micro a été coupé par ${data.by}`, 'warning');
  }
});

socket.on('hand-update', (data) => {
  // Si une main est levée et que je suis l'hôte (celui qui partage), je reçois une alerte
  if (data.handRaised && data.userId !== socket.id) {
    if (state.hostId === socket.id) {
      showAlert(`✋ ${data.userName} a levé la main`, 'info');
    }
  }
});

socket.on('hand-raised-alert', (data) => {
  showHandRaisedNotification(data.userId, data.userName);
});

// ===== RÉCEPTION : MON MICRO EST AUTORISÉ =====
socket.on('mic-allowed', (data) => {
  showAlert(`✅ ${data.by} vous autorise à parler !`, 'success', 6000);
  
  // Activer automatiquement le micro si il était coupé
  if (!state.micOn) {
    state.micOn = true;
    updateMicButton(true);
    if (state.micStream) {
      state.micStream.getAudioTracks().forEach(t => t.enabled = true);
    }
  }
  
  // Afficher une bannière visible
  const banner = document.createElement('div');
  banner.className = 'mic-allowed-banner';
  banner.innerHTML = `
    <div class="mic-banner-content">
      <span>🎤</span>
      <span><strong>${data.by}</strong> vous autorise à parler</span>
      <button onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner?.remove(), 8000);
});

function updateParticipantCount(count) {
  if (elements.participantCount) elements.participantCount.textContent = count;
  if (elements.sideParticipantCount) elements.sideParticipantCount.textContent = count;
}

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function renderParticipants(participants = []) {
  if (!elements.participantsList) return;
  const isMeHost = state.hostId === socket.id; // Ou logique pour déterminer le modérateur
  
  // Appliquer la classe de vue
  elements.participantsList.className = `participants-list ${state.viewMode === 'grid' ? 'grid-view' : ''}`;

  let html = '';

  // Séparer l'hôte des autres
  const host = participants.find(p => p.id === state.hostId);
  const others = participants.filter(p => p.id !== state.hostId);
  const raisedHands = others.filter(p => p.handRaised);
  const normalParticipants = others.filter(p => !p.handRaised);

  // 1. Section Mains Levées (Prioritaire)
  if (raisedHands.length > 0) {
    html += `<div class="section-label raised-hands-section">✋ Mains levées (${raisedHands.length})</div>`;
    raisedHands.forEach(p => {
      html += buildParticipantCard(p, false, true, isMeHost);
    });
  }

  if (host) {
    html += `<div class="section-label">Hôte</div>`;
    html += buildParticipantCard(host, true, false, isMeHost);
  }

  if (normalParticipants.length > 0) {
    html += `<div class="section-label">Participants (${normalParticipants.length})</div>`;
    normalParticipants.forEach(p => {
      html += buildParticipantCard(p, false, false, isMeHost);
    });
  }

  elements.participantsList.innerHTML = html;
}

function buildParticipantCard(p, isHost, isHandRaised, isMeHost) {
  const [bg1, bg2] = stringToColorGradient(p.name || p.id);
  const initials = getInitials(p.name);
  const isMe = p.id === socket.id;
  const statusText = isHost ? (state.isSharing ? 'Partage en cours' : 'Hôte') : 'Connecté';
  
  // Boutons d'action
  let modActions = '';
  
  // Si je suis l'hôte et que ce n'est pas moi
  if (isMeHost && !isMe) {
    // Bouton Micro (Couper / Demander d'activer)
    modActions = `
      <button class="p-action-btn ${p.micOn === false ? '' : 'active'}" 
              onclick="event.stopPropagation(); toggleUserMic('${p.id}', '${p.name.replace(/'/g, "\\'")}')" 
              title="${p.micOn === false ? 'Activer micro' : 'Couper micro'}">
        ${p.micOn === false ? '🔇' : '🎤'}
      </button>
    `;
    
    // Si main levée, bouton pour la baisser
    if (isHandRaised) {
      modActions += `
        <button class="p-action-btn warning" 
                onclick="event.stopPropagation(); lowerUserHand('${p.id}', '${p.name.replace(/'/g, "\\'")}')" 
                title="Baisser la main">
          ✋
        </button>
      `;
    }
  }

  return `
    <div class="participant-card ${isHost ? 'is-host' : ''} ${isHandRaised ? 'hand-raised-item' : ''} ${isMe ? 'is-me' : ''}" ${!isMe ? `onclick="window.chatManager.initiatePrivateChat('${p.id}', '${p.name.replace(/'/g, "\\'")}')"` : ''}>
      <div class="p-avatar" style="background: linear-gradient(135deg, ${bg1}, ${bg2})">
        ${initials}
        ${isHandRaised ? '<div class="hand-badge">✋</div>' : '<div class="status-dot"></div>'}
      </div>
      <div class="p-info">
        <div class="p-name">
          ${p.name} ${isMe ? '(Vous)' : ''}
          ${isHost ? '<i class="fa-solid fa-crown" style="color:#f59e0b;font-size:10px"></i>' : ''}
        </div>
        <div class="p-status ${isHost && state.isSharing ? 'sharing' : ''}">
          ${statusText}
          ${p.micOn === false ? ' · 🔇 Micro coupé' : ' · 🎤 Micro actif'}
        </div>
      </div>
      <div class="participant-actions">
        ${modActions}
        <button class="p-action-btn" onclick="event.stopPropagation(); window.chatManager.initiatePrivateChat('${p.id}', '${p.name.replace(/'/g, "\\'")}')" title="Message privé"><i class="fa-regular fa-comment-dots"></i></button>
      </div>
    </div>
  `;
}

// ========================================
// GESTION DES RÉACTIONS
// ========================================

function sendReaction(emoji) {
  console.log(`📤 Envoi réaction: ${emoji}`);
  socket.emit('video-reaction', { emoji: emoji });
  // Afficher la réaction localement aussi
  displayReaction(emoji);
}

socket.on('video-reaction', (data) => {
  console.log(`📥 Réaction reçue: ${data.emoji}`);
  displayReaction(data.emoji);
});

function displayReaction(emoji) {
  // Cible le conteneur vidéo pour que les émojis restent dedans
  const container = document.getElementById('screenShareContainer') || document.body;
  
  const reactionEl = document.createElement('div');
  reactionEl.className = 'floating-reaction';
  reactionEl.textContent = emoji;
  
  // Position horizontale aléatoire centrée (20% - 80%)
  const leftPos = 20 + Math.random() * 60;
  reactionEl.style.left = `${leftPos}%`;
  
  container.appendChild(reactionEl);
  setTimeout(() => reactionEl.remove(), 4000); // Durée de l'animation
}

// ===== FONCTIONS DE MODÉRATION & NOTIFICATIONS =====

window.toggleUserMic = function(targetId, targetName) {
  socket.emit('mute-user', { targetId });
  showAlert(`Commande envoyée pour ${targetName}`, 'info');
};

// L'hôte baisse la main d'un participant
window.lowerUserHand = function(targetId, targetName) {
  socket.emit('lower-hand', { targetId });
  showAlert(`Main de ${targetName} baissée`, 'info');
};

window.allowMic = function(targetId, targetName) {
  socket.emit('allow-mic', { targetId });
  showAlert(`🎤 Micro autorisé pour ${targetName}`, 'success');
  const notif = document.getElementById(`hand-notif-${targetId}`);
  if (notif) notif.remove();
};

window.dismissHand = function(userId) {
  const notif = document.getElementById(`hand-notif-${userId}`);
  if (notif) notif.remove();
};

function showHandRaisedNotification(userId, userName) {
  const existing = document.getElementById(`hand-notif-${userId}`);
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.id = `hand-notif-${userId}`;
  notif.className = 'hand-raised-notif';
  notif.innerHTML = `
    <div class="hand-notif-content">
      <span class="hand-notif-icon">✋</span>
      <div class="hand-notif-info">
        <strong>${userName}</strong>
        <span>a levé la main</span>
      </div>
      <div class="hand-notif-actions">
        <button class="btn-allow-mic" onclick="allowMic('${userId}', '${userName}')">🎤 Autoriser</button>
        <button class="btn-dismiss-hand" onclick="dismissHand('${userId}')">✕</button>
      </div>
    </div>
  `;
  document.body.appendChild(notif);
  setTimeout(() => { if (document.body.contains(notif)) notif.remove(); }, 30000);
}

// Réception commande "Baisser la main" (pour le participant concerné)
socket.on('lower-hand-command', () => {
  if (state.handRaised) {
    toggleHand(); // Cela va émettre toggle-hand et mettre à jour l'état local
    showAlert('Votre main a été baissée par l\'hôte', 'info');
  }
});

socket.on('share-approved', async () => {
  console.log('✅ Partage approuvé - Démarrage capture écran...');
  
  try {
    elements.shareBtn.disabled = true;
    elements.shareBtn.classList.add('loading');

    state.localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 }
      },
      audio: true // Demander l'audio système
    });

    console.log('✅ Écran capturé, tracks:', state.localStream.getTracks().length);

    elements.shareBtn.disabled = false;
    elements.shareBtn.classList.remove('loading');

    socket.emit('share-started', { name: state.myName });
    displayLocalVideo();

    // Appliquer l'état initial des boutons (mic/cam)
    state.localStream.getAudioTracks().forEach(track => track.enabled = state.micOn);
    state.localStream.getVideoTracks().forEach(track => track.enabled = state.camOn);

    state.isSharing = true;
    elements.shareBtn.classList.add('active');
    // Changer l'icône et le titre pour indiquer l'arrêt
    elements.shareBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    elements.shareBtn.title = "Arrêter le partage";
    elements.shareBtn.classList.add('danger'); // Ajouter une classe pour le style rouge si souhaité
    elements.sharerName.textContent = 'Vous';
    elements.shareBadge.style.display = 'flex';
    showAlert('Partage démarré !', 'success');
    
    // AJOUTER LE FLUX AUX CONNEXIONS EXISTANTES (Renégociation)
    addLocalStreamToPeers();

    state.localStream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('⏹️ Partage arrêté par l\'utilisateur');
      stopSharing();
    });

  } catch (err) {
    console.error('❌ Erreur capture écran:', err);
    elements.shareBtn.disabled = false;
    elements.shareBtn.classList.remove('loading');
    
    if (err.name === 'NotAllowedError') {
      showAlert('Permission refusée. Autorisez le partage.', 'error');
    } else {
      showAlert('Erreur: ' + err.message, 'error');
    }
  }
});

function addLocalStreamToPeers() {
  if (!state.localStream) return;
  state.peerConnections.forEach((pc, peerId) => {
    // Only add video tracks if not already added for this peer
    const existingVideoSender = state.videoSenders.get(peerId);
    if (!existingVideoSender || existingVideoSender.track?.kind !== 'video') {
      state.localStream.getVideoTracks().forEach(track => {
        const sender = pc.addTrack(track, state.localStream);
        state.videoSenders.set(peerId, sender); // Store the video sender
        console.log(`➕ Ajout track écran vers ${peerId.slice(0,6)}`);
      });
    }
  });
}

socket.on('share-blocked', (data) => {
  showAlert(`${data.currentHost} partage déjà son écran`, 'warning');
});

function displayLocalVideo() {
  elements.screenPlaceholder.style.display = 'none';
  elements.screenVideo.srcObject = state.localStream;
  elements.screenVideo.style.display = 'block';
  elements.screenVideo.muted = true;
}

// ========================================
// WEBRTC PEER CONNECTIONS
// ========================================

socket.on('viewer-joined', async (data) => {
  // Note: Avec le Mesh Audio, la connexion est probablement déjà là.
  // Si ce n'est pas le cas (ex: race condition), createPeerConnection gérera.
  // Si on partage, on doit s'assurer que le nouveau reçoit le flux.
  if (state.isSharing && state.localStream) {
    const pc = state.peerConnections.get(data.viewerId);
    if (pc) {
      // Les tracks seront ajoutés via la logique de connexion ou renegotiation
    }
  }
});

socket.on('host-started-sharing', (data) => {
  console.log('🎥 Hôte commence à partager:', data.hostName);
  state.hostId = data.hostId;
  elements.sharerName.textContent = data.hostName;
  elements.shareBadge.style.display = 'flex';

  showAlert(`${data.hostName} partage maintenant`, 'info');
  
  // viewer-ready est moins critique maintenant avec le Mesh, mais on le garde pour la compatibilité

  // Afficher le bouton de demande pour les spectateurs
  if (window.shareRequestManager) window.shareRequestManager.showRequestButton();
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

  // Gérer la renégociation (pour ajouter l'écran après coup)
  pc.onnegotiationneeded = async () => {
    // FIX: On doit renégocier si on est l'initiateur OU si on partage l'écran (ajout de tracks)
    if (isInitiator || state.isSharing) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { offer, to: peerId });
      } catch (err) { console.error('Renegotiation error', err); }
    }
  };

  // FIX: Ajouter les tracks écran même si on n'est pas l'initiateur
  if (state.localStream) {
    console.log(`[${peerId.slice(0, 6)}] Ajout des tracks ÉCRAN au peer`);
    state.localStream.getVideoTracks().forEach(track => {
      const sender = pc.addTrack(track, state.localStream);
      state.videoSenders.set(peerId, sender); // Important : Stocker le sender pour pouvoir le retirer plus tard
    });
  }

  // AJOUTER LES TRACKS AUDIO (Micro)
  if (state.micStream) {
    console.log(`[${peerId.slice(0, 6)}] Ajout des tracks MICRO au peer`);
    state.micStream.getTracks().forEach(track => {
      pc.addTrack(track, state.micStream);
    });
  }

  // CRÉATION DE L'OFFRE (Si initiateur) - SORTI DU BLOC IF
  if (isInitiator) {
    try {
      const offer = await pc.createOffer({
         // Important pour entendre les autres
        offerToReceiveAudio: true,
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
  }

  // GESTION DES PISTES REÇUES - SORTI DU BLOC ELSE (Toujours actif)
  pc.ontrack = (event) => {
    console.log(`[${peerId.slice(0, 6)}] ✅ Track reçu: ${event.track.kind}`);
    
    // Si c'est de la vidéo -> C'est le partage d'écran
    if (event.track.kind === 'video' && event.streams && event.streams[0]) {
      displayRemoteVideo(event.streams[0]);
      showAlert('Affichage du partage', 'success');
    }
    // Si c'est de l'audio -> C'est la voix
    if (event.track.kind === 'audio' && event.streams && event.streams[0]) {
      const audioEl = document.createElement('audio');
      audioEl.className = 'remote-audio'; // Classe pour pouvoir les contrôler
      audioEl.srcObject = event.streams[0];
      audioEl.autoplay = true;
      audioEl.muted = !state.audioOutputOn; // Respecter l'état du bouton haut-parleur
      document.body.appendChild(audioEl); // Important : ajouter au DOM
    }
  };

  return pc;
}

function displayRemoteVideo(stream) {
  elements.screenPlaceholder.style.display = 'none';
  elements.screenVideo.srcObject = stream;
  elements.screenVideo.style.display = 'block';
  elements.screenVideo.muted = false;
  elements.screenVideo.play().catch(e => console.error("Erreur lecture vidéo distante", e));
}

// ========================================
// SIGNALING WEBRTC
// ========================================

socket.on('webrtc-offer', async (data) => {
  console.log('📥 Offer reçue de', data.from.slice(0, 6));
  
  try {
    // FIX: Réutiliser la connexion existante si elle existe (pour la renégociation)
    let pc = state.peerConnections.get(data.from);
    if (!pc) {
      pc = await createPeerConnection(data.from, false);
    }
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    const answer = await pc.createAnswer({
      offerToReceiveAudio: true,
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

function stopSharing() {
  console.log('⏹️ Arrêt du partage... | isSharing était:', state.isSharing);
  
  // Mettre à false EN PREMIER
  state.isSharing = false;

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      track.stop();
      console.log('🛑 Track arrêté:', track.kind);
    });
    state.localStream = null;
  }

  // Retirer les pistes vidéo de toutes les connexions peer
  state.videoSenders.forEach((sender, peerId) => {
    const pc = state.peerConnections.get(peerId);
    if (pc && sender) {
      try {
        pc.removeTrack(sender);
        console.log(`➖ Retrait track vidéo de ${peerId.slice(0,6)}`);
      } catch (e) {
        console.error(`❌ Erreur lors du retrait de la piste vidéo de ${peerId.slice(0,6)}:`, e);
      }
    }
  });
  state.videoSenders.clear(); // Vider la map des senders vidéo
  
  socket.emit('stop-share');

  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('active', 'loading', 'danger');
  // Rétablir l'icône de partage
  elements.shareBtn.innerHTML = '<i class="fa-solid fa-display"></i>';
  elements.shareBtn.title = "Partager l'écran";

  elements.screenVideo.srcObject = null;
  elements.screenVideo.style.display = 'none';
  elements.screenPlaceholder.style.display = 'flex';
  
  // Message de bienvenue
  if (elements.screenPlaceholder) {
     elements.screenPlaceholder.querySelector('p').innerHTML = 'Bienvenue dans <strong>ESTLC SHARING SCREEN</strong><br>En attente du partage...';
  }
  elements.shareBadge.style.display = 'none';

  showAlert('Partage arrêté', 'info');
}

socket.on('host-stopped-sharing', (data) => {
  console.log('⏹️ Hôte a arrêté le partage:', data.message);
  
  state.hostId = null;
  // On garde les connexions pour l'audio

  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('active');
  // Rétablir l'icône de partage au cas où
  elements.shareBtn.innerHTML = '<i class="fa-solid fa-display"></i>';
  elements.shareBtn.style.display = 'flex';
  elements.shareBtn.title = "Partager l'écran";
  elements.shareBtn.classList.remove('danger');

  if (!state.isSharing) {
    elements.screenVideo.srcObject = null;
    elements.screenVideo.style.display = 'none';
    elements.screenPlaceholder.style.display = 'flex';
    // Message de bienvenue
    if (elements.screenPlaceholder) {
       elements.screenPlaceholder.querySelector('p').innerHTML = 'Bienvenue dans <strong>ESTLC SHARING SCREEN</strong><br>En attente du partage...';
    }
    elements.sharerName.textContent = 'Personne';
    elements.shareBadge.style.display = 'none';
    showAlert(data.message, 'info');
    
    // Cacher le bouton de demande
    if (window.shareRequestManager) window.shareRequestManager.hideRequestButton();
  }
});

// ✅ NOUVEAU: Arrêt forcé du partage (quand l'hôte accepte une demande)
socket.on('force-stop-share', (data) => {
  console.log('⚠️ Arrêt forcé du partage:', data.reason);
  
  // 1. Arrêter le partage localement (similaire à stopSharing mais sans émettre stop-share)
  state.isSharing = false;

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }

  // Retirer les pistes vidéo des connexions (mais garder l'audio)
  state.videoSenders.forEach((sender, peerId) => {
    const pc = state.peerConnections.get(peerId);
    if (pc && sender) {
      try { pc.removeTrack(sender); } catch (e) {}
    }
  });
  state.videoSenders.clear();

  // 2. Mise à jour UI
  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('active', 'loading', 'danger');
  elements.shareBtn.innerHTML = '<i class="fa-solid fa-display"></i>';
  elements.shareBtn.title = "Partager l'écran";
  elements.shareBtn.style.display = 'flex';

  elements.screenVideo.srcObject = null;
  elements.screenVideo.style.display = 'none';
  elements.screenPlaceholder.style.display = 'flex';
  elements.shareBadge.style.display = 'none';

  showAlert(data.message, 'success');
});

// ========================================
// INITIALISATION
// ========================================

// Note: On ne force plus le stopSharing() sur beforeunload pour permettre la reconnexion

// Charger les ICE servers au démarrage
fetchICEServers().then(() => {
  console.log('🚀 Application initialisée');
});
