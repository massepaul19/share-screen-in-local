// ========================================
// public/shareRequestManager.js
// Gestionnaire des demandes de partage d'écran
// ========================================

class ShareRequestManager {
  constructor(socket, state, elements) {
    this.socket = socket;
    this.state = state;
    this.elements = elements;
    this.autoRefuseTimer = null;

    this.init();
  }

  init() {
    console.log('🔧 Initialisation ShareRequestManager');
    this.setupEventListeners();
    this.setupSocketListeners();
  }

  setupEventListeners() {
    if (this.elements.requestBtn) {
      this.elements.requestBtn.addEventListener('click', () => {
        this.showRequestModal();
      });
    }
  }

  setupSocketListeners() {
    // Réception d'une demande (côté hôte)
    this.socket.on('share-request-received', (data) => {
      console.log('🔔 Demande reçue de:', data.requesterName);
      this.showRequestNotification(data.requesterName, data.requesterId);
    });

    // Demande acceptée (côté demandeur)
    this.socket.on('share-request-accepted', () => {
      console.log('✅ Votre demande a été acceptée');
      this.handleRequestAccepted();
    });

    // Demande refusée (côté demandeur)
    this.socket.on('share-request-denied', () => {
      console.log('❌ Votre demande a été refusée');
      this.handleRequestDenied();
    });
  }

  // ========================================
  // MODAL — CÔTÉ DEMANDEUR
  // ========================================

  showRequestModal() {
    this.closeModal();
    const myName = this.state.myName || 'Anonyme';
    const initials = this._getInitials(myName);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'shareRequestModalOverlay';
    modal.innerHTML = `
      <div class="modal-content share-request-modal">
        <div class="modal-header">
          <h3>
            <i class="fa-solid fa-display"></i>
            Demander à partager
          </h3>
          <button class="close-modal-btn" onclick="window.shareRequestManager.closeModal()">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>Vous êtes sur le point d'envoyer une demande de partage d'écran à l'hôte.</p>

          <div class="requester-preview">
            <div class="requester-avatar">${initials}</div>
            <div>
              <div class="requester-name">${this.escapeHtml(myName)}</div>
              <div class="requester-action">Souhaite partager son écran</div>
            </div>
          </div>

          <div class="notification-hint">
            Si la demande est acceptée, le partage actuel sera interrompu.
          </div>

          <div class="modal-buttons">
            <button class="btn-secondary" id="modalCancelBtn">Annuler</button>
            <button class="btn-primary" id="modalSendBtn">
              <i class="fa-solid fa-paper-plane"></i>
              Envoyer la demande
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalCancelBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('modalSendBtn').addEventListener('click', () => this.sendShareRequest());

    // Fermer en cliquant sur l'overlay
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });
  }

  // ========================================
  // NOTIFICATION — CÔTÉ HÔTE
  // ========================================

  showRequestNotification(requesterName, requesterId) {
    this.closeModal();

    const initials = this._getInitials(requesterName);
    let secondsLeft = 30;

    const notification = document.createElement('div');
    notification.className = 'notification-overlay';
    notification.id = 'shareNotificationOverlay';
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-inner">
          <div class="notif-icon">🖥️</div>
          <h3>Demande de partage</h3>

          <div class="notif-requester">
            <div class="notif-requester-avatar">${initials}</div>
            <span class="notif-requester-name">${this.escapeHtml(requesterName)}</span>
          </div>

          <p>souhaite partager son écran avec la session.</p>

          <div class="notification-hint">
            Accepter interrompra le partage actuel si quelqu'un partage déjà.
          </div>

          <div class="notification-buttons">
            <button class="btn-deny-share" id="denyRequestBtn">
              <i class="fa-solid fa-xmark"></i> Refuser
            </button>
            <button class="btn-accept-share" id="acceptRequestBtn">
              <i class="fa-solid fa-check"></i> Accepter
            </button>
          </div>

          <div class="notif-timer">
            Refus automatique dans <span id="notifCountdown">${secondsLeft}</span>s
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    // Compte à rebours
    const countdown = document.getElementById('notifCountdown');
    this.autoRefuseTimer = setInterval(() => {
      secondsLeft--;
      if (countdown) countdown.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(this.autoRefuseTimer);
        if (document.body.contains(notification)) {
          this.denyShareRequest(requesterId, requesterName);
        }
      }
    }, 1000);

    document.getElementById('denyRequestBtn').addEventListener('click', () => {
      clearInterval(this.autoRefuseTimer);
      this.denyShareRequest(requesterId, requesterName);
    });

    document.getElementById('acceptRequestBtn').addEventListener('click', () => {
      clearInterval(this.autoRefuseTimer);
      this.acceptShareRequest(requesterId, requesterName);
    });
  }

  // ========================================
  // MODAL "DEMANDE ACCEPTÉE" (côté demandeur)
  // ========================================

  handleRequestAccepted() {
    this.closeModal();
    if (window.showAlert) window.showAlert('Demande acceptée ! Démarrez le partage.', 'success');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'shareAcceptedModal';
    modal.innerHTML = `
      <div class="modal-content share-accepted-modal">
        <div class="modal-header">
          <h3>
            <i class="fa-solid fa-circle-check" style="color:#3fb950"></i>
            Demande acceptée !
          </h3>
          <button class="close-modal-btn" onclick="window.shareRequestManager.closeModal()">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="share-accepted-icon">✅</div>
          <p>L'hôte a accepté votre demande de partage.</p>
          <p>Cliquez sur le bouton ci-dessous pour démarrer le partage de votre écran.</p>
          <button class="btn-start-share" id="startShareFromAccept">
            <i class="fa-solid fa-display"></i>
            Démarrer le partage
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('startShareFromAccept').addEventListener('click', () => {
      this.closeModal();
      console.log(`📤 Démarrage du partage pour: ${this.state.myName}`);
      this.socket.emit('request-share', { name: this.state.myName });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });
  }

  // ========================================
  // DEMANDE REFUSÉE (côté demandeur)
  // ========================================

  handleRequestDenied() {
    this.closeModal();
    if (window.showAlert) window.showAlert("Votre demande a été refusée par l'hôte.", 'warning');
    
    // ✅ Nettoyer le stream capturé si refusé
    if (window.state && window.state.localStream) {
      window.state.localStream.getTracks().forEach(track => track.stop());
      window.state.localStream = null;
    }
    // Réactiver le bouton si nécessaire
    const shareBtn = document.getElementById('btnScreen');
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.classList.remove('loading');
    }
  }

  // ========================================
  // ACTIONS SOCKET
  // ========================================

  sendShareRequest() {
    const requesterName = this.state.myName;
    if (!requesterName) {
      if (window.showAlert) window.showAlert("Votre nom n'est pas défini.", 'error');
      this.closeModal();
      return;
    }
    this.socket.emit('send-share-request', {
      name: requesterName,
      targetHostId: this.state.hostId
    });
    this.closeModal();
    if (window.showAlert) window.showAlert('Demande envoyée ! En attente de réponse...', 'info', 10000);
  }

  acceptShareRequest(requesterId, requesterName) {
    this.socket.emit('accept-share-request', { requesterId, requesterName });
    this.closeModal();
    if (window.showAlert) window.showAlert(`Partage transféré à ${requesterName}`, 'success');
  }

  denyShareRequest(requesterId, requesterName) {
    this.socket.emit('deny-share-request', { requesterId });
    this.closeModal();
    if (window.showAlert) window.showAlert(`Demande de ${requesterName} refusée.`, 'info');
  }

  // ========================================
  // UI — Afficher / Masquer le bouton
  // ========================================

  showRequestButton() {
    if (this.elements.requestBtn) this.elements.requestBtn.style.display = 'flex';
    if (this.elements.shareBtn)   this.elements.shareBtn.style.display = 'none';
  }

  hideRequestButton() {
    if (this.elements.requestBtn) this.elements.requestBtn.style.display = 'none';
  }

  // ========================================
  // UTILITAIRES
  // ========================================

  closeModal() {
    clearInterval(this.autoRefuseTimer);
    document.querySelectorAll(
      '.modal-overlay, .notification-overlay, #shareRequestModalOverlay, #shareNotificationOverlay, #shareAcceptedModal'
    ).forEach(el => el.remove());
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
}

window.ShareRequestManager = ShareRequestManager;
