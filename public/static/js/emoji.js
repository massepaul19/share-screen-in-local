// ========================================
// public/static/emoji.js
// Gestionnaire d'émojis pour le chat
// ========================================

class EmojiManager {
  constructor(chatInput, sendButton) {
    this.chatInput = chatInput;
    this.sendButton = sendButton;
    this.emojiButton = null;
    this.emojiPicker = null;
    this.isPickerOpen = false;
    
    // Liste des émojis populaires par catégorie
    this.emojis = {
      smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴'],
      gestures: ['👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐', '✋', '🖖', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶'],
      hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
      activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '🧘', '🎮', '🕹️', '🎰', '🎲', '🧩', '🧸', '♠️', '♥️', '♦️', '♣️', '♟️', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧵', '🧶'],
      food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕', '🫖', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊', '🥄', '🍴', '🍽️', '🥣', '🥡', '🥢', '🧂'],
      travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🦽', '🦼', '🛺', '🚲', '🛴', '🛹', '🛼', '🚏', '🛣️', '🛤️', '🛢️', '⛽', '🚨', '🚥', '🚦', '🛑', '🚧', '⚓', '⛵', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸', '🛎️', '🧳', '⌛', '⏳', '⌚', '⏰', '⏱️', '⏲️', '🕰️', '🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡', '🕖', '🕢', '🕗', '🕣', '🕘', '🕤', '🕙', '🕥', '🕚', '🕦', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌙', '🌚', '🌛', '🌜', '🌡️', '☀️', '🌝', '🌞', '🪐', '⭐', '🌟', '🌠', '🌌', '☁️', '⛅', '⛈️', '🌤️', '🌥️', '🌦️', '🌧️', '🌨️', '🌩️', '🌪️', '🌫️', '🌬️', '🌀', '🌈', '🌂', '☂️', '☔', '⛱️', '⚡', '❄️', '☃️', '⛄', '☄️', '🔥', '💧', '🌊'],
      objects: ['💻', '⌨️', '🖥️', '🖨️', '🖱️', '💾', '💿', '📀', '📱', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏰', '⏲️', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🧱', '🪨', '🪵', '🛖', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃', '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '♨️', '🎠', '🎡', '🎢', '💈', '🎪', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🛻', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🦽', '🦼', '🛺', '🚲', '🛴', '🛹', '🛼', '🚏', '🛣️', '🛤️', '🛢️', '⛽', '🚨', '🚥', '🚦', '🛑', '🚧', '⚓', '⛵', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸', '🛎️', '🧳'],
      symbols: ['✅', '❌', '⭐', '🌟', '✨', '⚡', '🔥', '💯', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳']
    };
    
    this.init();
  }

  init() {
    console.log('🎨 Initialisation du gestionnaire d\'émojis...');
    this.createEmojiButton();
    this.createEmojiPicker();
    this.setupEventListeners();
    console.log('✅ Gestionnaire d\'émojis initialisé avec succès');
  }

  createEmojiButton() {
    // Créer le bouton emoji
    this.emojiButton = document.createElement('button');
    this.emojiButton.className = 'emoji-btn';
    this.emojiButton.innerHTML = '😊';
    this.emojiButton.setAttribute('aria-label', 'Ajouter un emoji');
    this.emojiButton.setAttribute('type', 'button');
    this.emojiButton.setAttribute('title', 'Ajouter un emoji');
    
    // Insérer le bouton à côté du bouton de fichier (après)
    const attachBtn = this.chatInput.closest('.chat-input-container').querySelector('.attach-btn');
    if (attachBtn && attachBtn.nextSibling) {
        attachBtn.parentNode.insertBefore(this.emojiButton, attachBtn.nextSibling);
    } else {
        // Fallback: insérer avant le bouton d'envoi
        this.sendButton.parentNode.insertBefore(this.emojiButton, this.sendButton);
    }
    console.log('✅ Bouton emoji créé et inséré');
  }

  createEmojiPicker() {
    // Créer le conteneur du picker
    this.emojiPicker = document.createElement('div');
    this.emojiPicker.className = 'emoji-picker';
    this.emojiPicker.style.display = 'none';
    
    // Créer l'en-tête avec les catégories
    const header = document.createElement('div');
    header.className = 'emoji-picker-header';
    
    const categories = [
      { name: 'smileys', icon: '😊', label: 'Smileys' },
      { name: 'gestures', icon: '👍', label: 'Gestes' },
      { name: 'hearts', icon: '❤️', label: 'Cœurs' },
      { name: 'activities', icon: '⚽', label: 'Activités' },
      { name: 'food', icon: '🍔', label: 'Nourriture' },
      { name: 'travel', icon: '🚗', label: 'Voyage' },
      { name: 'objects', icon: '💻', label: 'Objets' },
      { name: 'symbols', icon: '⭐', label: 'Symboles' }
    ];
    
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'emoji-category-btn';
      btn.innerHTML = cat.icon;
      btn.title = cat.label;
      btn.dataset.category = cat.name;
      btn.type = 'button';
      header.appendChild(btn);
    });
    
    // Créer le conteneur des émojis
    const content = document.createElement('div');
    content.className = 'emoji-picker-content';
    content.id = 'emojiPickerContent';
    
    // Ajouter tous les composants
    this.emojiPicker.appendChild(header);
    this.emojiPicker.appendChild(content);
    
    // Insérer le picker dans le conteneur du chat (avant la zone d'input)
    const chatInputContainer = this.chatInput.closest('.chat-input-container');
    chatInputContainer.insertBefore(this.emojiPicker, chatInputContainer.firstChild);
    
    // Afficher la première catégorie par défaut
    this.showCategory('smileys');
    console.log('✅ Picker d\'émojis créé');
  }

  showCategory(categoryName) {
    const content = document.getElementById('emojiPickerContent');
    if (!content) return;
    
    content.innerHTML = '';
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.emoji-category-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.category === categoryName) {
        btn.classList.add('active');
      }
    });
    
    // Afficher les émojis de la catégorie
    const emojis = this.emojis[categoryName];
    if (!emojis) return;
    
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-item';
      btn.textContent = emoji;
      btn.type = 'button';
      btn.setAttribute('title', emoji);
      btn.addEventListener('click', () => this.insertEmoji(emoji));
      content.appendChild(btn);
    });
  }

  setupEventListeners() {
    // Toggle du picker
    this.emojiButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePicker();
    });
    
    // Changement de catégorie
    document.querySelectorAll('.emoji-category-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const category = btn.dataset.category;
        if (category) {
          this.showCategory(category);
        }
      });
    });
    
    // Fermer le picker si on clique sur un emoji (optionnel, selon préférence)
    // this.emojiPicker.addEventListener('click', (e) => {
    //   if (e.target.classList.contains('emoji-item')) {
    //      // this.closePicker(); // Décommenter pour fermer après sélection
    //   }
    // });
    
    // Fermer le picker si on clique ailleurs
    document.addEventListener('click', (e) => {
      if (this.isPickerOpen && 
          !this.emojiPicker.contains(e.target) && 
          e.target !== this.emojiButton) {
        this.closePicker();
      }
    });
    
    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isPickerOpen) {
        this.closePicker();
        this.chatInput.focus();
      }
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
    this.emojiPicker.style.display = 'block';
    this.isPickerOpen = true;
    this.emojiButton.classList.add('active');
    
    // Animation d'ouverture
    requestAnimationFrame(() => {
      this.emojiPicker.classList.add('open');
    });
    
    console.log('📖 Picker ouvert');
  }

  closePicker() {
    this.emojiPicker.classList.remove('open');
    this.isPickerOpen = false;
    this.emojiButton.classList.remove('active');
    
    // Attendre la fin de l'animation avant de cacher
    setTimeout(() => {
      if (!this.isPickerOpen) {
        this.emojiPicker.style.display = 'none';
      }
    }, 300);
    
    console.log('📕 Picker fermé');
  }

  insertEmoji(emoji) {
    // Insérer l'emoji à la position du curseur
    const input = this.chatInput;
    const startPos = input.selectionStart || 0;
    const endPos = input.selectionEnd || 0;
    const textBefore = input.value.substring(0, startPos);
    const textAfter = input.value.substring(endPos);
    
    input.value = textBefore + emoji + textAfter;
    
    // Repositionner le curseur après l'emoji
    const newPos = startPos + emoji.length;
    input.setSelectionRange(newPos, newPos);
    
    // Focus sur l'input
    input.focus();
    
    // Déclencher l'événement input pour mettre à jour la hauteur si nécessaire
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('✅ Emoji inséré:', emoji);
    
    // Ne pas fermer le picker pour permettre d'ajouter plusieurs émojis
    // this.closePicker();
  }
}

// ========================================
// INITIALISATION GLOBALE
// ========================================
// Exposer la classe globalement pour usage externe si nécessaire
window.EmojiManager = EmojiManager;
