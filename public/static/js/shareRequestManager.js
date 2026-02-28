// ========================================
// public/shareRequestManager.js
// Gestionnaire des demandes de partage d'écran
// ========================================

class ShareRequestManager {
  constructor(socket, state, elements) {
    this.socket = socket;
    this.state = state;
    this.elements = elements;
    
    this.init();
  }

  // ========================================
  // INITIALISATION
  // ========================================
  
  init() {
    console.log('🔧 Initialisation ShareRequestManager');
    this.setupEventListeners();
    this.setupSocketListeners();
  }

  // ========================================
  // EVENT LISTENERS
  // ========================================
  
  setupEventListeners() {
    // Bouton pour ouvrir le modal de demande
    if (this.elements.requestBtn) {
      this.elements.requestBtn.addEventListener('click', () => {
        this.showRequestModal();
      });
    }
  }

  // ========================================
  // SOCKET LISTENERS
  // ========================================
  
  setupSocketListeners() {
    // Réception d'une demande (côté hôte)
    this.socket.on('share-request-received', (data) => {
      console.log('🔔 Demande reçue de:', data.requesterName);
      this.showRequestNotification(data.requesterName, data.requesterId);
    });

    // Demande acceptée (côté demandeur)
    this.socket.on('share-request-accepted', () => {
      console.log('✅ Votre demande a été acceptée !');
      this.handleRequestAccepted();
    });

    // Demande refusée (côté demandeur)
    this.socket.on('share-request-denied', () => {
      console.log('❌ Votre demande a été refusée');
      this.handleRequestDenied();
    });
  }

  // ========================================
  // GESTION DES MODALS
  // ========================================
  
  showRequestModal() {
    const myName = this.state.myName || 'Anonyme';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fa-solid fa-hand" style="color: var(--warning);"></i> Demander à partager</h3>
          <button class="close-modal-btn" onclick="window.shareRequestManager.closeModal()">✕</button>
        </div>
        <p>Vous êtes sur le point d'envoyer une demande de partage à l'hôte. Votre nom affiché sera <strong>${this.escapeHtml(myName)}</strong>.</p>
        <p class="notification-hint">Si la demande est acceptée, le partage actuel sera interrompu.</p>
        <div class="modal-buttons">
          <button class="btn-secondary" id="modalCancelBtn">Annuler</button>
          <button class="btn-primary" id="modalSendBtn">Confirmer et envoyer</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('modalCancelBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('modalSendBtn').addEventListener('click', () => this.sendShareRequest());
  }

  showRequestNotification(requesterName, requesterId) {
    const notification = document.createElement('div');
    notification.className = 'notification-overlay';
    notification.innerHTML = `
      <div class="notification-content">
        <h3><i class="fa-solid fa-bell"></i> Nouvelle demande</h3>
        <p><strong>${requesterName}</strong> souhaite partager son écran.</p>
        <p class="notification-hint">Accepter arrêtera votre partage actuel.</p>
        <div class="notification-buttons">
          <button class="btn-danger" id="denyRequestBtn">❌ Refuser</button>
          <button class="btn-success" id="acceptRequestBtn">✅ Accepter</button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);
    
    // Event listeners pour la notification
    const denyBtn = document.getElementById('denyRequestBtn');
    const acceptBtn = document.getElementById('acceptRequestBtn');
    
    if (denyBtn) {
      denyBtn.addEventListener('click', () => {
        this.denyShareRequest(requesterId, requesterName);
      });
    }
    
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        this.acceptShareRequest(requesterId, requesterName);
      });
    }
    
    // Auto-refus après 30 secondes
    setTimeout(() => {
      if (document.body.contains(notification)) {
        this.denyShareRequest(requesterId, requesterName);
      }
    }, 30000);
  }

  closeModal() {
    const modals = document.querySelectorAll('.modal-overlay, .notification-overlay');
    modals.forEach(modal => modal.remove());
  }

  // ========================================
  // GESTION UI BOUTONS
  // ========================================
  
  showRequestButton() {
    if (this.elements.requestBtn) this.elements.requestBtn.style.display = 'flex';
    if (this.elements.shareBtn) this.elements.shareBtn.style.display = 'none';
  }

  hideRequestButton() {
    if (this.elements.requestBtn) this.elements.requestBtn.style.display = 'none';
    // Note: shareBtn est géré par app.js (host-stopped-sharing)
  }

  // ========================================
  // ENVOI DE DEMANDE
  // ========================================
  
  sendShareRequest() {
    const requesterName = this.state.myName;
    
    if (!requesterName) {
      if (window.showAlert) window.showAlert("Votre nom n'est pas défini. Veuillez le configurer dans les paramètres.", 'error');
      this.closeModal();
      return;
    }
    
    this.socket.emit('send-share-request', {
      name: requesterName, // Assurez-vous que le serveur attend 'name' ou 'requesterName'
      targetHostId: this.state.hostId
    });
    
    this.closeModal();
    if (window.showAlert) window.showAlert('Demande envoyée ! En attente de réponse...', 'info', 10000);
  }

  // ========================================
  // ACCEPTER / REFUSER
  // ========================================
  
  acceptShareRequest(requesterId, requesterName) {
    this.socket.emit('accept-share-request', { requesterId, requesterName });
    this.closeModal();
    if (window.showAlert) window.showAlert(`Partage transféré à ${requesterName}`, 'success');
  }

  denyShareRequest(requesterId, requesterName) {
    this.socket.emit('deny-share-request', { requesterId });
    this.closeModal();
    if (window.showAlert) window.showAlert(`Demande de ${requesterName} refusée`, 'info');
  }

  handleRequestAccepted() {
    this.closeModal(); // Fermer tous les autres modals
    if (window.showAlert) window.showAlert('Demande acceptée ! Préparez-vous à partager.', 'success');
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="text-align: center;">
        <div class="modal-header">
          <h3><i class="fa-solid fa-check-circle" style="color: var(--success);"></i> Prêt à partager</h3>
        </div>
        <p>L'hôte a accepté votre demande.</p>
        <p>Cliquez sur le bouton ci-dessous pour démarrer le partage de votre écran.</p>
        <div class="modal-buttons" style="justify-content: center; margin-top: 1.5rem;">
          <button class="btn-launch" id="startShareFromAccept">
            <i class="fa-solid fa-display"></i> Démarrer le partage
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('startShareFromAccept').addEventListener('click', () => {
        this.closeModal();
        console.log(`📤 [Accepted] Demande de partage pour: ${this.state.myName}`);
        this.socket.emit('request-share', { name: this.state.myName });
    });
  }

  handleRequestDenied() {
    if (window.showAlert) window.showAlert('Demande refusée par l\'hôte', 'warning');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.ShareRequestManager = ShareRequestManager;
