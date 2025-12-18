// ========================================
// public/static/videocallUI.js
// Interface utilisateur - Appel vidéo
// ========================================

class VideoCallUI {
  constructor(videoCallManager) {
    this.manager = videoCallManager;
    this.container = null;
    this.gridContainer = null;
    this.controlsContainer = null;
    this.videoElements = new Map();
    this.init();
  }

  init() {
    this.createContainer();
    this.createGrid();
    this.createControls();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'videocall-container';
    this.container.className = 'videocall-container';
    document.body.appendChild(this.container);
  }

  createGrid() {
    this.gridContainer = document.createElement('div');
    this.gridContainer.id = 'videocall-grid';
    this.gridContainer.className = 'videocall-grid';
    this.container.appendChild(this.gridContainer);
  }

  createControls() {
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.className = 'videocall-controls';
    
    const toggleVideoBtn = document.createElement('button');
    toggleVideoBtn.id = 'toggle-video-btn';
    toggleVideoBtn.className = 'control-btn video-on';
    toggleVideoBtn.innerHTML = '📹';
    toggleVideoBtn.title = 'Caméra on/off';
    toggleVideoBtn.onclick = () => this.toggleVideo();
    
    const toggleAudioBtn = document.createElement('button');
    toggleAudioBtn.id = 'toggle-audio-btn';
    toggleAudioBtn.className = 'control-btn audio-on';
    toggleAudioBtn.innerHTML = '🎤';
    toggleAudioBtn.title = 'Micro on/off';
    toggleAudioBtn.onclick = () => this.toggleAudio();
    
    const leaveBtn = document.createElement('button');
    leaveBtn.id = 'leave-video-btn';
    leaveBtn.className = 'control-btn leave-btn';
    leaveBtn.innerHTML = '📞';
    leaveBtn.title = 'Quitter';
    leaveBtn.onclick = () => this.leave();
    
    this.controlsContainer.appendChild(toggleVideoBtn);
    this.controlsContainer.appendChild(toggleAudioBtn);
    this.controlsContainer.appendChild(leaveBtn);
    
    this.container.appendChild(this.controlsContainer);
  }

  addLocalVideo(stream, name) {
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper local';
    videoWrapper.id = 'local-video-wrapper';
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.textContent = name + ' (Moi)';
    
    videoWrapper.appendChild(video);
    videoWrapper.appendChild(nameTag);
    
    this.gridContainer.insertBefore(videoWrapper, this.gridContainer.firstChild);
    this.videoElements.set('local', { wrapper: videoWrapper, video });
    
    this.updateGridLayout();
  }

  addRemoteMedia(consumer, socketId, name, kind) {
    let videoData = this.videoElements.get(socketId);
    
    if (!videoData) {
      const videoWrapper = document.createElement('div');
      videoWrapper.className = 'video-wrapper remote';
      videoWrapper.id = `video-wrapper-${socketId}`;
      
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      
      const nameTag = document.createElement('div');
      nameTag.className = 'name-tag';
      nameTag.textContent = name;
      
      videoWrapper.appendChild(video);
      videoWrapper.appendChild(nameTag);
      
      this.gridContainer.appendChild(videoWrapper);
      
      videoData = { 
        wrapper: videoWrapper, 
        video,
        videoTrack: null,
        audioTrack: null
      };
      this.videoElements.set(socketId, videoData);
    }
    
    if (kind === 'video') {
      videoData.videoTrack = consumer.track;
    } else if (kind === 'audio') {
      videoData.audioTrack = consumer.track;
    }
    
    const tracks = [];
    if (videoData.videoTrack) tracks.push(videoData.videoTrack);
    if (videoData.audioTrack) tracks.push(videoData.audioTrack);
    
    if (tracks.length > 0) {
      videoData.video.srcObject = new MediaStream(tracks);
    }
    
    this.updateGridLayout();
  }

  removeParticipant(socketId) {
    const videoData = this.videoElements.get(socketId);
    if (videoData) {
      videoData.wrapper.remove();
      this.videoElements.delete(socketId);
      this.updateGridLayout();
    }
  }

  updateGridLayout() {
    const count = this.videoElements.size;
    const grid = this.gridContainer;
    
    grid.classList.remove('grid-1', 'grid-2', 'grid-3', 'grid-4', 'grid-many');
    
    if (count === 1) {
      grid.classList.add('grid-1');
    } else if (count === 2) {
      grid.classList.add('grid-2');
    } else if (count <= 4) {
      grid.classList.add('grid-4');
    } else {
      grid.classList.add('grid-many');
    }
  }

  async toggleVideo() {
    const isEnabled = await this.manager.toggleVideo();
    const btn = document.getElementById('toggle-video-btn');
    
    if (isEnabled) {
      btn.classList.remove('video-off');
      btn.classList.add('video-on');
      btn.innerHTML = '📹';
    } else {
      btn.classList.remove('video-on');
      btn.classList.add('video-off');
      btn.innerHTML = '📹❌';
    }
  }

  async toggleAudio() {
    const isEnabled = await this.manager.toggleAudio();
    const btn = document.getElementById('toggle-audio-btn');
    
    if (isEnabled) {
      btn.classList.remove('audio-off');
      btn.classList.add('audio-on');
      btn.innerHTML = '🎤';
    } else {
      btn.classList.remove('audio-on');
      btn.classList.add('audio-off');
      btn.innerHTML = '🎤❌';
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

window.VideoCallUI = VideoCallUI;

// ========================================
// 📚 COURS : COMPRENDRE L'UI VIDÉO
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│              🎨 STRUCTURE HTML GÉNÉRÉE                          │
└─────────────────────────────────────────────────────────────────┘

<div class="videocall-container">
  <div class="videocall-grid grid-4">
    
    <!-- Vidéo locale (moi) -->
    <div class="video-wrapper local">
      <video autoplay muted></video>
      <div class="name-tag">Paul (Moi)</div>
    </div>
    
    <!-- Vidéo distante 1 -->
    <div class="video-wrapper remote">
      <video autoplay></video>
      <div class="name-tag">Alice</div>
    </div>
    
    <!-- Vidéo distante 2 -->
    <div class="video-wrapper remote">
      <video autoplay></video>
      <div class="name-tag">Bob</div>
    </div>
    
  </div>
  
  <div class="videocall-controls">
    <button class="control-btn video-on">📹</button>
    <button class="control-btn audio-on">🎤</button>
    <button class="control-btn leave-btn">📞</button>
  </div>
</div>

┌─────────────────────────────────────────────────────────────────┐
│              📐 LAYOUT ADAPTATIF (GRID)                         │
└─────────────────────────────────────────────────────────────────┘

La grille s'adapte automatiquement au nombre de participants :

grid-1 : 1 participant  → 1 colonne (plein écran)
grid-2 : 2 participants → 2 colonnes
grid-4 : 3-4 participants → 2x2
grid-many : 5+ participants → 3x3 ou plus

💡 Implémenté avec CSS Grid :
.grid-1 { grid-template-columns: 1fr; }
.grid-2 { grid-template-columns: 1fr 1fr; }
.grid-4 { grid-template-columns: 1fr 1fr; }
.grid-many { grid-template-columns: repeat(3, 1fr); }

┌─────────────────────────────────────────────────────────────────┐
│              🎥 GESTION DES VIDÉOS                              │
└─────────────────────────────────────────────────────────────────┘

this.videoElements = new Map()
→ Map<socketId, VideoData>

Structure VideoData :
{
  wrapper: HTMLDivElement,      // Conteneur
  video: HTMLVideoElement,      // Élément <video>
  videoTrack: MediaStreamTrack, // Track vidéo
  audioTrack: MediaStreamTrack  // Track audio
}

💡 Pourquoi séparer videoTrack et audioTrack ?
Les consumers arrivent séparément (2 événements)
Il faut les combiner dans un seul MediaStream

┌─────────────────────────────────────────────────────────────────┐
│              🔄 FLUX D'AJOUT D'UN PARTICIPANT                   │
└─────────────────────────────────────────────────────────────────┘

1. Première fois (consumer vidéo arrive) :
   - Créer video-wrapper
   - Créer <video>
   - Stocker videoTrack
   - Attendre audioTrack

2. Deuxième fois (consumer audio arrive) :
   - Récupérer video-wrapper existant
   - Stocker audioTrack
   - Créer MediaStream avec les 2 tracks
   - Assigner au <video>

3. Résultat :
   - 1 élément <video> par participant
   - Contient vidéo + audio

┌─────────────────────────────────────────────────────────────────┐
│              🎛️ CONTRÔLES                                       │
└─────────────────────────────────────────────────────────────────┘

3 boutons :

📹 Toggle Vidéo
- Classe: video-on / video-off
- Appelle manager.toggleVideo()
- Change l'icône

🎤 Toggle Audio
- Classe: audio-on / audio-off
- Appelle manager.toggleAudio()
- Change l'icône

📞 Quitter
- Classe: leave-btn
- Appelle manager.leave()
- Supprime le container

┌─────────────────────────────────────────────────────────────────┐
│              💡 BONNES PRATIQUES                                │
└─────────────────────────────────────────────────────────────────┘

1. Vidéo locale toujours en premier
   insertBefore(videoWrapper, grid.firstChild)

2. Vidéo locale toujours muted
   video.muted = true (évite écho)

3. playsInline pour mobile
   video.playsInline = true (iOS)

4. Mise à jour layout automatique
   Appelé après chaque add/remove

┌─────────────────────────────────────────────────────────────────┐
│              ❓ FAQ                                             │
└─────────────────────────────────────────────────────────────────┘

Q: Pourquoi muted sur vidéo locale ?
R: Évite l'écho (feedback audio)
   On ne veut pas entendre notre propre micro

Q: Pourquoi playsInline ?
R: Sur iOS, sans ça la vidéo ouvre en plein écran
   playsInline garde la vidéo dans la page

Q: Comment changer le layout ?
R: Modifier les classes CSS grid-1, grid-2, etc.
   dans videocall.css

Q: Peut-on afficher en mode galerie (thumbnails) ?
R: Oui, ajouter une classe 'gallery' et changer le CSS
*/