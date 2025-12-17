// ========================================
// public/static/chat.js - Module de chat amélioré avec swipe et bouton d'envoi
// ========================================

class ChatManager {
  constructor(socket) {
    this.socket = socket;
    this.isOpen = false;
    this.unreadMessages = 0;
    this.typingTimeout = null;
    this.userName = '';
    this.activeUsers = [];
    this.replyToId = null;
    this.replyToUsername = '';
    this.messagesMap = new Map();
    
    this.elements = {
      chatBtn: document.getElementById('chatBtn'),
      chatPanel: document.getElementById('chatPanel'),
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      sendBtn: document.getElementById('sendBtn'),
      closeChatBtn: document.getElementById('closeChatBtn'),
      unreadBadge: document.getElementById('unreadBadge'),
      nameInput: document.getElementById('nameInput'),
      chatUserName: document.getElementById('chatUserName')
    };
    
    this.init();
  }
  
  init() {
    // Événements UI
    this.elements.chatBtn.addEventListener('click', () => this.toggleChat());
    this.elements.closeChatBtn.addEventListener('click', () => this.closeChat());
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    
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
    this.socket.on('users-update', (users) => this.updateActiveUsers(users));
    
    console.log('✅ Chat manager amélioré initialisé');
  }
  
  toggleChat() {
    if (!this.userName || this.userName.startsWith('User-')) {
      this.showNicknameModal();
      return;
    }
    
    this.isOpen = !this.isOpen;
    
    if (this.isOpen) {
      this.elements.chatPanel.classList.add('open');
      this.elements.chatInput.focus();
      this.unreadMessages = 0;
      this.updateUnreadBadge();
    } else {
      this.elements.chatPanel.classList.remove('open');
    }
  }
  
  closeChat() {
    this.isOpen = false;
    this.elements.chatPanel.classList.remove('open');
  }
  
  showNicknameModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>💬 Bienvenue dans le chat !</h3>
        <p>Veuillez entrer votre surnom pour commencer à discuter.</p>
        <input 
          type="text" 
          id="nicknameInput" 
          placeholder="Votre surnom" 
          maxlength="30" 
          autofocus
          value=""
        >
        <div class="modal-buttons">
          <button class="btn-secondary" onclick="chatManager.closeNicknameModal()">Annuler</button>
          <button class="btn-primary" onclick="chatManager.saveNickname()">Continuer</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    setTimeout(() => {
      const input = document.getElementById('nicknameInput');
      input.focus();
      
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveNickname();
        }
      });
    }, 100);
  }
  
  saveNickname() {
    const input = document.getElementById('nicknameInput');
    const nickname = input.value.trim();
    
    if (!nickname) {
      this.showAlert('Veuillez entrer un surnom', 'warning');
      input.focus();
      return;
    }
    
    this.userName = nickname;
    this.socket.emit('update-name', { name: nickname });
    
    // Mettre à jour l'affichage du nom dans le header
    if (this.elements.chatUserName) {
      this.elements.chatUserName.textContent = nickname;
    }
    
    this.closeNicknameModal();
    
    this.isOpen = true;
    this.elements.chatPanel.classList.add('open');
    this.elements.chatInput.focus();
    
    this.showAlert(`Bienvenue ${nickname} ! 👋`, 'success', 3000);
  }
  
  closeNicknameModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      modal.remove();
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
    const text = this.elements.chatInput.value.trim();
    if (!text) return;
    
    const messageData = {
      text: text,
      replyTo: this.replyToId
    };
    
    this.socket.emit('send-message', messageData);
    
    this.elements.chatInput.value = '';
    this.elements.chatInput.style.height = 'auto';
    this.cancelReply();
    this.stopTyping();
  }
  
  addMessage(message) {
    const messageDiv = document.createElement('div');
    const isOwnMessage = message.senderId === this.socket.id;
    const isMentioned = this.checkIfMentioned(message.text);
    
    let messageClass = `chat-message ${isOwnMessage ? 'own-message' : ''}`;
    if (isMentioned && !isOwnMessage) {
      messageClass += ' mentioned';
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
    
    // Supprimer le message de bienvenue s'il existe
    const welcome = this.elements.chatMessages.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    this.elements.chatMessages.appendChild(messageDiv);
    
    // Initialiser le swipe handler pour ce message
    if (!isOwnMessage) {
      new SwipeHandler(messageDiv, () => {
        this.replyToMessage(message.id, message.senderName);
      });
    }
    
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    
    // Animation pour les nouveaux messages
    messageDiv.classList.add('new-message');
    setTimeout(() => messageDiv.classList.remove('new-message'), 500);
    
    if (!this.isOpen && !isOwnMessage) {
      this.unreadMessages++;
      this.updateUnreadBadge();
      
      this.elements.chatBtn.classList.add('pulse');
      setTimeout(() => this.elements.chatBtn.classList.remove('pulse'), 1000);
    }
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
  
  updateUnreadBadge() {
    if (this.unreadMessages > 0) {
      this.elements.unreadBadge.textContent = this.unreadMessages > 99 ? '99+' : this.unreadMessages;
      this.elements.unreadBadge.style.display = 'flex';
    } else {
      this.elements.unreadBadge.style.display = 'none';
    }
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
    // Mettre à jour l'affichage dans le header
    if (this.elements.chatUserName) {
      this.elements.chatUserName.textContent = name;
    }
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
