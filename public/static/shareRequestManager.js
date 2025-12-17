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
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>📢 Demander à partager</h3>
        <p>Entrez votre nom pour envoyer une demande au participant qui partage actuellement.</p>
        <input type="text" id="modalNameInput" placeholder="Votre nom" maxlength="30" autofocus>
        <div class="modal-buttons">
          <button class="btn-secondary" id="modalCancelBtn">Annuler</button>
          <button class="btn-primary" id="modalSendBtn">Envoyer la demande</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Focus sur l'input
    setTimeout(() => {
      const input = document.getElementById('modalNameInput');
      if (input) input.focus();
    }, 100);
    
    // Event listeners pour le modal
    const cancelBtn = document.getElementById('modalCancelBtn');
    const sendBtn = document.getElementById('modalSendBtn');
    const input = document.getElementById('modalNameInput');
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeModal());
    }
    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendShareRequest());
    }
    
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendShareRequest();
        }
      });
    }
  }

  showRequestNotification(requesterName, requesterId) {
    const notification = document.createElement('div');
    notification.className = 'notification-overlay';
    notification.innerHTML = `
      <div class="notification-content">
        <h3>🔔 Nouvelle demande</h3>
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
  // ENVOI DE DEMANDE
  // ========================================
  
  sendShareRequest() {
    const nameInput = document.getElementById('modalNameInput');
    if (!nameInput) {
      console.error('❌ Input de nom non trouvé');
      return;
    }
    
    const requesterName = nameInput.value.trim() || 
                          this.state.myName || 
                          `User-${this.socket.id.slice(0, 4)}`;
    
    if (!requesterName) {
      if (window.showAlert) {
        window.showAlert('Veuillez entrer votre nom', 'warning');
      }
      return;
    }
    
    // Mettre à jour le nom dans l'état
    this.state.myName = requesterName;
    
    console.log('📤 Envoi demande de partage:', requesterName);
    this.socket.emit('send-share-request', {
      name: requesterName,
      targetHostId: this.state.hostId
    });
    
    this.closeModal();
    
    if (window.showAlert) {
      window.showAlert('Demande envoyée ! En attente de réponse...', 'info', 10000);
    }
  }

  // ========================================
  // ACCEPTER / REFUSER
  // ========================================
  
  acceptShareRequest(requesterId, requesterName) {
    console.log('✅ Acceptation demande de:', requesterName);
    
    this.socket.emit('accept-share-request', {
      requesterId: requesterId,
      requesterName: requesterName
    });
    
    this.closeModal();
    
    if (window.showAlert) {
      window.showAlert(`Partage transféré à ${requesterName}`, 'success');
    }
  }

  denyShareRequest(requesterId, requesterName) {
    console.log('❌ Refus demande de:', requesterName);
    
    this.socket.emit('deny-share-request', {
      requesterId: requesterId
    });
    
    this.closeModal();
    
    if (window.showAlert) {
      window.showAlert(`Demande de ${requesterName} refusée`, 'info');
    }
  }

  // ========================================
  // GESTION DES RÉPONSES
  // ========================================
  
  handleRequestAccepted() {
    if (window.showAlert) {
      window.showAlert('Demande acceptée ! Vous pouvez maintenant partager.', 'success');
    }
    
    // Cacher le bouton de demande, afficher le bouton de partage
    if (this.elements.requestBtn) {
      this.elements.requestBtn.style.display = 'none';
    }
    
    if (this.elements.shareBtn) {
      this.elements.shareBtn.style.display = 'flex';
      this.elements.shareBtn.disabled = false;
      
      // Auto-démarrer le partage après 1 seconde
      setTimeout(() => {
        this.elements.shareBtn.click();
      }, 1000);
    }
  }

  handleRequestDenied() {
    if (window.showAlert) {
      window.showAlert('Demande refusée par l\'hôte', 'warning');
    }
  }

  // ========================================
  // MÉTHODES PUBLIQUES POUR L'APP
  // ========================================
  
  // Afficher le bouton de demande quand quelqu'un partage
  showRequestButton() {
    if (this.elements.shareBtn) {
      this.elements.shareBtn.style.display = 'none';
    }
    if (this.elements.requestBtn) {
      this.elements.requestBtn.style.display = 'flex';
    }
  }

  // Cacher le bouton de demande
  hideRequestButton() {
    if (this.elements.requestBtn) {
      this.elements.requestBtn.style.display = 'none';
    }
  }

  // Réinitialiser l'interface
  reset() {
    this.hideRequestButton();
    if (this.elements.shareBtn) {
      this.elements.shareBtn.style.display = 'flex';
      this.elements.shareBtn.disabled = false;
    }
  }
}

// Exposer globalement
window.ShareRequestManager = ShareRequestManager;
