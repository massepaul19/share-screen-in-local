// ========================================
// public/static/videoReactions.js
// Système de réactions en temps réel sur la vidéo
// ========================================

class VideoReactionManager {
  constructor(socket) {
    this.socket = socket;
    this.reactionsButton = null;
    this.reactionsPicker = null;
    this.isPickerOpen = false;
    
    // Emojis de réaction rapide
    this.reactions = [
      // Ligne 1 - Expressions positives
      '😀', '😃', '😄', '😁', '😆', '🤣', '😂', '🙂',
      // Ligne 2 - Expressions diverses
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗',
      // Ligne 3 - Expressions spéciales
      '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝',
      // Ligne 4 - Expressions avec accessoires
      '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
      // Ligne 5 - Expressions négatives/neutres
      '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥',
      // Ligne 6 - Fatigue et tristesse
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      // Ligne 7 - Choc et pleurs
      '🤢', '🤮', '🤧', '🥵', '🥶', '😵', '🤯', '😳',
      // Ligne 8 - Émotions fortes
      '🥺', '😢', '😭', '😱', '😖', '😣', '😞', '😓',
      // Ligne 9 - Animaux et créatures
      '🤡', '👺', '💩', '👻', '💀', '☠️', '👽', '👾',
      // Ligne 10 - Plus d'animaux
      '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽',
      // Ligne 11 - Gestes main
      '🙀', '😿', '😾', '🙌', '👏', '🤝', '👍', '👎',
      // Ligne 12 - Plus de gestes
      '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘',
      // Ligne 13 - Doigts et pointages
      '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️',
      // Ligne 14 - Mains ouvertes
      '✋', '🤚', '🖐', '🖖', '👋', '🤙', '💪', '🦾',
      // Ligne 15 - Autres parties
      '🖕', '✍️', '🙏', '🦶', '🦵', '👂', '🦻', '👃',
      // Ligne 16 - Corps et organes
      '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅',
      // Ligne 17 - Bouches et lèvres
      '👄', '💋', '🩸', '💘', '💝', '💖', '💗', '💓',
      // Ligne 18 - Cœurs
      '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛',
      '💚', '💙', '💜', '🤎', '🖤', '🤍'
    ];
    
    this.init();
  }

  init() {
    console.log('🎬 Initialisation du système de réactions vidéo...');
    this.createReactionsButton();
    this.createReactionsPicker();
    this.setupEventListeners();
    this.setupSocketListeners();
    console.log('✅ Système de réactions initialisé');
  }

  createReactionsButton() {
    // Créer le bouton de réactions
    this.reactionsButton = document.createElement('button');
    this.reactionsButton.className = 'reactions-btn';
    this.reactionsButton.innerHTML = `
      <span class="reactions-icon">😊</span>
      <span class="reactions-label">Réagir</span>
    `;
    this.reactionsButton.setAttribute('aria-label', 'Réagir à la vidéo');
    this.reactionsButton.setAttribute('title', 'Envoyer une réaction');
    this.reactionsButton.style.display = 'none'; // Caché par défaut
    
    // Ajouter au body
    document.body.appendChild(this.reactionsButton);
    console.log('✅ Bouton de réactions créé');
  }

  createReactionsPicker() {
    // Créer le conteneur du picker
    this.reactionsPicker = document.createElement('div');
    this.reactionsPicker.className = 'reactions-picker';
    this.reactionsPicker.style.display = 'none';
    
    // Titre
    const title = document.createElement('div');
    title.className = 'reactions-picker-title';
    title.textContent = 'Réagir à la vidéo';
    this.reactionsPicker.appendChild(title);
    
    // Conteneur des réactions
    const container = document.createElement('div');
    container.className = 'reactions-container';
    
    this.reactions.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'reaction-item';
      btn.textContent = emoji;
      btn.setAttribute('data-emoji', emoji);
      btn.setAttribute('title', `Envoyer ${emoji}`);
      btn.addEventListener('click', () => this.sendReaction(emoji));
      container.appendChild(btn);
    });
    
    this.reactionsPicker.appendChild(container);
    document.body.appendChild(this.reactionsPicker);
    console.log('✅ Picker de réactions créé');
  }

  setupEventListeners() {
    // Toggle du picker
    this.reactionsButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePicker();
    });
    
    // Fermer le picker si on clique ailleurs
    document.addEventListener('click', (e) => {
      if (this.isPickerOpen && 
          !this.reactionsPicker.contains(e.target) && 
          e.target !== this.reactionsButton &&
          !this.reactionsButton.contains(e.target)) {
        this.closePicker();
      }
    });
    
    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isPickerOpen) {
        this.closePicker();
      }
    });
  }

  setupSocketListeners() {
    // Recevoir les réactions des autres utilisateurs
    this.socket.on('video-reaction', (data) => {
      console.log('📥 Réaction reçue:', data);
      this.displayReaction(data.emoji, data.userName);
    });
  }

  togglePicker() {
    if (this.isPickerOpen) {
      this.closePicker();
    } else {
      this.openPicker();
    }
  }

  openPicker() {
    this.reactionsPicker.style.display = 'block';
    this.isPickerOpen = true;
    this.reactionsButton.classList.add('active');
    
    // Animation d'ouverture
    requestAnimationFrame(() => {
      this.reactionsPicker.classList.add('open');
    });
    
    console.log('📖 Picker de réactions ouvert');
  }

  closePicker() {
    this.reactionsPicker.classList.remove('open');
    this.isPickerOpen = false;
    this.reactionsButton.classList.remove('active');
    
    // Attendre la fin de l'animation avant de cacher
    setTimeout(() => {
      if (!this.isPickerOpen) {
        this.reactionsPicker.style.display = 'none';
      }
    }, 200);
    
    console.log('📕 Picker de réactions fermé');
  }

  sendReaction(emoji) {
    const userName = document.getElementById('nameInput')?.value || 'Anonyme';
    
    console.log('📤 Envoi de la réaction:', emoji);
    
    // Envoyer via socket
    this.socket.emit('video-reaction', {
      emoji: emoji,
      userName: userName
    });
    
    // Afficher localement
    this.displayReaction(emoji, userName);
    
    // Fermer le picker
    this.closePicker();
  }

  displayReaction(emoji, userName) {
    const videoContainer = document.getElementById('videoContainer');
    if (!videoContainer) return;
    
    // Créer l'élément de réaction
    const reaction = document.createElement('div');
    reaction.className = 'video-reaction-float';
    
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'reaction-emoji';
    emojiSpan.textContent = emoji;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'reaction-name';
    nameSpan.textContent = userName;
    
    reaction.appendChild(emojiSpan);
    reaction.appendChild(nameSpan);
    
    // Position aléatoire horizontale
    const randomX = Math.random() * 80 + 10; // Entre 10% et 90%
    reaction.style.left = `${randomX}%`;
    
    // Ajouter au conteneur vidéo
    videoContainer.appendChild(reaction);
    
    // Animation
    requestAnimationFrame(() => {
      reaction.classList.add('animate');
    });
    
    // Supprimer après l'animation
    setTimeout(() => {
      reaction.remove();
    }, 3000);
    
    console.log('✨ Réaction affichée:', emoji, 'de', userName);
  }

  show() {
    this.reactionsButton.style.display = 'flex';
    this.reactionsButton.classList.add('visible');
  }

  hide() {
    this.reactionsButton.style.display = 'none';
    this.reactionsButton.classList.remove('visible');
    this.closePicker();
  }
}

// Initialisation globale
window.videoReactionManager = null;

// Fonction d'initialisation
function initVideoReactions(socket) {
  if (socket) {
    console.log('🎯 Initialisation du gestionnaire de réactions vidéo...');
    window.videoReactionManager = new VideoReactionManager(socket);
    return true;
  } else {
    console.warn('⚠️ Socket non disponible pour les réactions');
    return false;
  }
}

// Exposer globalement
window.initVideoReactions = initVideoReactions;
window.VideoReactionManager = VideoReactionManager;
