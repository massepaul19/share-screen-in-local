// ========================================
// public/app.js - Version avec système de demande de partage
// ========================================

console.log('🚀 app.js chargé - Initialisation...');

// ===== CONFIGURATION =====
const socket = io({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10
});

console.log('🔌 Socket.IO initialisé, tentative de connexion...');
window.socket = socket; // Exposer pour participant-admin.js

// ===== IDENTIFICATION UNIQUE (Pour reconnexion) =====
let userId = localStorage.getItem('share_userId');
if (!userId) {
  userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('share_userId', userId);
}

// ===== PARAMÈTRES DE SALLE =====
const pageParams    = new URLSearchParams(window.location.search);
const initialRoomId = pageParams.get('room') || 'general';
const initialName   = pageParams.get('name') || '';

// ===== ÉTAT GLOBAL =====
let state = {
  localStream:     null,
  micStream:       null,
  peerConnections: new Map(),
  videoSenders:    new Map(),
  isSharing:       false,
  myName:          '',
  hostId:          null,
  iceServers:      [],
  isFullscreen:    false,
  micOn:           true,
  camOn:           true,
  audioOutputOn:   true,
  handRaised:      false,
  viewMode:        'list',
  participants:    []
};
window.state = state; // Exposer pour participant-admin.js

if (initialName) {
  state.myName = decodeURIComponent(initialName);
}

// Exposer les utilitaires
window.stringToColorGradient = stringToColorGradient;
window.getInitials           = getInitials;
window.setHostControls = (isHost) => {
  state.isAdmin = isHost;
  // Notifier le ContentShareManager du changement de rôle
  if (window.contentShareManager) window.contentShareManager.setHost(isHost);
};

// ===== ÉLÉMENTS DOM =====
const elements = {
  shareBtn:          document.getElementById('btnScreen'),
  requestBtn:        document.getElementById('btnRequest'),
  micBtn:            document.getElementById('btnMic'),
  raiseHandBtn:      document.getElementById('btnRaiseHand'),
  speakerBtn:        document.getElementById('btnSpeaker'),
  camBtn:            document.getElementById('btnCam'),
  reactBtn:          document.getElementById('btnReact'),
  hangupBtn:         document.getElementById('btnHangup'),
  videoContainer:    document.getElementById('screenShareContainer'),
  screenVideo:       document.getElementById('screenVideo'),
  screenPlaceholder: document.getElementById('screenPlaceholder'),
  participantCount:  document.getElementById('participantCount'),
  sideParticipantCount: document.getElementById('sideParticipantCount'),
  sharerName:        document.getElementById('sharerName'),
  shareBadge:        document.getElementById('shareBadge'),
  participantsList:  document.getElementById('participantsList'),
  expandBtn:         document.getElementById('expandBtn'),
  alertContainer:    document.body,
  btnViewList:       document.getElementById('btnViewList'),
  btnViewGrid:       document.getElementById('btnViewGrid')
};

if (elements.alertContainer) {
  const roomDisplayEl = document.getElementById('roomIdDisplay');
  if (roomDisplayEl) {
    roomDisplayEl.textContent = initialRoomId;
    console.log('📋 Room ID initial affiché avant Socket.IO:', initialRoomId);
  }
}

// ========================================
// PERSISTANCE DU PARTAGE D'ÉCRAN
// ========================================

const SHARE_KEY = 'screenShareActive';

function persistShareOn()  { sessionStorage.setItem(SHARE_KEY, 'true'); }
function persistShareOff() { sessionStorage.removeItem(SHARE_KEY); }
function wasSharing()      { return sessionStorage.getItem(SHARE_KEY) === 'true'; }

// ===== GESTIONNAIRES =====
let chatManager         = null;
let shareRequestManager = null;

function initializeManagers() {
  if (typeof ChatManager !== 'undefined' && !window.chatManager) {
    window.chatManager = new ChatManager(socket);
    if (state.myName) window.chatManager.setUserName(state.myName);

    // ──────────────────────────────────────────────────────────
    //  HOOK : Notification de message privé persistante
    //  On surcharge (ou on complète) la méthode du ChatManager
    //  pour déclencher la notification dans participant-admin.js
    // ──────────────────────────────────────────────────────────
    const _originalOnPrivate = window.chatManager.onPrivateMessage?.bind(window.chatManager);
    window.chatManager.onPrivateMessage = function(fromId, fromName, message) {
      // Appeler le comportement d'origine s'il existe
      if (typeof _originalOnPrivate === 'function') _originalOnPrivate(fromId, fromName, message);

      // Si le panneau de chat avec cet utilisateur n'est PAS ouvert en ce moment
      const chatIsOpen = window.chatManager.isPrivateChatOpen?.(fromId);
      if (!chatIsOpen) {
        const preview = typeof message === 'string' ? message : (message?.text || message?.content || '...');
        if (typeof window.registerPrivateMessageNotif === 'function') {
          window.registerPrivateMessageNotif(fromId, fromName, preview);
        }
      }
    };

    console.log('✅ ChatManager initialisé.');
  }

  if (typeof ShareRequestManager !== 'undefined' && !window.shareRequestManager) {
    window.shareRequestManager = new ShareRequestManager(socket, state, elements);
    console.log('✅ ShareRequestManager initialisé.');
  } else if (typeof ShareRequestManager === 'undefined') {
    console.warn('⚠️ ShareRequestManager non défini.');
  }

  if (typeof NotesManager !== 'undefined' && !window.notesManager) {
    window.notesManager = new NotesManager();
    const btnNotes = document.getElementById('btnNotes');
    if (btnNotes) {
      btnNotes.addEventListener('click', () => window.notesManager.toggle());
    }
  }

  // ── Gestionnaire de partage de contenu (fichiers, YouTube, Vimeo, MP4) ──
  if (typeof ContentShareManager !== 'undefined' && !window.contentShareManager) {
    window.contentShareManager = new ContentShareManager(socket);
    console.log('✅ ContentShareManager initialisé.');
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
  document.querySelectorAll('.alert').forEach(a => a.remove());
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  document.body.appendChild(alert);
  requestAnimationFrame(() => alert.classList.add('show'));
  if (duration > 0) {
    setTimeout(() => {
      alert.classList.remove('show');
      alert.addEventListener('transitionend', () => alert.remove(), { once: true });
    }, duration);
  }
}

async function fetchICEServers() {
  try {
    const response = await fetch('/api/ice-servers');
    const data     = await response.json();
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

// ===== FONCTIONS AUDIO/VIDÉO =====

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
    if (elements.micBtn) elements.micBtn.disabled = true;
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
  if (state.localStream) {
    state.localStream.getVideoTracks().forEach(track => track.enabled = state.camOn);
  }
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

// ===== MISE À JOUR UI =====

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
  if (!elements.btnViewList || !elements.btnViewGrid) return;
  if (state.viewMode === 'list') {
    elements.btnViewList.classList.add('active');
    elements.btnViewGrid.classList.remove('active');
  } else {
    elements.btnViewList.classList.remove('active');
    elements.btnViewGrid.classList.add('active');
  }
}

function updateParticipantCount(count) {
  if (elements.participantCount)     elements.participantCount.textContent     = count;
  if (elements.sideParticipantCount) elements.sideParticipantCount.textContent = count;
}

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ===== GESTION DU PARTAGE =====
let shareBtnListenerAdded = false;

// Détection mobile simple et fiable
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));
}

// Vérifie si getDisplayMedia est supporté sur cet appareil/navigateur
function isScreenShareSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

// ─── MODAL DE CHOIX ───────────────────────────────────────────
function showShareModal() {
  document.getElementById('shareChoiceModal')?.remove();

  const isMobile       = isMobileDevice();
  const screenSupported = isScreenShareSupported();

  // Injecter les styles du modal si pas encore fait
  if (!document.getElementById('shareModalStyle')) {
    const style = document.createElement('style');
    style.id = 'shareModalStyle';
    style.textContent = `
      #shareChoiceModal {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        animation: fadeInBg 0.2s ease;
      }
      @keyframes fadeInBg  { from { opacity:0 } to { opacity:1 } }
      @keyframes slideUpModal { from { transform:translateY(30px);opacity:0 } to { transform:translateY(0);opacity:1 } }
      #shareChoiceModal .modal-box {
        background: #1e293b;
        border-radius: 16px;
        padding: 28px 24px 20px;
        width: 92%; max-width: 380px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5);
        animation: slideUpModal 0.25s ease;
        border: 1px solid rgba(255,255,255,0.08);
      }
      #shareChoiceModal h3 {
        margin: 0 0 6px;
        font-size: 16px; font-weight: 700; color: #f1f5f9;
        display: flex; align-items: center; gap: 8px;
      }
      #shareChoiceModal p {
        margin: 0 0 20px;
        font-size: 13px; color: #94a3b8;
      }
      #shareChoiceModal .share-options {
        display: flex; flex-direction: column; gap: 10px;
      }
      #shareChoiceModal .share-option-btn {
        display: flex; align-items: center; gap: 14px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px; padding: 14px 16px;
        cursor: pointer; text-align: left;
        transition: background 0.15s, border-color 0.15s;
        width: 100%;
      }
      #shareChoiceModal .share-option-btn:hover {
        background: rgba(124,58,237,0.15);
        border-color: rgba(124,58,237,0.4);
      }
      #shareChoiceModal .share-option-btn .opt-icon {
        font-size: 28px; flex-shrink: 0; width: 40px; text-align: center;
      }
      #shareChoiceModal .share-option-btn .opt-text strong {
        display: block; font-size: 14px; font-weight: 600; color: #f1f5f9; margin-bottom: 2px;
      }
      #shareChoiceModal .share-option-btn .opt-text span {
        font-size: 11px; color: #64748b;
      }
      #shareChoiceModal .share-option-btn.recommended {
        border-color: rgba(124,58,237,0.5);
        background: rgba(124,58,237,0.1);
      }
      #shareChoiceModal .share-option-btn.recommended .opt-text strong::after {
        content: ' ✓ Recommandé';
        font-size: 10px; font-weight: 600;
        color: #7c3aed; margin-left: 6px;
      }
      #shareChoiceModal .share-option-btn:disabled {
        opacity: 0.38; cursor: not-allowed;
      }
      #shareChoiceModal .modal-cancel {
        margin-top: 14px; width: 100%;
        background: none; border: none;
        color: #64748b; font-size: 13px;
        cursor: pointer; padding: 6px;
      }
      #shareChoiceModal .modal-cancel:hover { color: #94a3b8; }
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement('div');
  modal.id = 'shareChoiceModal';

  // Désactiver le bouton écran si non supporté
  const screenDisabled = !screenSupported ? 'disabled title="Non supporté sur ce navigateur"' : '';
  const screenRecommended = !isMobile && screenSupported ? 'recommended' : '';
  const camRecommended    =  isMobile                   ? 'recommended' : '';

  modal.innerHTML = `
    <div class="modal-box">
      <h3><i class="fa-solid fa-display" style="color:#7c3aed;"></i> Comment voulez-vous partager ?</h3>
      <p>Choisissez la source à diffuser aux participants.</p>
      <div class="share-options">

        <button class="share-option-btn ${screenRecommended}" id="btnChooseScreen" ${screenDisabled}>
          <div class="opt-icon">🖥️</div>
          <div class="opt-text">
            <strong>Partager l'écran</strong>
            <span>Diffuse votre écran, une fenêtre ou un onglet</span>
          </div>
        </button>

        <button class="share-option-btn ${camRecommended}" id="btnChooseCamera">
          <div class="opt-icon">📷</div>
          <div class="opt-text">
            <strong>Utiliser la caméra</strong>
            <span>Idéal sur mobile · Fonctionne partout</span>
          </div>
        </button>

      </div>
      <button class="modal-cancel" id="btnShareCancel">Annuler</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Fermer en cliquant sur le fond
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('btnShareCancel').addEventListener('click', () => modal.remove());

  if (screenSupported) {
    document.getElementById('btnChooseScreen').addEventListener('click', () => {
      modal.remove();
      startScreenShare();
    });
  }

  document.getElementById('btnChooseCamera').addEventListener('click', () => {
    modal.remove();
    startCameraShare();
  });
}

// ─── PARTAGE ÉCRAN (desktop) ──────────────────────────────────
async function startScreenShare() {
  try {
    elements.shareBtn.disabled = true;
    elements.shareBtn.classList.add('loading');

    // Contraintes adaptées : pas de displaySurface sur mobile
    const videoConstraints = isMobileDevice()
      ? { frameRate: { ideal: 30, max: 30 } }
      : {
          cursor: 'always',
          displaySurface: 'monitor',
          frameRate: { ideal: 30, max: 60 },
          width:  { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        };

    state.localStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: !isMobileDevice() // L'audio système est souvent bloqué sur mobile
    });

    console.log('✅ Écran capturé, tracks:', state.localStream.getTracks().length);
    _afterStreamReady('screen');

  } catch (error) {
    console.error('❌ Erreur capture écran:', error);
    elements.shareBtn.disabled = false;
    elements.shareBtn.classList.remove('loading');
    if (error.name === 'NotAllowedError') {
      showAlert('Permission refusée. Essayez "Utiliser la caméra" si vous êtes sur mobile.', 'warning', 6000);
    } else {
      showAlert('Partage écran annulé ou non supporté.', 'warning');
    }
  }
}

// ─── PARTAGE CAMÉRA (mobile & fallback) ──────────────────────
async function startCameraShare() {
  try {
    elements.shareBtn.disabled = true;
    elements.shareBtn.classList.add('loading');

    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Caméra arrière par défaut
        frameRate:  { ideal: 30 },
        width:      { ideal: 1280 },
        height:     { ideal: 720 }
      },
      audio: true
    });

    console.log('✅ Caméra capturée, tracks:', state.localStream.getTracks().length);
    // Marquer qu'on partage via caméra (utile pour stopSharing)
    state.shareMode = 'camera';
    _afterStreamReady('camera');

  } catch (error) {
    console.error('❌ Erreur accès caméra:', error);
    elements.shareBtn.disabled = false;
    elements.shareBtn.classList.remove('loading');
    if (error.name === 'NotAllowedError') {
      showAlert('Permission caméra refusée. Vérifiez les autorisations du navigateur.', 'error', 7000);
    } else {
      showAlert('Impossible d\'accéder à la caméra : ' + error.message, 'error');
    }
  }
}

// ─── APRÈS CAPTURE DU STREAM (commun) ─────────────────────────
function _afterStreamReady(mode) {
  state.shareMode = mode;

  // Écouter la fin du stream (bouton stop du navigateur ou arrêt caméra)
  const videoTrack = state.localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.addEventListener('ended', () => {
      console.log('⏹️ Stream terminé (bouton navigateur ou track ended)');
      persistShareOff();
      stopSharing();
    });
  }

  // Envoyer la demande au serveur (le serveur répond avec share-approved)
  socket.emit('request-share', { name: state.myName });
}

// ─── INIT DU BOUTON ──────────────────────────────────────────
function initShareButton() {
  elements.shareBtn = document.getElementById('btnScreen');
  if (shareBtnListenerAdded || !elements.shareBtn) return;
  shareBtnListenerAdded = true;

  elements.shareBtn.addEventListener('click', () => {
    if (state.isSharing) {
      stopSharing();
    } else {
      showShareModal();
    }
  });
}

// ========================================
// GESTION SOCKET.IO
// ========================================

socket.on('connect', () => {
  console.log('✅ Connecté au serveur | Socket ID:', socket.id);

  const params    = new URLSearchParams(window.location.search);
  state.myName    = params.get('name') || `User-${socket.id.slice(0, 4)}`;
  const roomId    = params.get('room') || 'general';

  const roomDisplayEl = document.getElementById('roomIdDisplay');
  if (roomDisplayEl) roomDisplayEl.textContent = roomId;

  socket.emit('register', { name: state.myName, room: roomId, userId: userId });
  initializeManagers();
});

// --- GESTIONNAIRE DE RÉACTIONS ---
const reactWrapper = document.querySelector('.react-wrapper');
if (reactWrapper) {
  const picker = reactWrapper.querySelector('.reactions-picker');
  if (picker) {
    picker.classList.add('emoji-picker');

    const reactionCategories = {
      smileys:  ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','🤗','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😎','🥳','🤯','😱'],
      gestures: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👋','👏','🙌','👐','🤲','🤝','🙏','💪','👊','✊','🤛','🤜'],
      hearts:   ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝'],
      party:    ['🎉','🎊','🎈','🎁','🏆','🥇','🔥','💯','✨','⚡','⭐','🌟','💥','💫']
    };

    const header  = document.createElement('div');
    header.className = 'emoji-picker-header';
    const content = document.createElement('div');
    content.className = 'emoji-picker-content';

    const cats = [
      { id: 'smileys',  icon: '😊' },
      { id: 'gestures', icon: '👍' },
      { id: 'hearts',   icon: '❤️' },
      { id: 'party',    icon: '🎉' }
    ];

    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'emoji-category-btn';
      if (cat.id === 'smileys') btn.classList.add('active');
      btn.innerHTML = cat.icon;
      btn.onclick = (e) => {
        e.stopPropagation();
        header.querySelectorAll('.emoji-category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
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

    picker.appendChild(header);
    picker.appendChild(content);
    fillContent('smileys');

    if (elements.reactBtn) {
      elements.reactBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reactWrapper.classList.toggle('active');
      });
    }

    document.addEventListener('click', (e) => {
      if (!reactWrapper.contains(e.target)) reactWrapper.classList.remove('active');
    });
  }
}

// --- INITIALISATION DES ÉCOUTEURS ---
initShareButton();
if (elements.micBtn)      elements.micBtn.addEventListener('click', toggleMic);
if (elements.raiseHandBtn) elements.raiseHandBtn.addEventListener('click', toggleHand);
if (elements.speakerBtn)  elements.speakerBtn.addEventListener('click', toggleAudioOutput);
if (elements.camBtn)      elements.camBtn.addEventListener('click', toggleCam);

// --- GESTION DES VUES ---
if (elements.btnViewList) elements.btnViewList.addEventListener('click', () => {
  state.viewMode = 'list';
  updateViewButtons();
  renderParticipantsList(state.participants);
});
if (elements.btnViewGrid) elements.btnViewGrid.addEventListener('click', () => {
  state.viewMode = 'grid';
  updateViewButtons();
  renderParticipantsList(state.participants);
});

// Helper : choisit le bon renderer
function renderParticipantsList(participants) {
  if (window.renderParticipantsAdmin) {
    window.renderParticipantsAdmin(participants);
  } else {
    renderParticipants(participants);
  }
}

// Initialiser l'état visuel au chargement
updateMicButton(state.micOn);
updateCamButton(state.camOn);
updateSpeakerButton(state.audioOutputOn);
initAudio();

socket.on('disconnect', () => {
  console.log('❌ Déconnecté du serveur');
  showAlert('Connexion perdue. Reconnexion...', 'warning');
});

socket.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion Socket.IO:', error);
  showAlert('Connexion au serveur impossible. Vérifiez le certificat HTTPS.', 'error');
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

  await initAudio();

  if (initialState.connectedUsersList) {
    initialState.connectedUsersList.forEach(async user => {
      if (user.id !== socket.id) {
        await createPeerConnection(user.id, true);
      }
    });
  }

  if (initialState.isSharing) {
    if (initialState.isYouHost) {
      if (window.injectAdminBanner) window.injectAdminBanner();
      if (window.setHostControls)   window.setHostControls(true);
    }
    state.hostId = initialState.hostId;
    elements.sharerName.textContent = initialState.hostName;
    elements.shareBadge.style.display = 'flex';

    if (initialState.isYouHost) {
      if (window.shareRequestManager) window.shareRequestManager.hideRequestButton();
      state.isSharing = false;
      elements.shareBtn.style.display = 'flex';
      elements.shareBtn.classList.remove('active', 'danger');
      elements.shareBtn.innerHTML = '<i class="fa-solid fa-display"></i>';
      if (wasSharing()) {
        showResumeBanner();
      } else {
        elements.shareBtn.title = "Partager l'écran";
      }
    } else {
      showAlert(`${initialState.hostName} partage actuellement`, 'info');
      if (window.shareRequestManager) window.shareRequestManager.showRequestButton();
    }
  } else {
    state.isSharing = false;
    persistShareOff();
    elements.shareBtn.style.display = 'flex';
    elements.shareBtn.classList.remove('active');
    elements.sharerName.textContent = 'Personne';
    elements.shareBadge.style.display = 'none';
    if (elements.screenPlaceholder) {
      elements.screenPlaceholder.querySelector('p').innerHTML =
        'Bienvenue dans <strong>ESTLC SHARING SCREEN</strong><br>En attente du partage...';
    }
    if (window.shareRequestManager) window.shareRequestManager.hideRequestButton();
  }

  renderParticipantsList(state.participants);
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
  state.participants = users;
  renderParticipantsList(state.participants);
});

socket.on('user-joined', (newUser) => {
  console.log('👤 Nouvel utilisateur:', newUser.name);
  showAlert(`${newUser.name} a rejoint la session`, 'info');
});

socket.on('mute-command', (data) => {
  if (state.micOn) {
    if (elements.micBtn) elements.micBtn.click();
    showAlert(`Votre micro a été coupé par ${data.by}`, 'warning');
  }
});

socket.on('hand-update', (data) => {
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
  if (!state.micOn) {
    state.micOn = true;
    updateMicButton(true);
    if (state.micStream) {
      state.micStream.getAudioTracks().forEach(t => t.enabled = true);
    }
  }
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

// ========================================
// RENDU DES PARTICIPANTS (fallback sans admin)
// ========================================

function renderParticipants(participants = []) {
  if (!elements.participantsList) return;
  const isMeHost = state.hostId === socket.id;

  elements.participantsList.className =
    `participants-list ${state.viewMode === 'grid' ? 'grid-view' : ''}`;

  let html = '';
  const host               = participants.find(p => p.id === state.hostId);
  const others             = participants.filter(p => p.id !== state.hostId);
  const raisedHands        = others.filter(p => p.handRaised);
  const normalParticipants = others.filter(p => !p.handRaised);

  if (raisedHands.length > 0) {
    html += `<div class="section-label raised-hands-section">✋ Mains levées (${raisedHands.length})</div>`;
    raisedHands.forEach(p => { html += buildParticipantCard(p, false, true, isMeHost); });
  }
  if (host) {
    html += `<div class="section-label">Hôte</div>`;
    html += buildParticipantCard(host, true, false, isMeHost);
  }
  if (normalParticipants.length > 0) {
    html += `<div class="section-label">Participants (${normalParticipants.length})</div>`;
    normalParticipants.forEach(p => { html += buildParticipantCard(p, false, false, isMeHost); });
  }

  elements.participantsList.innerHTML = html;
}

function buildParticipantCard(p, isHost, isHandRaised, isMeHost) {
  const [bg1, bg2]  = stringToColorGradient(p.name || p.id);
  const initials    = getInitials(p.name);
  const isMe        = p.id === socket.id;
  const statusText  = isHost ? (state.isSharing ? 'Partage en cours' : 'Hôte') : 'Connecté';

  // Notifications messages privés
  const notif       = (window.privateMessageNotifications || {})[p.id];
  const unreadCount = notif ? notif.count : 0;
  const notifBadge  = unreadCount > 0
    ? `<span style="display:inline-flex;align-items:center;justify-content:center;background:#ef4444;color:white;border-radius:50%;width:17px;height:17px;font-size:9px;font-weight:700;margin-left:4px;">${unreadCount > 9 ? '9+' : unreadCount}</span>`
    : '';

  let modActions = '';
  if (isMeHost && !isMe) {
    modActions = `
      <button class="p-action-btn ${p.micOn === false ? '' : 'active'}"
              onclick="event.stopPropagation();toggleUserMic('${p.id}','${p.name.replace(/'/g,"\\'")}')"
              title="${p.micOn === false ? 'Activer micro' : 'Couper micro'}">
        ${p.micOn === false ? '🔇' : '🎤'}
      </button>
    `;
    if (isHandRaised) {
      modActions += `
        <button class="p-action-btn warning"
                onclick="event.stopPropagation();lowerUserHand('${p.id}','${p.name.replace(/'/g,"\\'")}')"
                title="Baisser la main">✋</button>
      `;
    }
  }

  return `
    <div class="participant-card
        ${isHost       ? 'is-host'        : ''}
        ${isHandRaised ? 'hand-raised-item': ''}
        ${isMe         ? 'is-me'           : ''}
        ${unreadCount > 0 ? 'has-unread'  : ''}"
      ${!isMe
        ? `onclick="window.clearPrivateMessageNotif?.('${p.id}');window.chatManager?.initiatePrivateChat('${p.id}','${p.name.replace(/'/g,"\\'")}')"` 
        : ''}>
      <div class="p-avatar" style="background:linear-gradient(135deg,${bg1},${bg2})">
        ${initials}
        ${isHandRaised ? '<div class="hand-badge">✋</div>' : '<div class="status-dot"></div>'}
      </div>
      <div class="p-info">
        <div class="p-name">
          ${p.name} ${isMe ? '(Vous)' : ''} ${notifBadge}
          ${isHost ? '<i class="fa-solid fa-crown" style="color:#f59e0b;font-size:10px"></i>' : ''}
        </div>
        <div class="p-status ${isHost && state.isSharing ? 'sharing' : ''}">
          ${statusText}
          ${p.micOn === false ? ' · 🔇 Micro coupé' : ' · 🎤 Micro actif'}
        </div>
        ${notif ? `<div style="font-size:10px;color:#7c3aed;font-weight:600;margin-top:2px;">💬 ${notif.preview}</div>` : ''}
      </div>
      <div class="participant-actions">
        ${modActions}
        <button class="p-action-btn ${unreadCount > 0 ? 'has-notif' : ''}"
          onclick="event.stopPropagation();window.clearPrivateMessageNotif?.('${p.id}');window.chatManager?.initiatePrivateChat('${p.id}','${p.name.replace(/'/g,"\\'")}')"
          title="Message privé">
          <i class="fa-regular fa-comment-dots"></i>
          ${unreadCount > 0 ? `<span style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;border-radius:50%;width:14px;height:14px;font-size:9px;display:flex;align-items:center;justify-content:center;">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
        </button>
      </div>
    </div>
  `;
}

// ========================================
// GESTION DES RÉACTIONS
// ========================================

function sendReaction(emoji) {
  socket.emit('video-reaction', { emoji });
  displayReaction(emoji);
}

socket.on('video-reaction', (data) => { displayReaction(data.emoji); });

function displayReaction(emoji) {
  const container   = document.getElementById('screenShareContainer') || document.body;
  const reactionEl  = document.createElement('div');
  reactionEl.className  = 'floating-reaction';
  reactionEl.textContent = emoji;
  reactionEl.style.left  = `${20 + Math.random() * 60}%`;
  container.appendChild(reactionEl);
  setTimeout(() => reactionEl.remove(), 4000);
}

// ===== FONCTIONS DE MODÉRATION & NOTIFICATIONS =====

window.toggleUserMic = function(targetId, targetName) {
  socket.emit('mute-user', { targetId });
  showAlert(`Commande envoyée pour ${targetName}`, 'info');
};

window.lowerUserHand = function(targetId, targetName) {
  socket.emit('lower-hand', { targetId });
  showAlert(`Main de ${targetName} baissée`, 'info');
};

window.allowMic = function(targetId, targetName) {
  socket.emit('allow-mic', { targetId });
  showAlert(`🎤 Micro autorisé pour ${targetName}`, 'success');
  document.getElementById(`hand-notif-${targetId}`)?.remove();
};

window.dismissHand = function(userId) {
  document.getElementById(`hand-notif-${userId}`)?.remove();
};

function showHandRaisedNotification(userId, userName) {
  document.getElementById(`hand-notif-${userId}`)?.remove();
  const notif = document.createElement('div');
  notif.id    = `hand-notif-${userId}`;
  notif.className = 'hand-raised-notif';
  notif.innerHTML = `
    <div class="hand-notif-content">
      <span class="hand-notif-icon">✋</span>
      <div class="hand-notif-info">
        <strong>${userName}</strong>
        <span>a levé la main</span>
      </div>
      <div class="hand-notif-actions">
        <button class="btn-allow-mic"   onclick="allowMic('${userId}','${userName}')">🎤 Autoriser</button>
        <button class="btn-dismiss-hand" onclick="dismissHand('${userId}')">✕</button>
      </div>
    </div>
  `;
  document.body.appendChild(notif);
  setTimeout(() => { if (document.body.contains(notif)) notif.remove(); }, 30000);
}

socket.on('lower-hand-command', () => {
  if (state.handRaised) {
    toggleHand();
    showAlert("Votre main a été baissée par l'hôte", 'info');
  }
});

socket.on('share-approved', () => {
  console.log('✅ Partage approuvé - Démarrage du partage...');
  if (!state.localStream) {
    console.error('❌ Aucun stream local disponible.');
    elements.shareBtn.disabled = false;
    elements.shareBtn.classList.remove('loading');
    showAlert('Erreur : flux écran non disponible.', 'error');
    return;
  }

  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('loading');

  socket.emit('share-started', { name: state.myName });
  displayLocalVideo();

  state.localStream.getAudioTracks().forEach(track => track.enabled = state.micOn);
  state.localStream.getVideoTracks().forEach(track => track.enabled = state.camOn);

  state.isSharing = true;
  persistShareOn();
  elements.shareBtn.classList.add('active', 'danger');
  elements.shareBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
  elements.shareBtn.title     = "Arrêter le partage";
  elements.sharerName.textContent      = 'Vous';
  elements.shareBadge.style.display    = 'flex';
  showAlert('Partage démarré !', 'success');

  if (window.injectAdminBanner) window.injectAdminBanner();
  if (window.setHostControls)   window.setHostControls(true);

  addLocalStreamToPeers();
});

function addLocalStreamToPeers() {
  if (!state.localStream) return;
  state.peerConnections.forEach((pc, peerId) => {
    const existingVideoSender = state.videoSenders.get(peerId);
    if (!existingVideoSender || existingVideoSender.track?.kind !== 'video') {
      state.localStream.getVideoTracks().forEach(track => {
        const sender = pc.addTrack(track, state.localStream);
        state.videoSenders.set(peerId, sender);
        console.log(`➕ Ajout track écran vers ${peerId.slice(0,6)}`);
      });
    }
  });
}

socket.on('share-blocked', (data) => {
  showAlert(`${data.currentHost} partage déjà son écran`, 'warning');
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('loading');
});

function displayLocalVideo() {
  elements.screenPlaceholder.style.display = 'none';
  elements.screenVideo.srcObject  = state.localStream;
  elements.screenVideo.style.display = 'block';
  elements.screenVideo.muted = true;
}

// ========================================
// WEBRTC PEER CONNECTIONS
// ========================================

socket.on('viewer-joined', async (data) => {
  if (state.isSharing && state.localStream) {
    const pc = state.peerConnections.get(data.viewerId);
    if (pc) {
      // Les tracks seront ajoutés via la logique de renégociation
    }
  }
});

socket.on('host-started-sharing', (data) => {
  console.log('🎥 Hôte commence à partager:', data.hostName);
  state.hostId = data.hostId;
  elements.sharerName.textContent   = data.hostName;
  elements.shareBadge.style.display = 'flex';
  showAlert(`${data.hostName} partage maintenant`, 'info');
  if (window.shareRequestManager) window.shareRequestManager.showRequestButton();
});

async function createPeerConnection(peerId, isInitiator) {
  console.log(`🔗 Création connexion peer avec ${peerId.slice(0, 6)} (initiator: ${isInitiator})`);

  const pc = new RTCPeerConnection({
    iceServers:    state.iceServers,
    sdpSemantics:  'unified-plan',
    bundlePolicy:  'max-bundle',
    rtcpMuxPolicy: 'require'
  });

  state.peerConnections.set(peerId, pc);

  pc.onconnectionstatechange = () => {
    console.log(`[${peerId.slice(0,6)}] Connection state: ${pc.connectionState}`);
    if (pc.connectionState === 'connected') {
      socket.emit('webrtc-connected', { peerId, hostId: state.hostId || socket.id });
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      socket.emit('webrtc-error', { error: `Connection ${pc.connectionState}`, peerId });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[${peerId.slice(0,6)}] ICE state: ${pc.iceConnectionState}`);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice', { candidate: event.candidate, to: peerId });
    }
  };

  pc.onnegotiationneeded = async () => {
    if (isInitiator || state.isSharing) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { offer, to: peerId });
      } catch (err) { console.error('Renegotiation error', err); }
    }
  };

  // Ajouter les tracks écran si disponibles
  if (state.localStream) {
    state.localStream.getVideoTracks().forEach(track => {
      const sender = pc.addTrack(track, state.localStream);
      state.videoSenders.set(peerId, sender);
    });
  }

  // Ajouter les tracks audio (micro)
  if (state.micStream) {
    state.micStream.getTracks().forEach(track => {
      pc.addTrack(track, state.micStream);
    });
  }

  if (isInitiator) {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      console.log(`[${peerId.slice(0,6)}] 📤 Envoi offer`);
      socket.emit('webrtc-offer', { offer, to: peerId });
    } catch (err) {
      console.error(`[${peerId.slice(0,6)}] ❌ Erreur création offer:`, err);
      socket.emit('webrtc-error', { error: err.message, peerId });
    }
  }

  pc.ontrack = (event) => {
    console.log(`[${peerId.slice(0,6)}] ✅ Track reçu: ${event.track.kind}`);
    if (event.track.kind === 'video' && event.streams?.[0]) {
      displayRemoteVideo(event.streams[0]);
      showAlert('Affichage du partage', 'success');
    }
    if (event.track.kind === 'audio' && event.streams?.[0]) {
      const audioEl     = document.createElement('audio');
      audioEl.className = 'remote-audio';
      audioEl.srcObject = event.streams[0];
      audioEl.autoplay  = true;
      audioEl.muted     = !state.audioOutputOn;
      document.body.appendChild(audioEl);
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
    let pc = state.peerConnections.get(data.from);
    if (!pc) pc = await createPeerConnection(data.from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { answer, to: data.from });
  } catch (err) {
    console.error('❌ Erreur traitement offer:', err);
    socket.emit('webrtc-error', { error: err.message, peerId: data.from });
  }
});

socket.on('webrtc-answer', async (data) => {
  console.log('📥 Answer reçue de', data.from.slice(0, 6));
  const pc = state.peerConnections.get(data.from);
  if (pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
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
  state.isSharing = false;
  persistShareOff();

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }

  state.videoSenders.forEach((sender, peerId) => {
    const pc = state.peerConnections.get(peerId);
    if (pc && sender) {
      try {
        pc.removeTrack(sender);
      } catch (e) {
        console.error(`❌ Erreur retrait piste vidéo de ${peerId.slice(0,6)}:`, e);
      }
    }
  });
  state.videoSenders.clear();

  socket.emit('stop-share');

  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('active', 'loading', 'danger');
  elements.shareBtn.innerHTML = '<i class="fa-solid fa-display"></i>';
  elements.shareBtn.title     = "Partager l'écran";

  elements.screenVideo.srcObject     = null;
  elements.screenVideo.style.display = 'none';
  elements.screenPlaceholder.style.display = 'flex';

  if (elements.screenPlaceholder) {
    elements.screenPlaceholder.querySelector('p').innerHTML =
      'Bienvenue dans <strong>ESTLC SHARING SCREEN</strong><br>En attente du partage...';
  }

  elements.shareBadge.style.display = 'none';
  showAlert('Partage arrêté', 'info');

  if (window.removeAdminBanner) window.removeAdminBanner();
  if (window.setHostControls)   window.setHostControls(false);
  // Arrêter le contenu partagé si actif
  if (window.contentShareManager?.activeContent) window.contentShareManager.stopContent(true);
}

socket.on('host-stopped-sharing', (data) => {
  console.log('⏹️ Hôte a arrêté le partage:', data.message);
  state.hostId = null;

  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('active', 'danger');
  elements.shareBtn.innerHTML      = '<i class="fa-solid fa-display"></i>';
  elements.shareBtn.style.display  = 'flex';
  elements.shareBtn.title          = "Partager l'écran";

  if (!state.isSharing) {
    elements.screenVideo.srcObject     = null;
    elements.screenVideo.style.display = 'none';
    elements.screenPlaceholder.style.display = 'flex';
    if (elements.screenPlaceholder) {
      elements.screenPlaceholder.querySelector('p').innerHTML =
        'Bienvenue dans <strong>ESTLC SHARING SCREEN</strong><br>En attente du partage...';
    }
    elements.sharerName.textContent   = 'Personne';
    elements.shareBadge.style.display = 'none';
    showAlert(data.message, 'info');
    if (window.shareRequestManager) window.shareRequestManager.hideRequestButton();
  }
});

socket.on('force-stop-share', (data) => {
  console.log('⚠️ Arrêt forcé du partage:', data.reason);
  state.isSharing = false;
  persistShareOff();

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }

  state.videoSenders.forEach((sender, peerId) => {
    const pc = state.peerConnections.get(peerId);
    if (pc && sender) { try { pc.removeTrack(sender); } catch (e) {} }
  });
  state.videoSenders.clear();

  elements.shareBtn.disabled = false;
  elements.shareBtn.classList.remove('active', 'loading', 'danger');
  elements.shareBtn.innerHTML      = '<i class="fa-solid fa-display"></i>';
  elements.shareBtn.title          = "Partager l'écran";
  elements.shareBtn.style.display  = 'flex';

  elements.screenVideo.srcObject     = null;
  elements.screenVideo.style.display = 'none';
  elements.screenPlaceholder.style.display = 'flex';
  elements.shareBadge.style.display  = 'none';

  showAlert(data.message, 'success');
});

// ========================================
// REPRISE DU PARTAGE APRÈS RECHARGEMENT
// ========================================

function showResumeBanner() {
  document.getElementById('resumeShareBanner')?.remove();

  const banner = document.createElement('div');
  banner.id    = 'resumeShareBanner';
  banner.style.cssText = `
    position:fixed;top:70px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#7c3aed,#5b21b6);
    color:white;padding:14px 24px;border-radius:12px;
    display:flex;align-items:center;gap:14px;z-index:9999;
    box-shadow:0 8px 32px rgba(124,58,237,0.45);
    font-family:inherit;font-size:14px;
    animation:slideDown 0.3s ease;
  `;
  banner.innerHTML = `
    <i class="fa-solid fa-display" style="font-size:20px;"></i>
    <span>Vous étiez en train de partager votre écran.</span>
    <button id="resumeShareBtn" style="
      background:white;color:#7c3aed;border:none;border-radius:8px;
      padding:8px 16px;font-weight:700;cursor:pointer;
      font-size:13px;white-space:nowrap;
    ">▶ Reprendre</button>
    <button id="dismissResumeBtn" style="
      background:transparent;color:rgba(255,255,255,0.7);
      border:none;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;
    ">✕</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('resumeShareBtn').addEventListener('click', () => {
    banner.remove();
    resumeSharing();
  });
  document.getElementById('dismissResumeBtn').addEventListener('click', () => {
    banner.remove();
    persistShareOff();
  });
}

async function resumeSharing() {
  // Réutilise le modal de choix : l'utilisateur choisit écran ou caméra
  // Le flux share-approved dans socket.on('share-approved') gère la suite
  showShareModal();
}

// ========================================
// INITIALISATION
// ========================================

fetchICEServers().then(() => {
  console.log('🚀 Application initialisée');
});
