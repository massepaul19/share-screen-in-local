// ========================================
// public/static/js/private-chat.js
// Gestionnaire de chat privé (Multi-conversations)
// ========================================

class PrivateChatManager {
  constructor(socket, chatManager) {
    this.socket = socket;
    this.chatManager = chatManager;
    this.target = null; // { id, name }
    this.conversations = new Map(); // userId -> { name, messages: [], unread: 0 }
    
    this.elements = {
      list: document.getElementById('privateChatList'),
      view: document.getElementById('privateChatView'),
      container: document.getElementById('privateChatContainer')
    };
    
    this.init();
  }

  init() {
    console.log('🔒 Gestionnaire de chat privé prêt');
    this.renderList();
  }

  initiate(targetId, targetName) {
    // 1. Vérifier si on ne clique pas sur soi-même
    // if (targetId === this.socket.id) return; // Autoriser le chat avec soi-même

    // SÉCURITÉ : Empêcher l'envoi public si l'ID est manquant
    if (!targetId) {
      console.error("❌ Erreur: ID cible manquant pour le chat privé");
      return;
    }

    // 2. Ouvrir la conversation
    this.openConversation(targetId, targetName);

    // 3. Envoyer automatiquement un message de présentation personnalisé
    const myName = this.chatManager.userName || 'Un utilisateur';
    const helloMessage = `👋 Bonjour, c'est ${myName}. J'aimerais discuter en privé.`;

    this.socket.emit('send-message', {
      text: helloMessage,
      to: targetId
    });
  }

  // Gérer TOUT message privé entrant (ou sortant)
  handleIncomingMessage(message) {
    const isOwn = message.senderId === this.socket.id;
    const otherId = isOwn ? message.to : message.senderId;
    const otherName = isOwn ? (this.conversations.get(otherId)?.name || 'Inconnu') : message.senderName;

    // 1. Récupérer ou créer la conversation
    let conv = this.conversations.get(otherId);
    if (!conv) {
      conv = { name: otherName, messages: [], unread: 0 };
      this.conversations.set(otherId, conv);
    }
    
    // Mettre à jour le nom si disponible
    if (!isOwn) conv.name = message.senderName;

    // 2. Ajouter le message
    conv.messages.push(message);

    // 3. Gérer le compteur non-lu
    // Si on n'est pas dans cette conversation OU si l'onglet privé n'est pas actif
    const isChattingWithHim = this.target && this.target.id === otherId;
    const isTabActive = this.chatManager.activeTab === 'private';
    
    if (!isOwn && (!isChattingWithHim || !isTabActive)) {
      conv.unread++;
      this.updateGlobalBadge();
      this.chatManager.showAlert(`💬 Nouveau message de ${message.senderName}`, 'info');
    }

    // 4. Mise à jour de l'interface
    this.renderList(); // Mettre à jour la liste (dernier message, badge)

    // Si on est dans la conversation active, afficher le message
    if (isChattingWithHim) {
      this.appendMessageToView(message);
    }
  }

  // Gérer un FICHIER entrant (ou sortant)
  handleIncomingFile(fileData) {
    const isOwn = fileData.senderId === this.socket.id;
    const otherId = isOwn ? fileData.to : fileData.senderId;
    const otherName = isOwn ? (this.conversations.get(otherId)?.name || 'Inconnu') : fileData.senderName;

    // 1. Récupérer ou créer la conversation
    let conv = this.conversations.get(otherId);
    if (!conv) {
      conv = { name: otherName, messages: [], unread: 0 };
      this.conversations.set(otherId, conv);
    }

    // 2. Ajouter le fichier comme un message spécial
    // On ajoute un champ 'type: file' pour le distinguer
    fileData.type = 'file';
    fileData.text = `📎 Fichier: ${fileData.fileName}`; // Texte de repli pour la preview
    conv.messages.push(fileData);

    // 3. Gérer le compteur non-lu
    const isChattingWithHim = this.target && this.target.id === otherId;
    const isTabActive = this.chatManager.activeTab === 'private';
    
    if (!isOwn && (!isChattingWithHim || !isTabActive)) {
      conv.unread++;
      this.updateGlobalBadge();
      this.chatManager.showAlert(`📎 Fichier reçu de ${fileData.senderName}`, 'info');
    }

    this.renderList();

    if (isChattingWithHim) {
      this.appendFileToView(fileData);
    }
  }

  // Ouvrir une conversation spécifique
  openConversation(targetId, targetName) {
    this.target = { id: targetId, name: targetName };
    
    // Réinitialiser compteur non-lu
    const conv = this.conversations.get(targetId);
    if (conv) {
      conv.unread = 0;
      this.updateGlobalBadge();
    } else {
      // Créer conversation vide si n'existe pas
      this.conversations.set(targetId, { name: targetName, messages: [], unread: 0 });
    }

    // Construire l'interface de conversation
    this.elements.view.innerHTML = `
      <div class="private-chat-header-bar">
        <button class="back-btn" onclick="window.chatManager.privateChatManager.showList()">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="conv-avatar" style="width:32px;height:32px;font-size:12px;margin-right:10px;">
          ${this.getInitials(targetName)}
        </div>
        <div style="font-weight:bold;">${targetName}</div>
      </div>
      <div id="privateMessagesArea" class="private-messages-area"></div>
    `;

    // Afficher l'historique
    const messagesArea = document.getElementById('privateMessagesArea');
    const messages = this.conversations.get(targetId).messages;
    
    // Utiliser une méthode temporaire pour afficher les messages existants
    // Pour éviter de dupliquer la logique de rendu complexe de ChatManager, 
    // on pourrait refactoriser, mais ici on va réutiliser addMessage en changeant temporairement la cible
    
    // Astuce : On vide la zone et on re-rend
    messages.forEach(msg => {
      if (msg.type === 'file') {
        this.appendFileToView(msg);
      } else {
        this.appendMessageToView(msg);
      }
    });

    // Basculer les vues
    this.elements.list.classList.add('hidden');
    this.elements.view.classList.remove('hidden');
    
    // Ouvrir le panneau de chat s'il est fermé
    const btnChat = document.getElementById('btnChat');
    if (btnChat) btnChat.click();
    this.chatManager.switchTab('private');
    this.chatManager.elements.chatInput.focus();
  }

  showList() {
    this.target = null;
    this.elements.view.classList.add('hidden');
    this.elements.list.classList.remove('hidden');
    this.renderList();
  }

  renderList() {
    if (this.conversations.size === 0) {
      this.elements.list.innerHTML = '<div class="chat-welcome"><p>Aucune conversation privée.</p></div>';
      return;
    }

    let html = '';
    this.conversations.forEach((conv, userId) => {
      const lastMsg = conv.messages[conv.messages.length - 1];
      const preview = lastMsg ? (lastMsg.senderId === this.socket.id ? 'Vous: ' : '') + lastMsg.text : 'Nouvelle conversation';
      const badge = conv.unread > 0 ? `<span class="conv-badge">${conv.unread}</span>` : '';
      
      html += `
        <div class="conversation-item" onclick="window.chatManager.privateChatManager.openConversation('${userId}', '${conv.name}')">
          <div class="conv-avatar">${this.getInitials(conv.name)}</div>
          <div class="conv-info">
            <div class="conv-name">
              ${conv.name}
              ${badge}
            </div>
            <div class="conv-preview">${preview}</div>
          </div>
        </div>
      `;
    });
    this.elements.list.innerHTML = html;
  }

  appendMessageToView(message) {
    const container = document.getElementById('privateMessagesArea');
    if (!container) return;

    // On utilise une version simplifiée de l'affichage pour éviter les dépendances circulaires complexes
    // Idéalement, on appellerait une méthode de rendu de message générique
    // Ici, on triche un peu en réutilisant la logique CSS existante
    const isOwn = message.senderId === this.socket.id;
    const div = document.createElement('div');
    div.className = `chat-message ${isOwn ? 'own-message' : ''} private-message`;
    div.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${message.senderName}</span>
        <span class="message-time">${new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <div class="message-text">${this.chatManager.processMessageContent(message.text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  appendFileToView(fileData) {
    const container = document.getElementById('privateMessagesArea');
    if (!container) return;

    const isOwn = fileData.senderId === this.socket.id;
    const time = new Date(fileData.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const blob = new Blob([fileData.fileData], { type: fileData.fileType });
    const url = URL.createObjectURL(blob);

    const div = document.createElement('div');
    div.className = `chat-message ${isOwn ? 'own-message' : ''} private-message`;
    
    div.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${fileData.senderName}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="file-message">
        <i class="fa-solid fa-file"></i>
        <div class="file-info">
          <span class="file-name">${this.chatManager.escapeHtml(fileData.fileName)}</span>
          <span class="file-size">${(fileData.fileSize / 1024).toFixed(1)} KB</span>
        </div>
        <a href="${url}" download="${this.chatManager.escapeHtml(fileData.fileName)}" class="download-btn" title="Télécharger"><i class="fa-solid fa-download"></i></a>
      </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  updateGlobalBadge() {
    let total = 0;
    this.conversations.forEach(c => total += c.unread);
    const badge = document.getElementById('privateBadge');
    if (badge) {
      badge.textContent = total > 0 ? total : '';
      badge.style.display = total > 0 ? 'inline-block' : 'none';
    }
    
    // Afficher l'onglet privé s'il y a des messages
    const tabPrivate = document.getElementById('tabPrivate');
    if (tabPrivate && (this.conversations.size > 0 || total > 0)) {
      tabPrivate.style.display = 'inline-block';
    }
  }

  getInitials(name) {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
  }
}

// Exposer globalement
window.PrivateChatManager = PrivateChatManager;