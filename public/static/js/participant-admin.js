// ========================================
// public/static/js/participant-admin.js
// Gestionnaire d'affichage des participants avec fonctions d'administration
// ========================================

// Surcharge de la fonction renderParticipants de app.js
window.renderParticipantsAdmin = function(participants = []) {
  const listElement = document.getElementById('participantsList');
  if (!listElement) return;

  // Récupérer l'état depuis app.js (via window.state ou variable globale si accessible)
  // On suppose que 'state' et 'socket' sont accessibles globalement ou via une portée partagée
  // Si ce n'est pas le cas, il faudrait les passer en arguments.
  // Pour ce correctif, on suppose que le contexte d'exécution a accès à 'state' et 'socket'.
  
  // Note: Dans l'architecture actuelle, ce fichier est chargé après app.js, 
  // donc il peut accéder aux variables globales si elles sont définies.
  // Sinon, on utilise les variables passées implicitement par le contexte.
  
  const state = window.state;
  const socket = window.socket;
  const isMeAdmin = state.isAdmin || state.hostId === socket.id;

  const isMeHost = state.hostId === socket.id;

  listElement.className = `participants-list ${state.viewMode === 'grid' ? 'grid-view' : ''}`;

  let html = '';

  const host = participants.find(p => p.id === state.hostId);
  const others = participants.filter(p => p.id !== state.hostId);
  const raisedHands = others.filter(p => p.handRaised);
  const normalParticipants = others.filter(p => !p.handRaised);

  // 1. Section Mains Levées (Prioritaire)
  if (raisedHands.length > 0) {
    html += `<div class="section-label raised-hands-section">✋ Mains levées (${raisedHands.length})</div>`;
    raisedHands.forEach(p => html += buildParticipantCardAdmin(p, false, true, isMeAdmin));
  }

  // 2. Hôte
  if (host) {
    html += `<div class="section-label">👑 Hôte</div>`;
    html += buildParticipantCardAdmin(host, true, false, isMeAdmin);
  }

  // 3. Participants normaux
  if (normalParticipants.length > 0) {
    html += `<div class="section-label">Participants (${normalParticipants.length})</div>`;
    normalParticipants.forEach(p => html += buildParticipantCardAdmin(p, false, false, isMeAdmin));
  }

  listElement.innerHTML = html;
};

function buildParticipantCardAdmin(p, isHost, isHandRaised, isMeAdmin) {
  const [bg1, bg2] = window.stringToColorGradient(p.name || p.id);
  const initials = window.getInitials(p.name);
  const isMe = p.id === window.socket.id;
  const micIsOn = p.micOn !== false;

  // ===== BOUTONS D'ACTION =====
  let actionBar = '';

  if (isMeAdmin && !isMe) {
    // --- VUE HÔTE (sur les autres) : Contrôle total ---
    actionBar = `
      <div class="admin-action-bar">
        <!-- MICRO -->
        <button
          class="admin-btn ${micIsOn ? 'admin-btn--active' : 'admin-btn--muted'}"
          onclick="event.stopPropagation(); handleAdminMic('${p.id}', '${p.name.replace(/'/g, "\\'")}')"
          title="${micIsOn ? 'Couper le micro' : 'Autoriser le micro'}"
        >
          <i class="fa-solid ${micIsOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>
          <span>${micIsOn ? 'Micro' : 'Muet'}</span>
        </button>

        <!-- MAIN -->
        <button
          class="admin-btn ${isHandRaised ? 'admin-btn--hand' : 'admin-btn--disabled'}"
          onclick="event.stopPropagation(); handleAdminHand('${p.id}', '${p.name.replace(/'/g, "\\'")}')"
          title="${isHandRaised ? 'Baisser la main' : 'Aucune main levée'}"
          ${!isHandRaised ? 'disabled' : ''}
        >
          <i class="fa-solid fa-hand"></i>
          <span>${isHandRaised ? 'Baisser' : 'Main'}</span>
        </button>

        <!-- MESSAGE -->
        <button
          class="admin-btn admin-btn--msg"
          onclick="event.stopPropagation(); window.chatManager?.initiatePrivateChat('${p.id}', '${p.name.replace(/'/g, "\\'")}')"
          title="Message privé"
        >
          <i class="fa-regular fa-comment-dots"></i>
          <span>Message</span>
        </button>
      </div>
    `;
  } else {
    // --- VUE STANDARD (Moi ou Participant sur les autres) : Message uniquement ---
    actionBar = `
      <div class="admin-action-bar" style="justify-content: flex-end;">
        <button
          class="admin-btn admin-btn--msg"
          onclick="event.stopPropagation(); window.chatManager?.initiatePrivateChat('${p.id}', '${p.name.replace(/'/g, "\\'")}')"
          title="Message privé"
          style="flex: 0 0 auto; width: auto; padding: 5px 12px;"
        >
          <i class="fa-regular fa-comment-dots"></i>
          <span>Message</span>
        </button>
      </div>
    `;
  }

  return `
    <div class="participant-card
      ${isHost ? 'is-host' : ''}
      ${isHandRaised ? 'hand-raised-item' : ''}
      ${isMe ? 'is-me' : ''}
      ${isMeAdmin && !isMe ? 'has-admin' : ''}
    ">
      <div class="p-avatar" style="background: linear-gradient(135deg, ${bg1}, ${bg2})">
        ${initials}
        ${isHandRaised ? '<div class="hand-badge">✋</div>' : '<div class="status-dot"></div>'}
      </div>
      <div class="p-info">
        <div class="p-name">
          ${p.name}
          ${isMe ? '<span class="me-tag">Vous</span>' : ''}
          ${isHost ? '<i class="fa-solid fa-crown" style="color:#f59e0b;font-size:10px;margin-left:4px"></i>' : ''}
        </div>
        <div class="p-status-row">
          <span class="p-status ${isHost && state.isSharing ? 'sharing' : ''}">
            ${isHost && state.isSharing ? '📺 Partage' : '🟢 Connecté'}
          </span>
        </div>
      </div>
      ${actionBar}
    </div>
  `;
}