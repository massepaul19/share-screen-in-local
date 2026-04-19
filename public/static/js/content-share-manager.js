// ============================================================
// content-share-manager.js — Gestionnaire de partage de contenu
// Auteur : MASSE MASSE PAUL-BASTHYLLE
//
// CORRECTIONS :
//   - Classe unifiée (les méthodes _buildModal, _handleFile, etc.
//     étaient orphelines HORS du corps de la classe)
//   - Constructeur prend `socket` en paramètre (cohérent avec app.js)
//   - Ajout des méthodes manquantes : setHost(), stopContent()
//   - Suppression de l'instanciation automatique (app.js s'en charge)
//   - activeContent unifié (était mélangé avec currentContent)
// ============================================================

class ContentShareManager {
  constructor(socket) {
    this.socket      = socket;
    this.activeContent = null;
    this.isSharing   = false;
    this.isHost      = false;
    this.player      = null;
    this.pdfDoc      = null;
    this.pdfPage     = 1;
    this.syncLock    = false;

    this._injectStyles();
    this._bindSocketEvents();

    // Lier le bouton après le DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._bindButton());
    } else {
      this._bindButton();
    }

    console.log('🎬 ContentShareManager: Initialisé');
  }

  // ─────────────────────────────────────────────────
  //  API PUBLIQUE
  // ─────────────────────────────────────────────────

  /** Appelé par app.js quand le rôle hôte change */
  setHost(isHost) {
    this.isHost = isHost;
  }

  /**
   * Arrêter le partage de contenu.
   * @param {boolean} broadcast - true = émettre content-stop aux participants
   */
  stopContent(broadcast = true) {
    this._clearPlayer();
    this.activeContent = null;
    this.isSharing     = false;

    if (broadcast && this.socket) {
      this.socket.emit('content-stop');
    }

    const btn = document.getElementById('btnContentShare');
    if (btn) {
      btn.classList.remove('active');
      btn.title = 'Partager un contenu';
    }

    if (window.showAlert) window.showAlert('Partage de contenu arrêté', 'info');
  }

  // ─────────────────────────────────────────────────
  //  LIAISON DU BOUTON
  // ─────────────────────────────────────────────────

  _bindButton() {
    const btn = document.getElementById('btnContentShare');
    if (!btn) { console.warn('⚠️ btnContentShare non trouvé dans le DOM'); return; }

    btn.addEventListener('click', () => {
      if (this.activeContent) {
        this.stopContent(true);
      } else {
        this._buildModal();
      }
    });

    console.log('🎬 Bouton btnContentShare lié');
  }

  // ─────────────────────────────────────────────────
  //  ÉVÉNEMENTS SOCKET.IO
  // ─────────────────────────────────────────────────

  _bindSocketEvents() {
    if (!this.socket) return;

    // Contenu démarré (reçu par les participants)
    this.socket.on('content-start', (content) => {
      if (this.isHost) return; // L'hôte gère lui-même
      this._displayContent(content, false);
    });

    // Synchronisation play/pause/seek/pdf-page
    this.socket.on('content-sync', ({ action, value }) => {
      if (this.isHost) return;
      this._applySync(action, value);
    });

    // Arrêt du contenu (côté participants)
    this.socket.on('content-stop', () => {
      this.stopContent(false);
    });
  }

  // ─────────────────────────────────────────────────
  //  MODAL DE SÉLECTION
  // ─────────────────────────────────────────────────

  _buildModal() {
    document.getElementById('csmModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'csmModal';
    modal.className = 'csm-overlay';
    modal.innerHTML = `
      <div class="csm-box">
        <div class="csm-header">
          <h3><i class="fa-solid fa-photo-film"></i> Partager un contenu</h3>
          <button class="csm-close" id="csmClose">✕</button>
        </div>

        <!-- Onglets -->
        <div class="csm-tabs">
          <button class="csm-tab active" data-tab="file">
            <i class="fa-solid fa-folder-open"></i> Fichier
          </button>
          <button class="csm-tab" data-tab="link">
            <i class="fa-solid fa-link"></i> Lien vidéo
          </button>
        </div>

        <!-- Panneau Fichier -->
        <div class="csm-panel active" id="csmPanelFile">
          <div class="csm-dropzone" id="csmDropzone">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <p>Glissez un fichier ici<br><span>ou cliquez pour parcourir</span></p>
            <input type="file" id="csmFileInput"
              accept="image/*,video/*,audio/*,.pdf,.mp4,.mp3,.webm,.ogg,.mov"
              style="display:none">
          </div>
          <div class="csm-file-types">
            <span>📄 PDF</span><span>🖼️ Images</span>
            <span>🎬 Vidéo</span><span>🎵 Audio</span>
          </div>
          <div class="csm-progress" id="csmProgress" style="display:none">
            <div class="csm-progress-bar" id="csmProgressBar"></div>
            <span id="csmProgressLabel">Chargement...</span>
          </div>
        </div>

        <!-- Panneau Lien -->
        <div class="csm-panel" id="csmPanelLink">
          <label class="csm-label">URL de la vidéo</label>
          <input class="csm-input" id="csmLinkInput" type="url"
            placeholder="https://youtube.com/watch?v=... ou https://vimeo.com/... ou .mp4">
          <div class="csm-link-hints">
            <span>▶ YouTube</span><span>▶ Vimeo</span><span>▶ MP4 direct</span>
          </div>
          <button class="csm-btn-primary" id="csmLinkSubmit">
            <i class="fa-solid fa-play"></i> Diffuser ce lien
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    // --- Onglets ---
    modal.querySelectorAll('.csm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.csm-tab, .csm-panel').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        const panelId = `csmPanel${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`;
        document.getElementById(panelId)?.classList.add('active');
      });
    });

    // --- Fermeture ---
    document.getElementById('csmClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // --- Dropzone ---
    const dropzone  = document.getElementById('csmDropzone');
    const fileInput = document.getElementById('csmFileInput');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this._handleFile(file, modal);
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) this._handleFile(file, modal);
    });

    // --- Lien vidéo ---
    document.getElementById('csmLinkSubmit').addEventListener('click', () => {
      const url = document.getElementById('csmLinkInput').value.trim();
      if (!url) return;
      modal.remove();
      this._loadLink(url);
    });
    document.getElementById('csmLinkInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('csmLinkSubmit').click();
    });
  }

  // ─────────────────────────────────────────────────
  //  GESTION FICHIER LOCAL
  // ─────────────────────────────────────────────────

  _handleFile(file, modal) {
    const type = this._detectFileType(file);
    if (!type) { alert('Type de fichier non supporté.'); return; }

    const progress      = document.getElementById('csmProgress');
    const progressBar   = document.getElementById('csmProgressBar');
    const progressLabel = document.getElementById('csmProgressLabel');
    if (progress) {
      progress.style.display = 'block';
      progressBar.style.width = '0%';
      progressLabel.textContent = 'Upload en cours...';
    }

    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/upload', { method: 'POST', body: formData })
      .then(r => r.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Erreur upload');
        if (progressLabel) progressLabel.textContent = 'Prêt !';
        modal?.remove();

        const content = {
          type,
          name:     data.fileName,
          url:      data.fileUrl,
          size:     data.fileSize,
          mimeType: data.mimeType
        };
        this._displayContent(content, true);
      })
      .catch(err => {
        console.error('Erreur upload:', err);
        alert('Erreur lors de l\'upload du fichier : ' + err.message);
      })
      .finally(() => {
        if (progress) progress.style.display = 'none';
      });
  }

  _detectFileType(file) {
    const mime = file.type;
    if (mime.startsWith('image/'))  return 'image';
    if (mime.startsWith('video/'))  return 'video';
    if (mime.startsWith('audio/'))  return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    // Fallback par extension
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'image';
    if (['mp4','webm','ogg','mov','avi','mkv'].includes(ext)) return 'video';
    if (['mp3','wav','aac','flac'].includes(ext))              return 'audio';
    if (ext === 'pdf')                                          return 'pdf';
    return null;
  }

  // ─────────────────────────────────────────────────
  //  GESTION LIEN EXTERNE
  // ─────────────────────────────────────────────────

  _loadLink(url) {
    const type = this._detectLinkType(url);
    if (!type) {
      alert('Lien non reconnu. Supporte : YouTube, Vimeo, ou lien MP4/audio/PDF direct.');
      return;
    }
    this._displayContent({ type, url, name: url }, true);
  }

  _detectLinkType(url) {
    if (/youtube\.com\/watch|youtu\.be\//.test(url)) return 'youtube';
    if (/vimeo\.com\/\d+/.test(url))                 return 'vimeo';
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url))    return 'video';
    if (/\.(mp3|wav|aac|flac)(\?|$)/i.test(url))    return 'audio';
    if (/\.pdf(\?|$)/i.test(url))                    return 'pdf';
    return null;
  }

  // ─────────────────────────────────────────────────
  //  AFFICHAGE DU CONTENU
  // ─────────────────────────────────────────────────

  _displayContent(content, broadcast) {
    this._clearPlayer();
    this.activeContent = content;
    this.isSharing     = true;

    // Masquer le placeholder, montrer la zone de contenu
    const placeholder = document.getElementById('screenPlaceholder');
    const container   = document.getElementById('screenShareContainer');
    if (placeholder) placeholder.style.display = 'none';

    // Créer ou réutiliser la zone de rendu
    let zone = document.getElementById('csmRenderZone');
    if (!zone) {
      zone = document.createElement('div');
      zone.id = 'csmRenderZone';
      zone.style.cssText = `
        width:100%; height:100%; position:relative;
        display:flex; flex-direction:column;
        background:#0f172a; overflow:hidden;
      `;
      if (container) container.appendChild(zone);
    }
    zone.innerHTML = '';
    zone.style.display = 'flex';

    // Router vers le bon renderer
    switch (content.type) {
      case 'image':   this._renderImage(zone, content);   break;
      case 'video':   this._renderVideo(zone, content);   break;
      case 'audio':   this._renderAudio(zone, content);   break;
      case 'pdf':     this._renderPDF(zone, content);     break;
      case 'youtube': this._renderYouTube(zone, content); break;
      case 'vimeo':   this._renderVimeo(zone, content);   break;
    }

    // Barre titre + bouton stop (hôte seulement)
    this._injectContentBar(zone, content);

    // Mettre à jour le bouton
    const btn = document.getElementById('btnContentShare');
    if (btn) {
      btn.classList.add('active');
      btn.title = 'Arrêter le partage de contenu';
    }

    // Diffuser aux participants
    if (broadcast && this.isHost && this.socket) {
      const payload = {
        type:     content.type,
        name:     content.name,
        url:      content.url,
        size:     content.size,
        mimeType: content.mimeType
      };
      this.socket.emit('content-start', payload);
    }
  }

  _injectContentBar(zone, content) {
    const bar = document.createElement('div');
    bar.id = 'csmContentBar';
    bar.style.cssText = `
      position:absolute; top:0; left:0; right:0;
      background:linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
      padding:10px 14px; display:flex; align-items:center; gap:10px;
      z-index:10; pointer-events:none;
    `;
    bar.innerHTML = `
      <span style="font-size:12px;color:rgba(255,255,255,0.8);flex:1;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${this._typeIcon(content.type)} ${content.name || content.url}
      </span>
      ${this.isHost ? `
        <button id="csmStopBtn" style="
          pointer-events:all; background:#ef4444; color:white; border:none;
          border-radius:6px; padding:4px 10px; font-size:11px; font-weight:600;
          cursor:pointer; flex-shrink:0;
        ">⏹ Arrêter</button>` : ''}
    `;
    zone.appendChild(bar);

    if (this.isHost) {
      document.getElementById('csmStopBtn')?.addEventListener('click', () => {
        this.stopContent(true);
      });
    }
  }

  _typeIcon(type) {
    return { image:'🖼️', video:'🎬', audio:'🎵', pdf:'📄', youtube:'▶️', vimeo:'▶️' }[type] || '📁';
  }

  // ─────────────────────────────────────────────────
  //  RENDERERS
  // ─────────────────────────────────────────────────

  /** IMAGE */
  _renderImage(zone, content) {
    const img = document.createElement('img');
    img.src = content.url;
    img.style.cssText = `max-width:100%; max-height:100%; object-fit:contain; margin:auto; display:block;`;
    zone.style.justifyContent = 'center';
    zone.style.alignItems     = 'center';
    zone.appendChild(img);
    this.player = img;
  }

  /** VIDÉO locale ou MP4 distant */
  _renderVideo(zone, content) {
    const video = document.createElement('video');
    video.src      = content.url;
    video.controls = this.isHost; // Contrôles natifs seulement pour l'hôte
    video.style.cssText = `width:100%; height:100%; object-fit:contain; background:#000;`;
    video.preload  = 'metadata';
    zone.appendChild(video);
    this.player = video;

    if (this.isHost) {
      video.addEventListener('play',   () => this._broadcastSync('play',  video.currentTime));
      video.addEventListener('pause',  () => this._broadcastSync('pause', video.currentTime));
      video.addEventListener('seeked', () => this._broadcastSync('seek',  video.currentTime));
      video.play().catch(() => {});
    }
  }

  /** AUDIO */
  _renderAudio(zone, content) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; width:100%; height:100%; gap:20px;
    `;
    wrapper.innerHTML = `
      <div style="font-size:64px;">🎵</div>
      <div style="color:#f1f5f9;font-size:16px;font-weight:600;
        max-width:80%;text-align:center;overflow:hidden;text-overflow:ellipsis;">
        ${content.name || 'Audio'}
      </div>
    `;
    const audio = document.createElement('audio');
    audio.src      = content.url;
    audio.controls = this.isHost;
    audio.style.cssText = `width:80%; max-width:400px;`;
    wrapper.appendChild(audio);
    zone.appendChild(wrapper);
    this.player = audio;

    if (this.isHost) {
      audio.addEventListener('play',   () => this._broadcastSync('play',  audio.currentTime));
      audio.addEventListener('pause',  () => this._broadcastSync('pause', audio.currentTime));
      audio.addEventListener('seeked', () => this._broadcastSync('seek',  audio.currentTime));
      audio.play().catch(() => {});
    }
  }

  /** PDF via PDF.js CDN */
  _renderPDF(zone, content) {
    if (!window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        this._initPDFViewer(zone, content);
      };
      document.head.appendChild(script);
    } else {
      this._initPDFViewer(zone, content);
    }
  }

  _initPDFViewer(zone, content) {
    zone.innerHTML = `
      <div id="csmPdfControls" style="
        display:flex; align-items:center; justify-content:center; gap:12px;
        padding:8px 16px; background:rgba(0,0,0,0.6);
        position:absolute; bottom:0; left:0; right:0; z-index:10;
      ">
        <button id="pdfPrev" style="
          background:rgba(255,255,255,0.1); color:white; border:none;
          border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px;
        ">◀ Précédent</button>
        <span id="pdfPageInfo" style="color:white;font-size:13px;min-width:80px;text-align:center;">
          Page 1 / ?
        </span>
        <button id="pdfNext" style="
          background:rgba(255,255,255,0.1); color:white; border:none;
          border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px;
        ">Suivant ▶</button>
      </div>
      <canvas id="csmPdfCanvas" style="
        max-width:100%; max-height:calc(100% - 50px);
        margin:auto; display:block;
      "></canvas>
    `;

    window.pdfjsLib.getDocument(content.url).promise
      .then(pdfDoc => {
        this.pdfDoc  = pdfDoc;
        this.pdfPage = 1;
        this._renderPDFPage(1);

        document.getElementById('pdfPrev')?.addEventListener('click', () => {
          if (this.pdfPage > 1) {
            this.pdfPage--;
            this._renderPDFPage(this.pdfPage);
            if (this.isHost) this._broadcastSync('pdf-page', this.pdfPage);
          }
        });
        document.getElementById('pdfNext')?.addEventListener('click', () => {
          if (this.pdfPage < this.pdfDoc.numPages) {
            this.pdfPage++;
            this._renderPDFPage(this.pdfPage);
            if (this.isHost) this._broadcastSync('pdf-page', this.pdfPage);
          }
        });
      })
      .catch(err => {
        zone.innerHTML = `<div style="color:#ef4444;margin:auto;padding:20px;">
          Erreur chargement PDF : ${err.message}</div>`;
      });
  }

  _renderPDFPage(pageNum) {
    if (!this.pdfDoc) return;
    this.pdfDoc.getPage(pageNum).then(page => {
      const canvas = document.getElementById('csmPdfCanvas');
      if (!canvas) return;
      const ctx   = canvas.getContext('2d');
      const zone  = document.getElementById('csmRenderZone');
      const scale = Math.min(
        (zone?.clientWidth  || 800) / page.getViewport({ scale: 1 }).width,
        ((zone?.clientHeight || 600) - 50) / page.getViewport({ scale: 1 }).height
      );
      const viewport = page.getViewport({ scale });
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      page.render({ canvasContext: ctx, viewport });

      const info = document.getElementById('pdfPageInfo');
      if (info) info.textContent = `Page ${pageNum} / ${this.pdfDoc.numPages}`;
    });
  }

  /** YOUTUBE */
  _renderYouTube(zone, content) {
    const videoId = this._extractYouTubeId(content.url);
    if (!videoId) {
      zone.innerHTML = `<div style="color:#ef4444;margin:auto;">ID YouTube invalide</div>`;
      return;
    }

    const iframeDiv = document.createElement('div');
    iframeDiv.id = 'csmYTPlayer';
    iframeDiv.style.cssText = `width:100%; height:100%;`;
    zone.appendChild(iframeDiv);

    const initYT = () => {
      this.player = new window.YT.Player('csmYTPlayer', {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: this.isHost ? 1 : 0,
          rel: 0, modestbranding: 1
        },
        events: {
          onStateChange: (e) => {
            if (!this.isHost || this.syncLock) return;
            const YT = window.YT.PlayerState;
            if (e.data === YT.PLAYING) this._broadcastSync('play',  this.player.getCurrentTime());
            if (e.data === YT.PAUSED)  this._broadcastSync('pause', this.player.getCurrentTime());
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      window._csmYTReady = initYT;
      if (!document.getElementById('ytApiScript')) {
        const s = document.createElement('script');
        s.id  = 'ytApiScript';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
        window.onYouTubeIframeAPIReady = () => window._csmYTReady?.();
      }
    }
  }

  _extractYouTubeId(url) {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /** VIMEO */
  _renderVimeo(zone, content) {
    const videoId = content.url.match(/vimeo\.com\/(\d+)/)?.[1];
    if (!videoId) {
      zone.innerHTML = `<div style="color:#ef4444;margin:auto;">ID Vimeo invalide</div>`;
      return;
    }

    const iframeDiv = document.createElement('div');
    iframeDiv.id = 'csmVimeoPlayer';
    iframeDiv.style.cssText = `width:100%; height:100%;`;
    zone.appendChild(iframeDiv);

    const loadVimeoSdk = (cb) => {
      if (window.Vimeo) { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://player.vimeo.com/api/player.js';
      s.onload = cb;
      document.head.appendChild(s);
    };

    loadVimeoSdk(() => {
      const p = new window.Vimeo.Player('csmVimeoPlayer', {
        id: videoId, autoplay: true, controls: this.isHost
      });
      this.player = p;

      if (this.isHost) {
        p.on('play',   () => { if (!this.syncLock) p.getCurrentTime().then(t => this._broadcastSync('play',  t)); });
        p.on('pause',  () => { if (!this.syncLock) p.getCurrentTime().then(t => this._broadcastSync('pause', t)); });
        p.on('seeked', () => { if (!this.syncLock) p.getCurrentTime().then(t => this._broadcastSync('seek',  t)); });
      }
    });
  }

  // ─────────────────────────────────────────────────
  //  SYNCHRONISATION SOCKET.IO
  // ─────────────────────────────────────────────────

  _broadcastSync(action, value) {
    if (!this.isHost || !this.socket) return;
    this.socket.emit('content-sync', { action, value });
  }

  _applySync(action, value) {
    if (this.syncLock) return;
    this.syncLock = true;
    setTimeout(() => { this.syncLock = false; }, 500);

    const p = this.player;
    if (!p) return;

    // Vidéo/Audio HTML5
    if (p instanceof HTMLVideoElement || p instanceof HTMLAudioElement) {
      if (action === 'play')  { p.currentTime = value; p.play().catch(() => {}); }
      if (action === 'pause') { p.currentTime = value; p.pause(); }
      if (action === 'seek')  { p.currentTime = value; }
      return;
    }

    // YouTube
    if (window.YT && p.seekTo) {
      if (action === 'play')  { p.seekTo(value, true); p.playVideo(); }
      if (action === 'pause') { p.seekTo(value, true); p.pauseVideo(); }
      if (action === 'seek')  { p.seekTo(value, true); }
      return;
    }

    // Vimeo
    if (p.setCurrentTime) {
      p.setCurrentTime(value).then(() => {
        if (action === 'play')  p.play();
        if (action === 'pause') p.pause();
      });
      return;
    }

    // PDF : navigation de page
    if (action === 'pdf-page') {
      this.pdfPage = value;
      this._renderPDFPage(value);
    }
  }

  // ─────────────────────────────────────────────────
  //  NETTOYAGE
  // ─────────────────────────────────────────────────

  _clearPlayer() {
    if (this.player) {
      if (this.player instanceof HTMLVideoElement || this.player instanceof HTMLAudioElement) {
        this.player.pause();
        this.player.src = '';
      } else if (this.player.destroy) {
        try { this.player.destroy(); } catch(e) {}
      } else if (this.player.unload) {
        try { this.player.unload(); } catch(e) {}
      }
      this.player = null;
    }

    // Libérer les Object URLs créées localement
    if (this.activeContent?.isObjectUrl && this.activeContent?.url) {
      URL.revokeObjectURL(this.activeContent.url);
    }

    this.pdfDoc  = null;
    this.pdfPage = 1;

    document.getElementById('csmRenderZone')?.remove();

    // Remettre le placeholder
    const placeholder = document.getElementById('screenPlaceholder');
    if (placeholder) placeholder.style.display = 'flex';
  }

  // ─────────────────────────────────────────────────
  //  STYLES
  // ─────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('csmStyles')) return;
    const style = document.createElement('style');
    style.id = 'csmStyles';
    style.textContent = `
      /* ── Overlay ── */
      .csm-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.65);
        display: flex; align-items: center; justify-content: center;
        animation: csmFadeIn 0.2s ease;
      }
      @keyframes csmFadeIn  { from{opacity:0}     to{opacity:1} }
      @keyframes csmSlideUp { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }

      /* ── Boîte ── */
      .csm-box {
        background: #1e293b;
        border-radius: 18px;
        width: 94%; max-width: 440px;
        box-shadow: 0 28px 64px rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.07);
        animation: csmSlideUp 0.25s ease;
        overflow: hidden;
      }

      /* ── Header ── */
      .csm-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .csm-header h3 {
        margin: 0; font-size: 15px; font-weight: 700; color: #f1f5f9;
        display: flex; align-items: center; gap: 8px;
      }
      .csm-header h3 i { color: #7c3aed; }
      .csm-close {
        background: none; border: none; color: #64748b;
        font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 6px;
        border-radius: 6px; transition: color 0.15s;
      }
      .csm-close:hover { color: #f1f5f9; }

      /* ── Onglets ── */
      .csm-tabs {
        display: flex; gap: 4px; padding: 10px 16px 0;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .csm-tab {
        background: none; border: none; color: #64748b;
        padding: 8px 14px 10px; font-size: 13px; font-weight: 600;
        cursor: pointer; border-bottom: 2px solid transparent;
        transition: color 0.15s, border-color 0.15s;
        display: flex; align-items: center; gap: 6px;
      }
      .csm-tab.active { color: #7c3aed; border-bottom-color: #7c3aed; }
      .csm-tab:hover:not(.active) { color: #94a3b8; }

      /* ── Panneaux ── */
      .csm-panel { display: none; padding: 20px; }
      .csm-panel.active { display: block; }

      /* ── Dropzone ── */
      .csm-dropzone {
        border: 2px dashed rgba(124,58,237,0.35);
        border-radius: 12px; padding: 32px 20px;
        text-align: center; cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        background: rgba(124,58,237,0.04);
      }
      .csm-dropzone:hover, .csm-dropzone.drag-over {
        background: rgba(124,58,237,0.1);
        border-color: rgba(124,58,237,0.6);
      }
      .csm-dropzone i { font-size: 32px; color: #7c3aed; margin-bottom: 10px; display: block; }
      .csm-dropzone p { margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.6; }
      .csm-dropzone p span { font-size: 12px; color: #64748b; }

      /* ── Types de fichiers ── */
      .csm-file-types {
        display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; justify-content: center;
      }
      .csm-file-types span {
        font-size: 11px; color: #64748b;
        background: rgba(255,255,255,0.05); border-radius: 6px; padding: 3px 8px;
      }

      /* ── Barre de progression ── */
      .csm-progress {
        margin-top: 14px; background: rgba(255,255,255,0.07);
        border-radius: 6px; overflow: visible; height: 6px; position: relative;
      }
      .csm-progress-bar {
        height: 100%; background: #7c3aed;
        border-radius: 6px; transition: width 0.2s ease; width: 0%;
      }
      #csmProgressLabel {
        position: absolute; top: 10px; left: 0; right: 0;
        text-align: center; font-size: 11px; color: #94a3b8;
      }

      /* ── Champ lien ── */
      .csm-label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; }
      .csm-input {
        width: 100%; box-sizing: border-box;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
        color: #f1f5f9; border-radius: 8px; padding: 10px 12px;
        font-size: 13px; outline: none; transition: border-color 0.15s;
      }
      .csm-input:focus { border-color: #7c3aed; }
      .csm-input::placeholder { color: #475569; }

      .csm-link-hints {
        display: flex; gap: 8px; margin: 8px 0 14px; flex-wrap: wrap;
      }
      .csm-link-hints span {
        font-size: 11px; color: #64748b;
        background: rgba(255,255,255,0.05); border-radius: 6px; padding: 3px 8px;
      }

      /* ── Bouton principal ── */
      .csm-btn-primary {
        width: 100%; padding: 11px;
        background: linear-gradient(135deg, #7c3aed, #5b21b6);
        color: white; border: none; border-radius: 10px;
        font-size: 14px; font-weight: 700; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: opacity 0.15s;
      }
      .csm-btn-primary:hover { opacity: 0.88; }

      /* ── Bouton actif dans la toolbar ── */
      #btnContentShare.active {
        background: rgba(239,68,68,0.18) !important;
        color: #ef4444 !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// Exposer la classe (l'instanciation est faite par app.js via initializeManagers)
window.ContentShareManager = ContentShareManager;
