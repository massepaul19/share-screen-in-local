// ========================================
// public/static/p2p-call-ui.js
// Interface utilisateur des appels P2P
// ========================================

class P2PCallUI {
  constructor(callManager) {
    this.callManager = callManager;
    this.callInterface = null;
    this.callTimer = null;
    
    this.createCallInterface();
    
    console.log('✅ P2PCallUI initialisé');
  }
  
  // ===== 🎨 CRÉER L'INTERFACE D'APPEL =====
  createCallInterface() {
    // Interface cachée par défaut
    const html = `
      <div id="p2pCallInterface" class="call-interface" style="display: none;">
        <div class="call-container">
          <!-- Vidéos -->
          <div class="call-videos">
            <video id="p2pRemoteVideo" class="remote-video" autoplay playsinline></video>
            <video id="p2pLocalVideo" class="local-video" autoplay playsinline muted></video>
            
            <!-- Info de connexion -->
            <div id="p2pCallInfo" class="call-info">
              <div class="call-status">
                <span id="p2pCallStatus">Connexion...</span>
              </div>
              <div class="call-duration">
                <span id="p2pCallTimer">00:00</span>
              </div>
            </div>
          </div>
          
          <!-- Contrôles -->
          <div class="call-controls">
            <button id="p2pToggleMicBtn" class="control-btn" title="Micro">
              <span>🎤</span>
            </button>
            
            <button id="p2pToggleCameraBtn" class="control-btn" title="Caméra">
              <span>📹</span>
            </button>
            
            <button id="p2pEndCallBtn" class="control-btn end-call-btn" title="Raccrocher">
              <span>📴</span>
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    // Récupérer les éléments
    this.elements = {
      interface: document.getElementById('p2pCallInterface'),
      remoteVideo: document.getElementById('p2pRemoteVideo'),
      localVideo: document.getElementById('p2pLocalVideo'),
      callInfo: document.getElementById('p2pCallInfo'),
      callStatus: document.getElementById('p2pCallStatus'),
      callTimer: document.getElementById('p2pCallTimer'),
      toggleMicBtn: document.getElementById('p2pToggleMicBtn'),
      toggleCameraBtn: document.getElementById('p2pToggleCameraBtn'),
      endCallBtn: document.getElementById('p2pEndCallBtn')
    };
    
    // Event listeners
    this.elements.toggleMicBtn.addEventListener('click', () => {
      this.callManager.toggleMic();
    });
    
    this.elements.toggleCameraBtn.addEventListener('click', () => {
      this.callManager.toggleCamera();
    });
    
    this.elements.endCallBtn.addEventListener('click', () => {
      this.callManager.endCall();
    });
  }
  
  // ===== 📞 AFFICHER "APPEL EN COURS..." =====
  showCallingState(targetName, callType) {
    this.elements.interface.style.display = 'flex';
    this.elements.callStatus.textContent = `Appel de ${targetName}...`;
    this.elements.remoteVideo.style.display = 'none';
    
    // Afficher un placeholder
    this.showPlaceholder(`📞 Appel en cours...`);
  }
  
  // ===== ✅ AFFICHER "APPEL ACCEPTÉ" =====
  showCallAccepted(callerName, callType) {
    this.elements.interface.style.display = 'flex';
    this.elements.callStatus.textContent = `En communication avec ${callerName}`;
  }
  
  // ===== 🔗 AFFICHER "CONNEXION..." =====
  showCallConnecting(peerName) {
    this.elements.callStatus.textContent = `Connexion avec ${peerName}...`;
  }
  
  // ===== 🎉 AFFICHER "CONNECTÉ" =====
  showCallConnected() {
    this.elements.callStatus.textContent = 'Connecté';
    this.hidePlaceholder();
    this.elements.remoteVideo.style.display = 'block';
  }
  
  // ===== 🎥 AFFICHER VIDÉO LOCALE =====
  showLocalVideo(stream) {
    this.elements.localVideo.srcObject = stream;
    this.elements.localVideo.style.display = 'block';
  }
  
  // ===== 🎥 AFFICHER VIDÉO DISTANTE =====
  showRemoteVideo(stream) {
    this.elements.remoteVideo.srcObject = stream;
    this.elements.remoteVideo.style.display = 'block';
    this.hidePlaceholder();
  }
  
  // ===== ❌ CACHER L'INTERFACE =====
  hideCallInterface() {
    this.elements.interface.style.display = 'none';
    this.elements.localVideo.srcObject = null;
    this.elements.remoteVideo.srcObject = null;
    this.stopCallTimer();
  }
  
  // ===== 🕐 TIMER =====
  startCallTimer() {
    let seconds = 0;
    
    this.callTimer = setInterval(() => {
      seconds++;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      this.elements.callTimer.textContent = 
        `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
  }
  
  stopCallTimer() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
      this.elements.callTimer.textContent = '00:00';
    }
  }
  
  // ===== 🎤 MISE À JOUR BOUTON MICRO =====
  updateMicButton(isEnabled) {
    this.elements.toggleMicBtn.innerHTML = isEnabled ? '<span>🎤</span>' : '<span>🔇</span>';
    this.elements.toggleMicBtn.classList.toggle('muted', !isEnabled);
  }
  
  // ===== 📹 MISE À JOUR BOUTON CAMÉRA =====
  updateCameraButton(isEnabled) {
    this.elements.toggleCameraBtn.innerHTML = isEnabled ? '<span>📹</span>' : '<span>🚫</span>';
    this.elements.toggleCameraBtn.classList.toggle('disabled', !isEnabled);
  }
  
  // ===== 📊 AFFICHER STATUT CONNEXION =====
  showConnectionStatus(status) {
    this.elements.callStatus.textContent = status;
  }
  
  // ===== 📞 MODAL APPEL ENTRANT =====
  showIncomingCallModal(data) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'p2pIncomingCallModal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <h3>📞 Appel entrant</h3>
        <p><strong>${data.callerName}</strong> vous appelle</p>
        <p>${data.callType === 'video' ? '📹 Appel vidéo' : '🎤 Appel audio'}</p>
        
        <div class="modal-buttons">
          <button class="btn-danger" onclick="window.p2pCallManager.rejectCall('${data.callId}')">
            ❌ Refuser
          </button>
          <button class="btn-success" onclick="window.p2pCallManager.acceptCall('${data.callId}', '${data.callerId}', '${data.callerName}', '${data.callType}')">
            ✅ Accepter
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
  
  hideIncomingCallModal() {
    const modal = document.getElementById('p2pIncomingCallModal');
    if (modal) {
      modal.remove();
    }
  }
  
  // ===== 🖼️ PLACEHOLDER =====
  showPlaceholder(text) {
    const placeholder = document.createElement('div');
    placeholder.className = 'call-placeholder';
    placeholder.id = 'p2pCallPlaceholder';
    placeholder.innerHTML = `
      <div class="spinner"></div>
      <p>${text}</p>
    `;
    
    this.elements.interface.querySelector('.call-videos').appendChild(placeholder);
  }
  
  hidePlaceholder() {
    const placeholder = document.getElementById('p2pCallPlaceholder');
    if (placeholder) {
      placeholder.remove();
    }
  }
  
  // ===== ❌ AFFICHER ERREUR =====
  showError(message) {
    if (window.showAlert) {
      window.showAlert(message, 'error');
    } else {
      alert(message);
    }
  }
}

// Exposer globalement
window.P2PCallUI = P2PCallUI;