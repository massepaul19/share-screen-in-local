// ========================================
// public/static/js/notes.js
// Gestionnaire de prise de notes intégré
// Fonctionne SANS connexion internet (sauf dictée vocale)
// ========================================

class NotesManager {
  constructor() {
    this.sections = [];
    this.sectionCounter = 0;
    this.recognition = null;
    this.currentTextarea = null;
    this.isRecording = false;
    this.autoSaveInterval = null;

    this.init();
  }

  init() {
    this.createPanel();
    this.initSpeechRecognition();
    this.loadDraft();
    this.startAutoSave();
    console.log('✅ NotesManager initialisé');
  }

  // ===== CRÉATION DU PANNEAU =====
  createPanel() {
    const panel = document.createElement('div');
    panel.id = 'notesPanel';
    panel.className = 'notes-panel';
    panel.innerHTML = `
      <div class="notes-panel-inner">
        <!-- Header -->
        <div class="notes-header">
          <div class="notes-header-left">
            <span class="notes-icon">📝</span>
            <div>
              <h3>Mes Notes</h3>
              <span class="notes-session-label" id="notesSessionLabel">Session en cours</span>
            </div>
          </div>
          <div class="notes-header-actions">
            <button class="notes-action-btn" id="notesExportBtn" title="Exporter en PDF">
              <i class="fa-solid fa-file-pdf"></i>
            </button>
            <button class="notes-action-btn" id="notesSaveBtn" title="Sauvegarder">
              <i class="fa-solid fa-floppy-disk"></i>
            </button>
            <button class="notes-action-btn close-btn" id="notesCloseBtn" title="Fermer">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Infos du cours -->
        <div class="notes-course-info">
          <input type="text" id="notesCourseTitle" placeholder="Titre du cours / session..." class="notes-course-input">
          <input type="text" id="notesAuthor" placeholder="Votre nom..." class="notes-course-input">
        </div>

        <!-- Sections de notes -->
        <div class="notes-sections-scroll" id="notesSectionsContainer">
          <!-- Sections ajoutées dynamiquement -->
        </div>

        <!-- Bouton ajouter section -->
        <div class="notes-add-section">
          <button class="notes-add-btn" id="notesAddSection">
            <i class="fa-solid fa-plus"></i> Ajouter une section
          </button>
        </div>

        <!-- Footer Lingua MMPB -->
        <div class="notes-footer">
          <div class="notes-footer-brand">
            <span>Propulsé par</span>
            <a href="https://mmpb-l.ai.services-ztf.com/" target="_blank" class="lingua-link">
              <span class="lingua-logo">L</span>
              <strong>Lingua MMPB AI</strong>
            </a>
            <span class="notes-footer-sep">·</span>
            <span class="notes-autosave-status" id="notesAutoSave">
              <i class="fa-solid fa-cloud-arrow-up"></i> Sauvegardé
            </span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this.bindPanelEvents();
  }

  bindPanelEvents() {
    document.getElementById('notesCloseBtn').addEventListener('click', () => this.toggle(false));
    document.getElementById('notesAddSection').addEventListener('click', () => this.addSection());
    document.getElementById('notesExportBtn').addEventListener('click', () => this.exportPDF());
    document.getElementById('notesSaveBtn').addEventListener('click', () => this.saveDraft());

    // Auto-update label session
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) {
      document.getElementById('notesSessionLabel').textContent = `Salle : ${roomId}`;
    }
  }

  // ===== TOGGLE PANEL =====
  toggle(forceState) {
    const panel = document.getElementById('notesPanel');
    const btn = document.getElementById('btnNotes');
    const isOpen = panel.classList.contains('open');
    const shouldOpen = forceState !== undefined ? forceState : !isOpen;

    if (shouldOpen) {
      panel.classList.add('open');
      if (btn) btn.classList.add('active');
      // Ajouter une section par défaut si vide
      if (this.sectionCounter === 0) this.addSection();
    } else {
      panel.classList.remove('open');
      if (btn) btn.classList.remove('active');
      this.stopRecording();
    }
  }

  // ===== AJOUTER UNE SECTION =====
  addSection() {
    this.sectionCounter++;
    const id = `notes-section-${Date.now()}`;

    const section = document.createElement('div');
    section.className = 'notes-section-card';
    section.id = id;
    section.innerHTML = `
      <div class="notes-section-header">
        <div class="notes-section-num">${this.sectionCounter}</div>
        <input type="text" class="notes-section-title" placeholder="Titre de la section (ex: Introduction, Chapitre 1...)" oninput="window.notesManager.saveDraft()">
        <button class="notes-section-del" onclick="window.notesManager.removeSection('${id}')" title="Supprimer">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
      <div class="notes-section-body">
        <div class="notes-textarea-wrapper">
          <textarea class="notes-textarea" 
                    placeholder="Prenez vos notes ici... (Cliquez sur 🎤 pour dicter)" 
                    oninput="window.notesManager.saveDraft()" 
                    rows="4"></textarea>
          <button class="notes-mic-btn" onclick="window.notesManager.toggleMic(this)" title="Dicter (nécessite internet)">
            <i class="fa-solid fa-microphone"></i>
          </button>
        </div>
        <div class="notes-mic-hint" style="display:none">
          <i class="fa-solid fa-circle-dot" style="color:#ef4444;animation:pulse 1s infinite"></i>
          Dictée active — dites "point", "virgule", "à la ligne"...
        </div>
      </div>
    `;

    document.getElementById('notesSectionsContainer').appendChild(section);

    // Scroll vers la nouvelle section
    setTimeout(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.querySelector('.notes-section-title').focus();
    }, 100);

    this.renumberSections();
  }

  removeSection(id) {
    const section = document.getElementById(id);
    if (section) {
      section.style.animation = 'sectionOut 0.2s ease forwards';
      setTimeout(() => {
        section.remove();
        this.renumberSections();
        this.saveDraft();
      }, 200);
    }
  }

  renumberSections() {
    const sections = document.querySelectorAll('.notes-section-card');
    sections.forEach((s, i) => {
      const num = s.querySelector('.notes-section-num');
      if (num) num.textContent = i + 1;
    });
    this.sectionCounter = sections.length;
  }

  // ===== RECONNAISSANCE VOCALE =====
  initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('⚠️ Dictée vocale non supportée');
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'fr-FR';

    this.recognition.onresult = (event) => {
      if (!this.currentTextarea) return;

      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += this.processDictation(event.results[i][0].transcript) + ' ';
        }
      }

      if (final) {
        this.currentTextarea.value += final;
        this.currentTextarea.dispatchEvent(new Event('input'));
      }
    };

    this.recognition.onerror = () => this.stopRecording();
    this.recognition.onend = () => {
      if (this.isRecording) this.stopRecording();
    };
  }

  processDictation(text) {
    return text
      .replace(/\bpoint\b/gi, '.')
      .replace(/\bvirgule\b/gi, ',')
      .replace(/\bpoint virgule\b/gi, ';')
      .replace(/\bdeux points\b/gi, ':')
      .replace(/\bà la ligne\b/gi, '\n')
      .replace(/\bnouvelle ligne\b/gi, '\n')
      .replace(/\bpoint d'interrogation\b/gi, '?')
      .replace(/\bpoint d'exclamation\b/gi, '!');
  }

  toggleMic(btn) {
    const wrapper = btn.closest('.notes-textarea-wrapper');
    const textarea = wrapper.querySelector('.notes-textarea');
    const hint = wrapper.parentElement.querySelector('.notes-mic-hint');

    if (this.isRecording && this.currentTextarea === textarea) {
      this.stopRecording();
    } else {
      this.stopRecording();
      this.startRecording(textarea, btn, hint);
    }
  }

  startRecording(textarea, btn, hint) {
    if (!this.recognition) {
      alert('La dictée vocale nécessite une connexion internet et un navigateur compatible (Chrome recommandé).');
      return;
    }

    this.currentTextarea = textarea;
    this.isRecording = true;

    btn.classList.add('mic-active');
    btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    if (hint) hint.style.display = 'flex';

    try {
      this.recognition.start();
    } catch (e) {
      this.stopRecording();
    }
  }

  stopRecording() {
    this.isRecording = false;
    this.currentTextarea = null;

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    document.querySelectorAll('.notes-mic-btn').forEach(btn => {
      btn.classList.remove('mic-active');
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    });

    document.querySelectorAll('.notes-mic-hint').forEach(h => h.style.display = 'none');
  }

  // ===== SAUVEGARDE AUTO =====
  startAutoSave() {
    this.autoSaveInterval = setInterval(() => this.saveDraft(), 30000);
  }

  saveDraft() {
    const data = this.collectData();
    localStorage.setItem('estlc_notes_draft', JSON.stringify(data));

    const status = document.getElementById('notesAutoSave');
    if (status) {
      status.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sauvegardé';
      status.style.color = '#3fb950';
      setTimeout(() => {
        if (status) status.style.color = '';
      }, 2000);
    }
  }

  loadDraft() {
    try {
      const raw = localStorage.getItem('estlc_notes_draft');
      if (!raw) return;

      const data = JSON.parse(raw);

      if (data.courseTitle) {
        document.getElementById('notesCourseTitle').value = data.courseTitle;
      }
      if (data.author) {
        document.getElementById('notesAuthor').value = data.author;
      }

      if (data.sections && data.sections.length > 0) {
        data.sections.forEach(s => {
          this.addSection();
          const cards = document.querySelectorAll('.notes-section-card');
          const last = cards[cards.length - 1];
          if (last) {
            last.querySelector('.notes-section-title').value = s.title || '';
            last.querySelector('.notes-textarea').value = s.content || '';
          }
        });
      }

      console.log('📂 Brouillon chargé');
    } catch (e) {
      console.warn('Pas de brouillon à charger');
    }
  }

  collectData() {
    const sections = [];
    document.querySelectorAll('.notes-section-card').forEach(card => {
      sections.push({
        title: card.querySelector('.notes-section-title')?.value || '',
        content: card.querySelector('.notes-textarea')?.value || ''
      });
    });

    return {
      courseTitle: document.getElementById('notesCourseTitle')?.value || '',
      author: document.getElementById('notesAuthor')?.value || '',
      date: new Date().toLocaleDateString('fr-FR'),
      room: new URLSearchParams(window.location.search).get('room') || '',
      sections
    };
  }

  // ===== EXPORT PDF =====
  async exportPDF() {
    const data = this.collectData();

    if (!data.courseTitle) {
      alert('Veuillez entrer un titre de cours avant d\'exporter.');
      document.getElementById('notesCourseTitle').focus();
      return;
    }

    // Charger jsPDF si pas déjà chargé
    if (!window.jspdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const pageW = 210, pageH = 297, margin = 20;
    const contentW = pageW - margin * 2;
    let y = margin;

    const checkBreak = (space) => {
      if (y + space > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // ---- En-tête ----
    // Bande verte ESTLC
    doc.setFillColor(0, 100, 0);
    doc.rect(0, 0, pageW, 18, 'F');

    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('ESTLC SHARING SCREEN', margin, 12);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Salle: ${data.room || '—'}  ·  ${data.date}`, pageW - margin, 12, { align: 'right' });

    y = 28;

    // Titre du cours
    doc.setFontSize(20);
    doc.setTextColor(0, 100, 0);
    doc.setFont(undefined, 'bold');
    const titleLines = doc.splitTextToSize(data.courseTitle, contentW);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 10 + 4;

    // Auteur
    if (data.author) {
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      doc.text(`Par : ${data.author}`, margin, y);
      y += 8;
    }

    // Séparateur
    doc.setDrawColor(0, 100, 0);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageW - margin, y);
    y += 10;

    // ---- Sections ----
    data.sections.forEach((section, i) => {
      if (!section.title && !section.content) return;

      checkBreak(20);

      // Numéro + titre
      doc.setFillColor(240, 248, 240);
      const titleH = 10;
      doc.roundedRect(margin, y - 6, contentW, titleH, 2, 2, 'F');

      doc.setFontSize(13);
      doc.setTextColor(0, 77, 0);
      doc.setFont(undefined, 'bold');
      doc.text(`${i + 1}.  ${section.title || 'Section sans titre'}`, margin + 4, y + 1);
      y += titleH + 4;

      // Contenu
      if (section.content) {
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.setFont(undefined, 'normal');

        const paragraphs = section.content.split('\n').filter(l => l.trim());
        paragraphs.forEach(para => {
          const lines = doc.splitTextToSize(para, contentW - 6);
          lines.forEach(line => {
            checkBreak(7);
            doc.text(line, margin + 4, y);
            y += 6;
          });
          y += 2;
        });
      }

      y += 6;
    });

    // ---- Footer Lingua MMPB ----
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFillColor(248, 248, 248);
      doc.rect(0, pageH - 14, pageW, 14, 'F');
      doc.setDrawColor(0, 100, 0);
      doc.setLineWidth(0.3);
      doc.line(0, pageH - 14, pageW, pageH - 14);

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      doc.text('Notes générées via ESTLC Sharing Screen', margin, pageH - 6);

      doc.setTextColor(0, 100, 0);
      doc.setFont(undefined, 'bold');
      doc.text('Lingua MMPB AI', pageW / 2, pageH - 6, { align: 'center' });

      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      doc.text(`Page ${p}/${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
    }

    // Sauvegarder
    const filename = `Notes_${data.courseTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    doc.save(filename);
  }
}

// ===== INIT GLOBAL =====
window.NotesManager = NotesManager;