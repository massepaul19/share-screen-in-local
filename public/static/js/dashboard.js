  // ===== GESTION DES ONGLETS =====
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      
      // Mettre à jour les onglets
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Afficher le bon contenu
      document.querySelectorAll('.mode-content').forEach(c => c.style.display = 'none');
      document.getElementById(`${mode}Mode`).style.display = 'block';
      
      // Si on passe sur l'onglet P2P, rafraîchir la liste
      if (mode === 'p2p' && window.p2pUsersManager) {
        window.p2pUsersManager.refresh();
      }
    });
  });

  // ===== APPELER UN UTILISATEUR P2P =====
  function callP2PUser(userId, userName, callType) {
    if (!window.p2pCallManager) {
      alert('❌ Gestionnaire d\'appels non initialisé');
      console.error('p2pCallManager is not defined');
      return;
    }
    
    console.log(`📞 Appel ${callType} vers ${userName} (${userId.slice(0, 8)})`);
    window.p2pCallManager.initiateCall(userId, userName, callType);
  }
  
  // Exposer globalement
  window.callP2PUser = callP2PUser;

  // ===== REJOINDRE APPEL VIDÉO DE GROUPE =====
  document.getElementById('joinVideoBtn')?.addEventListener('click', async () => {
    const roomId = document.getElementById('videoRoomInput').value.trim();
    const name = document.getElementById('videoNameInput').value.trim();
    
    if (!roomId || !name) {
      alert('⚠️ Veuillez entrer un nom de salle et votre nom');
      return;
    }
    
    if (typeof mediasoupClient === 'undefined') {
      alert('❌ Erreur: mediasoup-client non chargé');
      console.error('mediasoupClient is not defined');
      return;
    }
    
    try {
      const videoCall = new VideoCallManager(socket);
      videoCall.ui = new VideoCallUI(videoCall);
      const result = await videoCall.init(roomId, name);
      if (!result.success) alert('❌ Erreur: ' + result.error);
    } catch (error) {
      console.error('❌ Erreur appel vidéo:', error);
      alert('❌ Erreur: ' + error.message);
    }
  });

  // ===== REJOINDRE APPEL AUDIO DE GROUPE =====
  document.getElementById('joinAudioBtn')?.addEventListener('click', async () => {
    const roomId = document.getElementById('audioRoomInput').value.trim();
    const name = document.getElementById('audioNameInput').value.trim();
    
    if (!roomId || !name) {
      alert('⚠️ Veuillez entrer un nom de conférence et votre nom');
      return;
    }
    
    if (typeof mediasoupClient === 'undefined') {
      alert('❌ Erreur: mediasoup-client non chargé');
      console.error('mediasoupClient is not defined');
      return;
    }
    
    try {
      const audioCall = new AudioCallManager(socket);
      audioCall.ui = new AudioCallUI(audioCall);
      const result = await audioCall.init(roomId, name);
      if (!result.success) alert('❌ Erreur: ' + result.error);
    } catch (error) {
      console.error('❌ Erreur appel audio:', error);
      alert('❌ Erreur: ' + error.message);
    }
  });
