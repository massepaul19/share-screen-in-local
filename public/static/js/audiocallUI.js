// ========================================
// public/static/audiocallUI.js
// Interface utilisateur - Appel audio
// ========================================

class AudioCallUI {
  constructor(audioCallManager) {
    this.manager = audioCallManager;
    this.container = null;
    this.listContainer = null;
    this.controlsContainer = null;
    this.participants = new Map();
    this.init();
  }

  init() {
    this.createContainer();
    this.createHeader();
    this.createList();
    this.createControls();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'audiocall-container';
    this.container.className = 'audiocall-container';
    document.body.appendChild(this.container);
  }

  createHeader() {
    const header = document.createElement('div');
    header.className = 'audiocall-header';
    header.innerHTML = `
      <h3>🎤 Conférence Audio</h3>
      <span id="participant-count">1 participant</span>
    `;
    this.container.appendChild(header);
  }

  createList() {
    this.listContainer = document.createElement('div');
    this.listContainer.id = 'audiocall-list';
    this.listContainer.className = 'audiocall-list';
    this.container.appendChild(this.listContainer);
    
    this.addMyself();
  }

  addMyself() {
    const item = document.createElement('div');
    item.className = 'audio-participant me';
    item.id = 'audio-me';
    item.innerHTML = `
      <div class="participant-avatar">
        <span class="avatar-icon">👤</span>
      </div>
      <div class="participant-info">
        <div class="participant-name">${this.manager.myName} (Moi)</div>
        <div class="participant-status">🔊 En ligne</div>
      </div>
      <div class="participant-indicator">
        <div class="audio-bars">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
      </div>
    `;
    this.listContainer.appendChild(item);
    this.updateParticipantCount();
  }

  createControls() {
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.className = 'audiocall-controls';
    
    const toggleAudioBtn = document.createElement('button');
    toggleAudioBtn.id = 'toggle-audio-btn';
    toggleAudioBtn.className = 'audio-control-btn unmuted';
    toggleAudioBtn.innerHTML = '🎤 Micro activé';
    toggleAudioBtn.onclick = () => this.toggleAudio();
    
    const leaveBtn = document.createElement('button');
    leaveBtn.id = 'leave-audio-btn';
    leaveBtn.className = 'audio-control-btn leave';
    leaveBtn.innerHTML = '📞 Quitter';
    leaveBtn.onclick = () => this.leave();
    
    this.controlsContainer.appendChild(toggleAudioBtn);
    this.controlsContainer.appendChild(leaveBtn);
    
    this.container.appendChild(this.controlsContainer);
  }

  addParticipant(socketId, name, isMuted) {
    if (this.participants.has(socketId)) {
      return;
    }
    
    const item = document.createElement('div');
    item.className = 'audio-participant' + (isMuted ? ' muted' : '');
    item.id = `audio-participant-${socketId}`;
    item.innerHTML = `
      <div class="participant-avatar">
        <span class="avatar-icon">👤</span>
      </div>
      <div class="participant-info">
        <div class="participant-name">${name}</div>
        <div class="participant-status">${isMuted ? '🔇 Muet' : '🔊 En ligne'}</div>
      </div>
      <div class="participant-indicator">
        ${isMuted ? '<span class="mute-icon">🔇</span>' : `
          <div class="audio-bars">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </div>
        `}
      </div>
    `;
    
    this.listContainer.appendChild(item);
    this.participants.set(socketId, { element: item, name, isMuted });
    this.updateParticipantCount();
  }

  removeParticipant(socketId) {
    const participant = this.participants.get(socketId);
    if (participant) {
      participant.element.remove();
      this.participants.delete(socketId);
      this.updateParticipantCount();
    }
  }

  updateParticipantMute(socketId, isMuted) {
    const participant = this.participants.get(socketId);
    if (participant) {
      participant.isMuted = isMuted;
      const statusEl = participant.element.querySelector('.participant-status');
      const indicatorEl = participant.element.querySelector('.participant-indicator');
      
      if (isMuted) {
        participant.element.classList.add('muted');
        statusEl.textContent = '🔇 Muet';
        indicatorEl.innerHTML = '<span class="mute-icon">🔇</span>';
      } else {
        participant.element.classList.remove('muted');
        statusEl.textContent = '🔊 En ligne';
        indicatorEl.innerHTML = `
          <div class="audio-bars">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </div>
        `;
      }
    }
  }

  updateMyStatus(isUnmuted) {
    const myElement = document.getElementById('audio-me');
    const statusEl = myElement.querySelector('.participant-status');
    const indicatorEl = myElement.querySelector('.participant-indicator');
    
    if (isUnmuted) {
      myElement.classList.remove('muted');
      statusEl.textContent = '🔊 En ligne';
      indicatorEl.innerHTML = `
        <div class="audio-bars">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
      `;
    } else {
      myElement.classList.add('muted');
      statusEl.textContent = '🔇 Muet';
      indicatorEl.innerHTML = '<span class="mute-icon">🔇</span>';
    }
  }

  updateParticipantCount() {
    const count = this.participants.size + 1;
    const countEl = document.getElementById('participant-count');
    if (countEl) {
      countEl.textContent = `${count} participant${count > 1 ? 's' : ''}`;
    }
  }

  async toggleAudio() {
    const isEnabled = await this.manager.toggleAudio();
    const btn = document.getElementById('toggle-audio-btn');
    
    if (isEnabled) {
      btn.classList.remove('muted');
      btn.classList.add('unmuted');
      btn.innerHTML = '🎤 Micro activé';
    } else {
      btn.classList.remove('unmuted');
      btn.classList.add('muted');
      btn.innerHTML = '🔇 Micro coupé';
    }
  }

  async leave() {
    await this.manager.leave();
    this.container.remove();
  }

  show() {
    this.container.style.display = 'flex';
  }

  hide() {
    this.container.style.display = 'none';
  }
}

window.AudioCallUI = AudioCallUI;

// ========================================
// 📚 COURS : COMPRENDRE L'UI AUDIO
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│              🎨 STRUCTURE HTML GÉNÉRÉE                          │
└─────────────────────────────────────────────────────────────────┘

<div class="audiocall-container">
  
  <div class="audiocall-header">
    <h3>🎤 Conférence Audio</h3>
    <span id="participant-count">3 participants</span>
  </div>
  
  <div class="audiocall-list">
    
    <!-- Moi -->
    <div class="audio-participant me">
      <div class="participant-avatar">
        <span class="avatar-icon">👤</span>
      </div>
      <div class="participant-info">
        <div class="participant-name">Paul (Moi)</div>
        <div class="participant-status">🔊 En ligne</div>
      </div>
      <div class="participant-indicator">
        <div class="audio-bars">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
      </div>
    </div>
    
    <!-- Autre participant -->
    <div class="audio-participant">
      <div class="participant-avatar">
        <span class="avatar-icon">👤</span>
      </div>
      <div class="participant-info">
        <div class="participant-name">Alice</div>
        <div class="participant-status">🔊 En ligne</div>
      </div>
      <div class="participant-indicator">
        <div class="audio-bars">...</div>
      </div>
    </div>
    
    <!-- Participant muted -->
    <div class="audio-participant muted">
      <div class="participant-avatar">
        <span class="avatar-icon">👤</span>
      </div>
      <div class="participant-info">
        <div class="participant-name">Bob</div>
        <div class="participant-status">🔇 Muet</div>
      </div>
      <div class="participant-indicator">
        <span class="mute-icon">🔇</span>
      </div>
    </div>
    
  </div>
  
  <div class="audiocall-controls">
    <button class="audio-control-btn unmuted">🎤 Micro activé</button>
    <button class="audio-control-btn leave">📞 Quitter</button>
  </div>
  
</div>

┌─────────────────────────────────────────────────────────────────┐
│              🎨 DESIGN STYLE DISCORD/TEAMS                      │
└─────────────────────────────────────────────────────────────────┘

Interface inspirée de Discord :
- Liste verticale des participants
- Avatar + nom + statut
- Indicateur audio (barres animées)
- Icône mute quand quelqu'un est muté
- Compteur de participants en haut

Couleurs typiques :
- Background : #2f3136 (gris foncé)
- Participants : #36393f (gris moyen)
- Accent : #5865f2 (bleu Discord)
- Muted : #ed4245 (rouge)

┌─────────────────────────────────────────────────────────────────┐
│              🔊 INDICATEURS AUDIO                               │
└─────────────────────────────────────────────────────────────────┘

BARRES AUDIO (quand actif) :
<div class="audio-bars">
  <span class="bar"></span>
  <span class="bar"></span>
  <span class="bar"></span>
</div>

💡 Animation CSS :
Les barres montent/descendent pour simuler le son
@keyframes bounce {
  0%, 100% { height: 20%; }
  50% { height: 100%; }
}

ICÔNE MUTE (quand coupé) :
<span class="mute-icon">🔇</span>

💡 Changement dynamique selon état

┌─────────────────────────────────────────────────────────────────┐
│              🔄 GESTION DES ÉTATS                               │
└─────────────────────────────────────────────────────────────────┘

updateParticipantMute(socketId, isMuted)
→ Change statut d'un participant
→ Remplace les barres par l'icône mute
→ Change la couleur du participant

updateMyStatus(isUnmuted)
→ Met à jour MON statut
→ Synchronisé avec le bouton

updateParticipantCount()
→ Met à jour "X participants"
→ Appelé après add/remove

┌─────────────────────────────────────────────────────────────────┐
│              🎯 DIFFÉRENCES AVEC VIDEOCALLUI                    │
└─────────────────────────────────────────────────────────────────┘

VideoCallUI :
- Grille de vidéos (CSS Grid)
- Éléments <video>
- Layout adaptatif (1, 2, 4, many)
- 2 boutons (vidéo + audio)

AudioCallUI :
- Liste verticale (flexbox)
- Pas d'éléments <video>
- Layout fixe (liste scrollable)
- 1 bouton (audio seulement)
- Indicateurs visuels (barres, mute)
- Plus simple, plus léger

┌─────────────────────────────────────────────────────────────────┐
│              💡 AMÉLIORATIONS POSSIBLES                         │
└─────────────────────────────────────────────────────────────────┘

1. Voice Activity Detection (VAD)
   - Détecter qui parle en temps réel
   - Highlighter le participant qui parle
   - Utiliser Web Audio API

2. Volume bars en temps réel
   - Analyser le volume audio
   - Animer les barres selon le volume réel
   - Plus immersif

3. Avatar personnalisés
   - Upload image de profil
   - Afficher initiales du nom
   - Couleur aléatoire par participant

4. Statistiques
   - Qualité audio (bitrate, perte paquets)
   - Latence
   - Afficher à côté du nom

┌─────────────────────────────────────────────────────────────────┐
│              ❓ FAQ                                             │
└─────────────────────────────────────────────────────────────────┘

Q: Pourquoi une liste et pas une grille ?
R: En audio, on ne voit pas les gens.
   Une liste verticale est plus appropriée.
   Style Discord/Slack.

Q: Comment animer les barres audio ?
R: CSS animation sur les .bar spans
   Chaque barre a un délai différent

Q: Peut-on afficher le volume en temps réel ?
R: Oui, avec Web Audio API :
   analyser.getByteFrequencyData()
   → Ajuster hauteur des barres

Q: Comment implémenter "qui parle" ?
R: Détecter volume audio > seuil
   → Ajouter classe 'speaking' au participant
   → Border glow en CSS
*/