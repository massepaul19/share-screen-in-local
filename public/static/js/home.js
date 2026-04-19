document.addEventListener('DOMContentLoaded', () => {
  const tabNew = document.getElementById('tabNew');
  const tabJoin = document.getElementById('tabJoin');
  const formNew = document.getElementById('formNew');
  const formJoin = document.getElementById('formJoin');
  const customCodeToggle = document.getElementById('customCodeToggle');
  const customCodeGroup = document.getElementById('customCodeGroup');
  const launchBtn = formNew.querySelector('.btn-launch');
  const joinBtn = formJoin.querySelector('.btn-launch');
  const themeToggle = document.getElementById('themeToggle');

  // Éléments du modal de partage
  const shareLinkModal = document.getElementById('shareLinkModal');
  const closeShareModalBtn = document.getElementById('closeShareModalBtn');
  const shareableLink = document.getElementById('shareableLink');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const joinAsHostBtn = document.getElementById('joinAsHostBtn');

  function showTab(tab) {
    tabNew.classList.remove('active');
    tabJoin.classList.remove('active');
    formNew.classList.add('hidden');
    formJoin.classList.add('hidden');
    
    if (tab === 'new') {
      tabNew.classList.add('active');
      formNew.classList.remove('hidden');
    } else {
      tabJoin.classList.add('active');
      formJoin.classList.remove('hidden');
    }
  }

  function toggleCustomCode() {
    const isHidden = customCodeGroup.classList.toggle('hidden');
    if (!isHidden) {
      customCodeToggle.textContent = 'Activé';
      customCodeToggle.classList.add('active');
    } else {
      customCodeToggle.textContent = 'Désactivé';
      customCodeToggle.classList.remove('active');
    }
  }

  async function launchMeeting() {
    const name = document.getElementById('newName').value.trim();
    const room = document.getElementById('newRoom').value.trim();
    const customCode = document.getElementById('customCode').value.trim();

    if (!name || !room) { 
      alert('Veuillez remplir votre nom et le nom de la session.'); 
      return; 
    }

    const useCustomCode = customCodeToggle.classList.contains('active') && customCode;
    const roomId = useCustomCode
      ? customCode.toLowerCase().replace(/[\s_]+/g, '-')
      : room.toLowerCase().replace(/[\s_]+/g, '-') || 'session-' + Date.now();

    // ===== VÉRIFICATION UNICITÉ DU CODE PERSONNALISÉ =====
    if (useCustomCode) {
      try {
        const res  = await fetch(`/api/check-room/${encodeURIComponent(roomId)}`);
        const data = await res.json();
        if (data.exists) {
          const msg = data.userCount > 0
            ? `Le code "${roomId}" est déjà utilisé par une session active (${data.userCount} participant(s)).\n\nChoisissez un autre code ou rejoignez cette session.`
            : `Le code "${roomId}" existe déjà (session récente en attente de destruction).\n\nChoisissez un autre code.`;
          alert(msg);
          document.getElementById('customCode').focus();
          return;
        }
      } catch (err) {
        console.warn('Vérification code impossible (serveur injoignable) :', err);
        // On laisse passer — le serveur gèrera le conflit
      }
    }

    // URL pour l'hôte
    const hostURL = `room.html?room=${roomId}&name=${encodeURIComponent(name)}&host=true`;

    // URL à partager avec les participants (page d'accueil avec code pré-rempli)
    const participantURLParams = new URLSearchParams({ room: roomId });
    const fullParticipantURL = `${window.location.origin}${window.location.pathname}?${participantURLParams.toString()}`;

    // Afficher le modal avec le lien cliquable
    shareableLink.href = fullParticipantURL;
    shareableLink.textContent = fullParticipantURL;
    shareLinkModal.style.display = 'flex';

    // Configurer le bouton pour rejoindre
    joinAsHostBtn.onclick = () => { window.location.href = hostURL; };
  }

  function joinMeeting() {
    const name = document.getElementById('joinName').value.trim();
    const room = document.getElementById('joinRoom').value.trim();
    if (!name || !room) { 
      alert('Veuillez remplir votre nom et le code de la session.'); 
      return; 
    }
    const roomId = room.toLowerCase().replace(/[\s_]+/g, '-'); // Normalisation du code
    window.location.href = `room.html?room=${roomId}&name=${encodeURIComponent(name)}`;
  }

  if (tabNew) tabNew.addEventListener('click', () => showTab('new'));
  if (tabJoin) tabJoin.addEventListener('click', () => showTab('join'));
  if (customCodeToggle) customCodeToggle.addEventListener('click', toggleCustomCode);
  if (launchBtn) launchBtn.addEventListener('click', launchMeeting);
  if (joinBtn) joinBtn.addEventListener('click', joinMeeting);

  // Gestion du modal de partage
  if (closeShareModalBtn) {
    closeShareModalBtn.addEventListener('click', () => {
      shareLinkModal.style.display = 'none';
    });
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const linkToCopy = shareableLink.href;
      if (!linkToCopy) return;

      navigator.clipboard.writeText(linkToCopy).then(() => {
        const originalContent = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copié !';
        copyLinkBtn.disabled = true;
        setTimeout(() => {
          copyLinkBtn.innerHTML = originalContent;
          copyLinkBtn.disabled = false;
        }, 2000);
      }).catch(err => {
        console.error('Erreur de copie:', err);
        alert('Impossible de copier le lien. Veuillez le copier manuellement.');
      });
    });
  }

  // Pré-remplir le formulaire si un code de salle est dans l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomToJoin = urlParams.get('room');
  if (roomToJoin) {
    showTab('join');
    document.getElementById('joinRoom').value = roomToJoin;
    document.getElementById('joinName').focus();
  }

  // Gestion du thème sombre
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      document.body.classList.toggle('dark-mode');
      const icon = this.querySelector('i');
      icon.className = document.body.classList.contains('dark-mode') ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
  }
});