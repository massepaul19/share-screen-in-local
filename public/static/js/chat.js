// ========================================
// public/static/chat.js - Module de chat amélioré avec swipe et bouton d'envoi
// ========================================

class ChatManager {
  constructor(socket) {
    this.socket = socket;
    this.unreadMessages = 0;
    this.typingTimeout = null;
    this.userName = '';
    this.activeUsers = [];
    this.replyToId = null;
    this.replyToUsername = '';
    this.messagesMap = new Map();
    this.isChatOpen = false; // État d'ouverture du chat
    this.activeTab = 'public'; // 'public' ou 'private'
    this.privateChatManager = null;
    
    this.elements = {
      chatPanel: document.getElementById('chatPanel'),
      chatMessages: document.getElementById('chatMessages'),
      privateChatContainer: document.getElementById('privateChatContainer'), // Nouveau conteneur principal
      chatInput: document.getElementById('chatInput'),
      sendBtn: document.getElementById('sendBtn'),
      attachBtn: document.querySelector('.attach-btn'),
      fileInput: document.getElementById('fileInput'),
      msgCount: document.getElementById('msgCount'),
      chatTabBtn: document.getElementById('btnChat') // Bouton d'onglet du chat
    };
    this.pendingFile = null;
    
    // Exposer l'instance globalement pour les handlers onclick dans le HTML généré
    window.chatManager = this;
    
    this.init();
  }
  
  init() {
    // Événements UI
    this.setupTabs(); // Initialiser les onglets
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    this.elements.attachBtn.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    
    this.elements.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Gestion des mentions avec @
    this.elements.chatInput.addEventListener('input', (e) => {
      this.autoResize(e.target);
      this.handleMessageInput(e);
      
      if (e.target.value.trim()) {
        this.startTyping();
      } else {
        this.stopTyping();
      }
    });
    
    // Fermer les suggestions quand on clique ailleurs
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.chat-input-container')) {
        this.hideUserSuggestions();
      }
    });
    
    // Événements Socket
    this.socket.on('new-message', (message) => this.addMessage(message));
    this.socket.on('user-typing', (data) => this.handleTyping(data));
    this.socket.on('file-shared', (fileData) => this.addFileMessage(fileData));
    this.socket.on('users-update', (users) => this.updateActiveUsers(users));

    // Initialiser le gestionnaire de chat privé s'il est chargé
    if (typeof PrivateChatManager !== 'undefined') {
      this.privateChatManager = new PrivateChatManager(this.socket, this);
    }
    
    // Demander l'historique au démarrage
    this.socket.emit('request-chat-history');
    this.socket.on('chat-history', ({ messages }) => {
      messages.forEach(msg => this.addMessage(msg));
    });
    
    console.log('✅ Chat manager initialisé pour le panneau intégré');

    // Observer l'ouverture du panneau de chat pour reset les notifications
    this.setupPanelObserver();
  }

  // ===== GESTION DES ONGLETS =====
  setupTabs() {
    const tabPublic = document.getElementById('tabPublic');
    const tabPrivate = document.getElementById('tabPrivate');

    if (tabPublic) {
      tabPublic.addEventListener('click', () => this.switchTab('public'));
    }
    if (tabPrivate) {
      tabPrivate.addEventListener('click', () => this.switchTab('private'));
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    
    // Mise à jour visuelle des boutons
    document.getElementById('tabPublic').classList.toggle('active', tabName === 'public');
    document.getElementById('tabPrivate').classList.toggle('active', tabName === 'private');

    // Afficher/Masquer les conteneurs de messages
    this.elements.chatMessages.classList.toggle('hidden', tabName !== 'public');
    this.elements.privateChatContainer.classList.toggle('hidden', tabName !== 'private');
    
    this.elements.chatInput.focus();
  }

  setupPanelObserver() {
    // On suppose que le panneau a une classe 'hidden' quand il est fermé
    // ou que le bouton d'onglet a une classe 'active' quand il est ouvert
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target.id === 'chatPanel' && !mutation.target.classList.contains('hidden')) {
          this.isChatOpen = true;
          this.resetUnreadCount();
        } else if (mutation.target.id === 'chatPanel') {
          this.isChatOpen = false;
        }
      });
    });

    if (this.elements.chatPanel) {
      observer.observe(this.elements.chatPanel, { attributes: true, attributeFilter: ['class'] });
    }
  }

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Afficher la prévisualisation
    this.pendingFile = file;
    this.showFilePreview(file);

    // Réinitialiser l'input pour permettre de sélectionner le même fichier à nouveau
    event.target.value = '';
  }

  showFilePreview(file) {
    let previewContainer = document.getElementById('filePreviewContainer');
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'filePreviewContainer';
      previewContainer.className = 'file-preview-container';
      this.elements.chatInput.parentElement.insertBefore(previewContainer, this.elements.chatInput);
    }

    const fileType = this.getFileType(file.name);
    const iconClass = this.getFileIcon(fileType);

    previewContainer.innerHTML = `
      <div class="file-preview-content">
        <i class="${iconClass} file-preview-icon"></i>
        <div class="file-preview-info">
          <span class="file-preview-name">${this.escapeHtml(file.name)}</span>
          <span class="file-preview-size">${(file.size / 1024).toFixed(1)} KB</span>
        </div>
        <button class="file-preview-cancel" title="Annuler">✕</button>
      </div>
      <div class="file-progress-bar"></div>
    `;
    previewContainer.style.display = 'block';

    previewContainer.querySelector('.file-preview-cancel').addEventListener('click', () => {
      previewContainer.style.display = 'none';
      this.pendingFile = null;
      this.elements.chatInput.focus();
    });
  }

  uploadFile(file) {
    const progressBar = document.querySelector('.file-progress-bar');
    const previewContainer = document.getElementById('filePreviewContainer');
    const cancelButton = previewContainer.querySelector('.file-preview-cancel');
    
    cancelButton.style.display = 'none'; // Cacher le bouton annuler pendant l'upload

    const reader = new FileReader();
    reader.onload = (e) => {
      // Déterminer la cible (Privé ou Public)
      const to = (this.activeTab === 'private' && this.privateChatManager && this.privateChatManager.target) ? this.privateChatManager.target.id : null;

      // SÉCURITÉ : Empêcher l'envoi public accidentel depuis l'onglet privé
      if (this.activeTab === 'private' && !to) {
        this.showAlert('Veuillez sélectionner une conversation pour envoyer un fichier privé.', 'error');
        // Réinitialiser la prévisualisation
        if (previewContainer) previewContainer.style.display = 'none';
        this.pendingFile = null;
        if (cancelButton) cancelButton.style.display = 'block';
        return;
      }

      this.socket.emit('file-share', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: e.target.result,
        to: to // On envoie l'ID du destinataire (ou null si public)
      });
      // La confirmation viendra du serveur
    };

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentLoaded = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = `${percentLoaded}%`;
      }
    };

    reader.onloadend = () => {
      // Masquer la prévisualisation et restaurer le bouton d'envoi après un court délai
      this.pendingFile = null;
      setTimeout(() => {
        previewContainer.style.display = 'none';
      }, 500);
    };

    reader.readAsArrayBuffer(file);
  }

  getFileType(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return 'image';
    if (['pdf'].includes(extension)) return 'pdf';
    if (['doc', 'docx'].includes(extension)) return 'word';
    if (['zip', 'rar', '7z'].includes(extension)) return 'archive';
    return 'file';
  }

  getFileIcon(fileType) {
    switch (fileType) {
      case 'image': return 'fa-solid fa-file-image';
      case 'pdf': return 'fa-solid fa-file-pdf';
      case 'word': return 'fa-solid fa-file-word';
      case 'archive': return 'fa-solid fa-file-zipper';
      default: return 'fa-solid fa-file';
    }
  }
  
  // ===== NOUVELLE FONCTIONNALITÉ: Gestion des mentions =====
  handleMessageInput(e) {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('@') && lastWord.length > 1) {
      this.showUserSuggestions(lastWord.substring(1));
    } else {
      this.hideUserSuggestions();
    }
  }
  
  showUserSuggestions(query) {
    // Créer le conteneur de suggestions s'il n'existe pas
    let suggestionsContainer = document.getElementById('userSuggestions');
    if (!suggestionsContainer) {
      suggestionsContainer = document.createElement('div');
      suggestionsContainer.id = 'userSuggestions';
      suggestionsContainer.className = 'suggestions';
      this.elements.chatInput.parentElement.appendChild(suggestionsContainer);
    }

    const filteredUsers = this.activeUsers.filter(user =>
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.id.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredUsers.length === 0) {
      this.hideUserSuggestions();
      return;
    }

    const html = filteredUsers.map(user => {
      const initial = user.name.charAt(0).toUpperCase();
      return `
        <div class="suggestion" onclick="chatManager.selectUser('${user.id}', '${this.escapeHtml(user.name)}')">
          <div class="suggestion-avatar">${initial}</div>
          <div>
            <div class="suggestion-username">${this.escapeHtml(user.name)}</div>
            <div class="suggestion-userid">@${user.id.substring(0, 8)}</div>
          </div>
        </div>
      `;
    }).join('');

    suggestionsContainer.innerHTML = html;
    suggestionsContainer.style.display = 'block';
  }

  hideUserSuggestions() {
    const suggestionsContainer = document.getElementById('userSuggestions');
    if (suggestionsContainer) {
      suggestionsContainer.style.display = 'none';
    }
  }

  selectUser(userId, username) {
    const input = this.elements.chatInput;
    const value = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);

    const words = textBeforeCursor.split(/\s+/);
    words[words.length - 1] = `@${username}`;

    input.value = words.join(' ') + ' ' + textAfterCursor;
    this.hideUserSuggestions();
    input.focus();
    
    // Placer le curseur après la mention
    const newCursorPos = words.join(' ').length + 1;
    input.setSelectionRange(newCursorPos, newCursorPos);
  }
  
  // ===== NOUVELLE FONCTIONNALITÉ: Mise à jour utilisateurs actifs =====
  updateActiveUsers(users) {
    this.activeUsers = users || [];
    console.log(`👥 ${this.activeUsers.length} utilisateurs actifs dans le chat`);
  }
  
  // ===== NOUVELLE FONCTIONNALITÉ: Système de réponses =====
  replyToMessage(messageId, username) {
    this.replyToId = messageId;
    this.replyToUsername = username;
    
    // Créer l'indicateur de réponse s'il n'existe pas
    let replyIndicator = document.getElementById('replyIndicator');
    if (!replyIndicator) {
      replyIndicator = document.createElement('div');
      replyIndicator.id = 'replyIndicator';
      replyIndicator.className = 'reply-indicator';
      this.elements.chatInput.parentElement.insertBefore(
        replyIndicator, 
        this.elements.chatInput
      );
    }
    
    replyIndicator.innerHTML = `
      <span>Répondre à: <strong>${this.escapeHtml(username)}</strong></span>
      <span class="reply-cancel" onclick="chatManager.cancelReply()">✕</span>
    `;
    replyIndicator.style.display = 'flex';
    
    this.elements.chatInput.focus();
  }
  
  cancelReply() {
    this.replyToId = null;
    this.replyToUsername = '';
    
    const replyIndicator = document.getElementById('replyIndicator');
    if (replyIndicator) {
      replyIndicator.style.display = 'none';
    }
  }
  
  sendMessage() {
    if (this.pendingFile) {
      this.uploadFile(this.pendingFile);
      return;
    }

    const text = this.elements.chatInput.value.trim();
    if (!text) return;
    
    // Déterminer la cible en fonction de l'onglet actif
    const messageData = {
      text: text,
      replyTo: this.replyToId,
      to: (this.activeTab === 'private' && this.privateChatManager && this.privateChatManager.target) ? this.privateChatManager.target.id : null
    };
    
    this.socket.emit('send-message', messageData);

    // Affichage optimiste (immédiat) du message local
    // Note: Le serveur renvoie aussi le message à l'expéditeur, 
    // donc on doit éviter les doublons. 
    // Ici, on attend le retour du serveur pour être sûr de l'ID et du timestamp,
    // mais on pourrait l'ajouter tout de suite avec un ID temporaire.
    // Pour l'instant, on laisse le socket.on('new-message') gérer l'affichage
    // car il est très rapide en local.
    
    // Si on voulait l'ajouter tout de suite :
    // this.addMessage({ ...messageData, senderId: this.socket.id, senderName: 'Moi', timestamp: Date.now(), id: 'temp-' + Date.now() });
    // Mais il faudrait filtrer le retour serveur.
    
    this.elements.chatInput.value = '';
    this.elements.chatInput.style.height = 'auto';
    this.cancelReply();
    this.stopTyping();
  }
  
  addMessage(message) {
    // 0. SÉCURITÉ ID : Si le message n'a pas d'ID, on en crée un basé sur le contenu et l'heure
    if (!message.id) {
      message.id = `msg_${message.senderId}_${message.timestamp || Date.now()}_${message.text.length}`;
    }

    // 1. ANTI-DOUBLON : Si on a déjà ce message, on l'ignore
    if (message.id && this.messagesMap.has(message.id)) return;

    const messageDiv = document.createElement('div');
    const isOwnMessage = message.senderId === this.socket.id;
    const isMentioned = this.checkIfMentioned(message.text);
    
    // 2. ROUTAGE STRICT (Public vs Privé)
    const isPrivate = (message.to !== null && message.to !== undefined && message.to !== '') || message.isPrivate;
    
    let targetContainer = this.elements.chatMessages; // Par défaut : Public

    if (isPrivate) {
      // Déléguer TOUTE la gestion du message privé au PrivateChatManager
      if (this.privateChatManager) {
        this.privateChatManager.handleIncomingMessage(message);
        return; // On arrête ici, le PrivateChatManager s'occupe du DOM
      }
    }
    
    let messageClass = `chat-message ${isOwnMessage ? 'own-message' : ''}`;
    if (isMentioned && !isOwnMessage) {
      messageClass += ' mentioned';
    }
    if (isPrivate) {
      messageClass += ' private-message';
    }
    
    const time = new Date(message.timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Contexte de réponse si le message est une réponse
    let replyContextHtml = '';
    if (message.replyTo) {
      const originalMessage = this.messagesMap.get(message.replyTo);
      if (originalMessage) {
        replyContextHtml = `
          <div class="reply-context">
            <div class="reply-indicator-msg">↪ En réponse à <strong>${this.escapeHtml(originalMessage.senderName)}</strong>:</div>
            <div class="original-message-preview">${this.escapeHtml(this.truncate(originalMessage.text, 50))}</div>
          </div>
        `;
      }
    }
    
    messageDiv.className = messageClass;
    messageDiv.dataset.messageId = message.id;
    messageDiv.dataset.username = message.senderName;
    
    // Icône de swipe
    const swipeIcon = document.createElement('div');
    swipeIcon.className = 'swipe-reply-icon';
    swipeIcon.textContent = '↩️';
    
    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${this.escapeHtml(message.senderName)}</span>
        <span class="message-time">${time}</span>
      </div>
      ${replyContextHtml}
      <div class="message-text">${this.processMessageContent(message.text)}</div>
    `;
    
    // Ajouter l'icône de swipe au début
    messageDiv.insertBefore(swipeIcon, messageDiv.firstChild);
    
    // Sauvegarder le message dans la map
    this.messagesMap.set(message.id, message);
    
    targetContainer.appendChild(messageDiv);
    
    // Initialiser le swipe handler pour ce message
    if (!isOwnMessage) {
      new SwipeHandler(messageDiv, () => {
        this.replyToMessage(message.id, message.senderName);
      });
    }
    
    targetContainer.scrollTop = targetContainer.scrollHeight;
    
    // Animation pour les nouveaux messages
    messageDiv.classList.add('new-message');
    setTimeout(() => messageDiv.classList.remove('new-message'), 500);

    // Gestion des notifications
    if (!isOwnMessage && !this.isChatOpen) {
      this.unreadMessages++;
      this.updateUnreadBadge();
    }
  }

  updateUnreadBadge() {
    if (this.elements.msgCount) {
      if (this.unreadMessages > 0) {
        this.elements.msgCount.textContent = this.unreadMessages > 99 ? '99+' : this.unreadMessages;
        this.elements.msgCount.classList.add('visible');
      } else {
        this.elements.msgCount.classList.remove('visible');
      }
    }
    // Mettre à jour aussi le badge sur le bouton de l'en-tête si nécessaire
    if (this.elements.chatTabBtn && this.unreadMessages > 0) {
       // Ajouter une classe ou un indicateur visuel sur l'onglet
    }
  }

  addFileMessage(fileData) {
    // 1. ROUTAGE STRICT (Public vs Privé)
    const isPrivate = (fileData.to !== null && fileData.to !== undefined && fileData.to !== '') || fileData.isPrivate;

    if (isPrivate) {
      // Déléguer au gestionnaire privé
      if (this.privateChatManager) {
        this.privateChatManager.handleIncomingFile(fileData);
        return; 
      }
    }

    // 2. AFFICHAGE PUBLIC (si ce n'est pas privé)
    const fileDiv = document.createElement('div');
    const isOwnMessage = fileData.senderId === this.socket.id;
    const time = new Date(fileData.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    fileDiv.className = `chat-message ${isOwnMessage ? 'own-message' : ''}`;

    const blob = new Blob([fileData.fileData], { type: fileData.fileType });
    const url = URL.createObjectURL(blob);

    fileDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${this.escapeHtml(fileData.senderName)}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="file-message">
        <i class="fa-solid fa-file"></i>
        <div class="file-info">
          <span class="file-name">${this.escapeHtml(fileData.fileName)}</span>
          <span class="file-size">${(fileData.fileSize / 1024).toFixed(1)} KB</span>
        </div>
        <a href="${url}" download="${this.escapeHtml(fileData.fileName)}" class="download-btn" title="Télécharger">
          <i class="fa-solid fa-download"></i>
        </a>
      </div>
    `;
    this.elements.chatMessages.appendChild(fileDiv);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }

  resetUnreadCount() {
    this.unreadMessages = 0;
    this.updateUnreadBadge();
  }
  
  // ===== UTILITAIRES =====
  checkIfMentioned(text) {
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      if (match[1].toLowerCase() === this.userName.toLowerCase()) {
        return true;
      }
    }
    return false;
  }
  
  processMessageContent(content) {
    // Remplacer les mentions par des spans stylisés
    return this.escapeHtml(content).replace(/@(\w+)/g, (match, username) => {
      const user = this.activeUsers.find(u => 
        u.name.toLowerCase() === username.toLowerCase() ||
        u.id.toLowerCase() === username.toLowerCase()
      );
      const displayName = user ? user.name : username;
      return `<span class="mention">@${displayName}</span>`;
    });
  }
  
  truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  startTyping() {
    this.socket.emit('typing', { isTyping: true });
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.stopTyping(), 3000);
  }
  
  stopTyping() {
    this.socket.emit('typing', { isTyping: false });
    clearTimeout(this.typingTimeout);
  }
  
  handleTyping(data) {
    if (data.isTyping) {
      this.showTypingIndicator(data.userName);
    } else {
      this.hideTypingIndicator();
    }
  }
  
  showTypingIndicator(userName) {
    let indicator = document.getElementById('typingIndicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'typingIndicator';
      indicator.className = 'typing-indicator';
      this.elements.chatMessages.appendChild(indicator);
    }
    
    indicator.innerHTML = `
      <span>${this.escapeHtml(userName)} écrit</span>
      <span class="typing-dots">
        <span>.</span><span>.</span><span>.</span>
      </span>
    `;
    
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }
  
  hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }
  
  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  showAlert(message, type = 'info', duration = 5000) {
    if (typeof window.showAlert === 'function') {
      window.showAlert(message, type, duration);
    }
  }
  
  setUserName(name) {
    this.userName = name;
  }

  // ===== INTERFACE POUR LE CHAT PRIVÉ =====
  initiatePrivateChat(targetId, targetName) {
    if (this.privateChatManager) {
      this.privateChatManager.initiate(targetId, targetName);
    }
  }

  clearMessages() {
    this.elements.chatMessages.innerHTML = '';
    this.messagesMap.clear();
  }
}

// ===== GESTIONNAIRE DE SWIPE POUR RÉPONDRE AUX MESSAGES =====
class SwipeHandler {
  constructor(messageElement, onSwipeReply) {
    this.element = messageElement;
    this.onSwipeReply = onSwipeReply;
    this.startX = 0;
    this.currentX = 0;
    this.isSwiping = false;
    this.threshold = 80; // Distance minimale pour déclencher la réponse
    this.maxSwipe = 120; // Distance maximale de swipe
    
    this.init();
  }

  init() {
    // Événements tactiles (mobile)
    this.element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
    this.element.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.element.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    
    // Événements souris (desktop)
    this.element.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  handleTouchStart(e) {
    this.startX = e.touches[0].clientX;
    this.isSwiping = true;
    this.element.classList.add('swiping');
  }

  handleTouchMove(e) {
    if (!this.isSwiping) return;

    this.currentX = e.touches[0].clientX;
    const diffX = this.currentX - this.startX;

    // Permettre seulement le swipe vers la droite
    if (diffX > 0) {
      e.preventDefault();
      const translateX = Math.min(diffX, this.maxSwipe);
      this.element.style.transform = `translateX(${translateX}px)`;
      
      // Ajouter feedback visuel si on dépasse le seuil
      if (translateX >= this.threshold) {
        this.element.classList.add('swipe-active');
      } else {
        this.element.classList.remove('swipe-active');
      }
    }
  }

  handleTouchEnd(e) {
    if (!this.isSwiping) return;

    const diffX = this.currentX - this.startX;
    
    // Si le swipe dépasse le seuil, déclencher la réponse
    if (diffX >= this.threshold) {
      this.triggerReply();
    }

    this.reset();
  }

  handleMouseDown(e) {
    // Ignorer le clic droit
    if (e.button !== 0) return;
    
    this.startX = e.clientX;
    this.isSwiping = true;
    this.element.classList.add('swiping');
  }

  handleMouseMove(e) {
    if (!this.isSwiping) return;

    this.currentX = e.clientX;
    const diffX = this.currentX - this.startX;

    if (diffX > 0) {
      const translateX = Math.min(diffX, this.maxSwipe);
      this.element.style.transform = `translateX(${translateX}px)`;
      
      if (translateX >= this.threshold) {
        this.element.classList.add('swipe-active');
      } else {
        this.element.classList.remove('swipe-active');
      }
    }
  }

  handleMouseUp(e) {
    if (!this.isSwiping) return;

    const diffX = this.currentX - this.startX;
    
    if (diffX >= this.threshold) {
      this.triggerReply();
    }

    this.reset();
  }

  triggerReply() {
    // Animation de confirmation
    this.element.style.transform = 'translateX(100px)';
    setTimeout(() => {
      this.onSwipeReply();
      this.reset();
    }, 150);
  }

  reset() {
    this.isSwiping = false;
    this.startX = 0;
    this.currentX = 0;
    this.element.classList.remove('swiping', 'swipe-active');
    this.element.style.transform = '';
  }
}

// Exporter pour utilisation globale
window.ChatManager = ChatManager;
