// ========================================
// public/static/js/p2p-users.js
// ========================================

class P2PUsersManager {
  constructor(socket) {
    this.socket = socket;
    this.users = [];
    this.currentUserId = null;
    
    this.setupSocketListeners();
    
    console.log('✅ P2PUsersManager initialisé');
  }
  
  setupSocketListeners() {
    this.socket.on('users-update', (users) => {
      console.log('👥 Liste utilisateurs reçue:', users);
      this.users = users;
      this.currentUserId = this.socket.id;
      this.displayUsers();
    });
    
    this.socket.on('connect', () => {
      this.currentUserId = this.socket.id;
      console.log('✅ Socket connecté, ID:', this.currentUserId);
    });
  }
  
  displayUsers() {
    const listContainer = document.getElementById('p2pUserList');
    const placeholder = document.getElementById('p2pPlaceholder');
    const container = document.getElementById('p2pUserListContainer');
    
    if (!listContainer || !placeholder || !container) {
      console.warn('⚠️ Éléments DOM P2P non trouvés');
      return;
    }
    
    const otherUsers = this.users.filter(user => user.id !== this.currentUserId);
    
    console.log(`📋 Affichage de ${otherUsers.length} utilisateur(s)`);
    
    if (otherUsers.length === 0) {
      container.style.display = 'none';
      placeholder.style.display = 'block';
      return;
    }
    
    container.style.display = 'block';
    placeholder.style.display = 'none';
    
    listContainer.innerHTML = otherUsers.map(user => {
      const displayName = user.name || `User-${user.id.slice(0, 8)}`;
      const shortId = user.id.slice(0, 8);
      
      return `
        <div class="p2p-user-item" data-user-id="${user.id}">
          <div class="user-info">
            <span class="user-avatar">👤</span>
            <div class="user-details">
              <span class="user-name">${displayName}</span>
              <span class="user-id">${shortId}...</span>
            </div>
          </div>
          <div class="user-actions">
            <button 
              class="btn-call-video" 
              onclick="window.callP2PUser('${user.id}', '${displayName}', 'video')"
              title="Appel vidéo"
            >
              📹
            </button>
            <button 
              class="btn-call-audio" 
              onclick="window.callP2PUser('${user.id}', '${displayName}', 'audio')"
              title="Appel audio"
            >
              🎤
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  refresh() {
    console.log('🔄 Rafraîchissement de la liste P2P');
    this.displayUsers();
  }
}

window.P2PUsersManager = P2PUsersManager;
