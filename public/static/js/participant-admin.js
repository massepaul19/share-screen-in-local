// ========================================
// public/static/js/participant-admin.js
// Gestionnaire des participants + administration des micros
// ========================================

// ============================================================
//  GESTIONNAIRE DE NOTIFICATIONS DE MESSAGES PRIVÉS
//  Persiste même après avoir navigué vers autre chose
// ============================================================

window.privateMessageNotifications = window.privateMessageNotifications || {};

/**
 * Enregistre une notification de message privé non lu.
 * Appelé depuis ChatManager quand un message privé arrive et que le chat n'est pas ouvert.
 */
window.registerPrivateMessageNotif = function(fromId, fromName, messagePreview) {
  if (!window.privateMessageNotifications[fromId]) {
    window.privateMessageNotifications[fromId] = { name: fromName, count: 0, preview: '' };
  }
  window.privateMessageNotifications[fromId].count++;
  window.privateMessageNotifications[fromId].preview = messagePreview || '...';

  // Rafraîchir la liste si elle est visible
  const state  = window.state;
  const socket = window.socket;
  if (state && socket && state.participants) {
    window.renderParticipantsAdmin(state.participants);
  }

  // Afficher le toast flottant
  showPrivateMsgToast(fromId, fromName, messagePreview);
};

/**
 * Efface les notifications d'un utilisateur (quand on ouvre son chat).
 */
window.clearPrivateMessageNotif = function(userId) {
  if (window.privateMessageNotifications[userId]) {
    delete window.privateMessageNotifications[userId];
    const state  = window.state;
    const socket = window.socket;
    if (state && socket && state.participants) {
      window.renderParticipantsAdmin(state.participants);
    }
  }
  // Supprimer le badge global du bouton panneau participants s'il n'y a plus rien
  updateGlobalMsgBadge();
};

/**
 * Met à jour le badge global sur le bouton d'ouverture du panneau participants.
 */
function updateGlobalMsgBadge() {
  const totalUnread = Object.values(window.privateMessageNotifications)
    .reduce((sum, n) => sum + n.count, 0);

  let badge = document.getElementById('globalMsgBadge');
  const btnParticipants = document.getElementById('btnParticipants') || document.querySelector('[data-panel="participants"]');

  if (totalUnread > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'globalMsgBadge';
      badge.style.cssText = `
        position:absolute;top:-4px;right:-4px;
        background:#ef4444;color:white;
        border-radius:50%;width:18px;height:18px;
        font-size:10px;font-weight:700;
        display:flex;align-items:center;justify-content:center;
        pointer-events:none;z-index:10;
      `;
      if (btnParticipants) {
        btnParticipants.style.position = 'relative';
        btnParticipants.appendChild(badge);
      }
    }
    badge.textContent = totalUnread > 9 ? '9+' : totalUnread;
  } else {
    badge?.remove();
  }
}

/**
 * Toast cliquable pour un message privé.
 */
function showPrivateMsgToast(fromId, fromName, preview) {
  // Supprimer un éventuel toast du même utilisateur déjà présent
  document.getElementById(`pmToast-${fromId}`)?.remove();

  const el = document.createElement('div');
  el.id = `pmToast-${fromId}`;
  el.style.cssText = `
    position:fixed;bottom:110px;right:20px;
    background:rgba(30,41,59,0.97);color:white;
    padding:12px 16px;border-radius:12px;
    font-size:13px;font-weight:500;z-index:10000;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    cursor:pointer;max-width:280px;
    border-left:3px solid #7c3aed;
    animation:slideInRight 0.3s ease;
  `;

  const notif = window.privateMessageNotifications[fromId];
  const count = notif ? notif.count : 1;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <i class="fa-regular fa-comment-dots" style="color:#7c3aed;font-size:16px;flex-shrink:0;"></i>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">
          💬 ${fromName}
          ${count > 1 ? `<span style="background:#7c3aed;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px;">${count}</span>` : ''}
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.65);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${preview || '...'}
        </div>
      </div>
      <button onclick="event.stopPropagation();this.parentElement.parentElement.remove();"
        style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:16px;line-height:1;flex-shrink:0;">✕</button>
    </div>
  `;

  // Clic → ouvrir le chat privé
  el.addEventListener('click', () => {
    el.remove();
    window.clearPrivateMessageNotif(fromId);
    window.chatManager?.initiatePrivateChat(fromId, fromName);
  });

  document.body.appendChild(el);

  // Injecter l'animation si pas déjà présente
  if (!document.getElementById('pmToastStyle')) {
    const style = document.createElement('style');
    style.id = 'pmToastStyle';
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(120%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-disparition après 8 secondes
  setTimeout(() => el?.remove(), 8000);

  // Mettre à jour le badge global
  updateGlobalMsgBadge();
}

// ============================================================
//  HANDLERS D'ADMINISTRATION (appelés depuis les boutons HTML)
// ============================================================

window.handleAdminMic = function(targetId, targetName) {
  const socket = window.socket;
  const state  = window.state;
  if (!socket || !state) return;

  const participants = state.participants || [];
  const participant  = participants.find(p => p.id === targetId);
  const micIsOn      = participant ? participant.micOn !== false : true;

  if (micIsOn) {
    socket.emit('mute-user', { targetId });
    showAdminToast(`🔇 Micro de ${targetName} coupé`);
  } else {
    socket.emit('allow-mic', { targetId });
    showAdminToast(`🎤 Micro de ${targetName} autorisé`);
  }
};

window.handleAdminHand = function(targetId, targetName) {
  const socket = window.socket;
  if (!socket) return;
  socket.emit('lower-hand', { targetId });
  showAdminToast(`✋ Main de ${targetName} baissée`);
};

window.handleMuteAll = function() {
  const socket = window.socket;
  if (!socket) return;
  socket.emit('mute-all');
  showAdminToast('🔇 Tous les micros ont été coupés');
};

window.handleUnmuteAll = function() {
  const socket = window.socket;
  if (!socket) return;
  socket.emit('unmute-all');
  showAdminToast('🎤 Tous les micros ont été réactivés');
};

function showAdminToast(msg) {
  document.getElementById('adminToast')?.remove();
  const el = document.createElement('div');
  el.id = 'adminToast';
  el.style.cssText = `
    position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
    background:rgba(30,41,59,0.95);color:white;
    padding:10px 18px;border-radius:8px;
    font-size:13px;font-weight:500;z-index:9999;
    box-shadow:0 4px 16px rgba(0,0,0,0.3);
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 3000);
}

// ============================================================
//  BANDEAU "COUPER TOUS / ACTIVER TOUS" dans le panneau Participants
// ============================================================

window.injectAdminBanner = function() {
  if (document.getElementById('adminMuteBanner')) return;

  const panelHeader = document.querySelector('#participantsPanel .panel-header');
  if (!panelHeader) return;

  const banner = document.createElement('div');
  banner.id = 'adminMuteBanner';
  banner.style.cssText = `
    display:flex;gap:8px;padding:8px 12px;
    background:rgba(124,58,237,0.08);
    border-bottom:1px solid rgba(124,58,237,0.15);
    align-items:center;flex-wrap:wrap;
  `;
  banner.innerHTML = `
    <span style="font-size:12px;font-weight:600;color:#7c3aed;flex:1;">
      <i class="fa-solid fa-shield-halved"></i> Contrôles hôte
    </span>
    <button onclick="window.handleMuteAll()" style="
      background:#ef4444;color:white;border:none;border-radius:6px;
      padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;
      display:flex;align-items:center;gap:4px;
    " title="Couper tous les micros">
      <i class="fa-solid fa-microphone-slash"></i> Couper tous
    </button>
    <button onclick="window.handleUnmuteAll()" style="
      background:#10b981;color:white;border:none;border-radius:6px;
      padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;
      display:flex;align-items:center;gap:4px;
    " title="Autoriser tous les micros">
      <i class="fa-solid fa-microphone"></i> Activer tous
    </button>
  `;
  panelHeader.insertAdjacentElement('afterend', banner);
};

window.removeAdminBanner = function() {
  document.getElementById('adminMuteBanner')?.remove();
};

// ============================================================
//  RENDU DE LA LISTE DES PARTICIPANTS
// ============================================================

window.renderParticipantsAdmin = function(participants = []) {
  const listElement = document.getElementById('participantsList');
  if (!listElement) return;

  const state  = window.state;
  const socket = window.socket;
  if (!state || !socket) return;

  const isMeAdmin = !!(state.isAdmin || state.hostId === socket.id);

  listElement.className = `participants-list ${state.viewMode === 'grid' ? 'grid-view' : ''}`;

  let html = '';
  const host               = participants.find(p => p.id === state.hostId);
  const others             = participants.filter(p => p.id !== state.hostId);
  const raisedHands        = others.filter(p => p.handRaised);
  const normalParticipants = others.filter(p => !p.handRaised);

  if (raisedHands.length > 0) {
    html += `<div class="section-label raised-hands-section">✋ Mains levées (${raisedHands.length})</div>`;
    raisedHands.forEach(p => { html += buildParticipantCardAdmin(p, false, true, isMeAdmin, state); });
  }
  if (host) {
    html += `<div class="section-label">👑 Hôte</div>`;
    html += buildParticipantCardAdmin(host, true, false, isMeAdmin, state);
  }
  if (normalParticipants.length > 0) {
    html += `<div class="section-label">Participants (${normalParticipants.length})</div>`;
    normalParticipants.forEach(p => { html += buildParticipantCardAdmin(p, false, false, isMeAdmin, state); });
  }

  listElement.innerHTML = html;

  // Mettre à jour le badge global après chaque rendu
  updateGlobalMsgBadge();
};

// ============================================================
//  CONSTRUCTION D'UNE CARTE PARTICIPANT
// ============================================================

function buildParticipantCardAdmin(p, isHost, isHandRaised, isMeAdmin, state) {
  if (!window.stringToColorGradient || !window.getInitials || !window.socket) return '';

  const [bg1, bg2] = window.stringToColorGradient(p.name || p.id);
  const initials   = window.getInitials(p.name);
  const isMe       = p.id === window.socket.id;
  const micIsOn    = p.micOn !== false;

  // --- Notifications de message privé ---
  const notif       = window.privateMessageNotifications[p.id];
  const unreadCount = notif ? notif.count : 0;
  const notifBadge  = unreadCount > 0
    ? `<span class="pm-badge" style="
        display:inline-flex;align-items:center;justify-content:center;
        background:#ef4444;color:white;border-radius:50%;
        width:18px;height:18px;font-size:10px;font-weight:700;
        margin-left:4px;vertical-align:middle;flex-shrink:0;
      ">${unreadCount > 9 ? '9+' : unreadCount}</span>`
    : '';

  // --- Barre d'actions admin ---
  let actionBar = '';

  if (isMeAdmin && !isMe) {
    // Bouton micro individuel (toggle mute/unmute)
    const micBtnClass  = micIsOn ? 'admin-btn--active' : 'admin-btn--muted';
    const micBtnTitle  = micIsOn ? 'Couper le micro' : 'Autoriser le micro';
    const micBtnIcon   = micIsOn ? 'fa-microphone' : 'fa-microphone-slash';
    const micBtnLabel  = micIsOn ? 'Micro' : 'Muet';

    // Bouton main
    const handBtnClass = isHandRaised ? 'admin-btn--hand' : 'admin-btn--disabled';
    const handBtnTitle = isHandRaised ? 'Baisser la main' : 'Aucune main levée';
    const handDisabled = !isHandRaised ? 'disabled' : '';

    // Bouton message (avec badge si non-lu)
    const msgBtnLabel  = unreadCount > 0
      ? `Msg <span style="background:#ef4444;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;">${unreadCount > 9 ? '9+' : unreadCount}</span>`
      : 'Msg';

    actionBar = `
      <div class="admin-action-bar">
        <button class="admin-btn ${micBtnClass}"
          onclick="event.stopPropagation();window.handleAdminMic('${p.id}','${p.name.replace(/'/g,"\\'")}')"
          title="${micBtnTitle}">
          <i class="fa-solid ${micBtnIcon}"></i>
          <span>${micBtnLabel}</span>
        </button>
        <button class="admin-btn ${handBtnClass}"
          onclick="event.stopPropagation();window.handleAdminHand('${p.id}','${p.name.replace(/'/g,"\\'")}')"
          title="${handBtnTitle}" ${handDisabled}>
          <i class="fa-solid fa-hand"></i>
          <span>${isHandRaised ? 'Baisser' : 'Main'}</span>
        </button>
        <button class="admin-btn admin-btn--msg ${unreadCount > 0 ? 'has-notif' : ''}"
          onclick="event.stopPropagation();window.clearPrivateMessageNotif('${p.id}');window.chatManager?.initiatePrivateChat('${p.id}','${p.name.replace(/'/g,"\\'")}')"
          title="Message privé${unreadCount > 0 ? ` (${unreadCount} non lu${unreadCount > 1 ? 's' : ''})` : ''}">
          <i class="fa-regular fa-comment-dots"></i>
          <span>${msgBtnLabel}</span>
        </button>
      </div>`;
  } else {
    // Pas admin : juste le bouton message (avec badge si non-lu)
    const msgLabel = unreadCount > 0
      ? `Message <span style="background:#ef4444;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;">${unreadCount > 9 ? '9+' : unreadCount}</span>`
      : 'Message';

    actionBar = `
      <div class="admin-action-bar" style="justify-content:flex-end;">
        <button class="admin-btn admin-btn--msg ${unreadCount > 0 ? 'has-notif' : ''}"
          onclick="event.stopPropagation();window.clearPrivateMessageNotif('${p.id}');window.chatManager?.initiatePrivateChat('${p.id}','${p.name.replace(/'/g,"\\'")}')"
          title="Message privé" style="flex:0 0 auto;width:auto;padding:5px 12px;">
          <i class="fa-regular fa-comment-dots"></i>
          <span>${msgLabel}</span>
        </button>
      </div>`;
  }

  // --- Indicateur micro inline ---
  const micIcon = micIsOn
    ? '<i class="fa-solid fa-microphone"    style="color:#10b981;font-size:10px"></i>'
    : '<i class="fa-solid fa-microphone-slash" style="color:#ef4444;font-size:10px"></i>';

  return `
    <div class="participant-card
        ${isHost        ? 'is-host'        : ''}
        ${isHandRaised  ? 'hand-raised-item': ''}
        ${isMe          ? 'is-me'           : ''}
        ${isMeAdmin && !isMe ? 'has-admin' : ''}
        ${unreadCount > 0 ? 'has-unread'   : ''}"
      ${!isMe
        ? `onclick="window.clearPrivateMessageNotif('${p.id}');window.chatManager?.initiatePrivateChat('${p.id}', '${p.name.replace(/'/g, "\\'")}')"` 
        : ''}>
      <div class="p-avatar" style="background:linear-gradient(135deg,${bg1},${bg2})">
        ${initials}
        ${isHandRaised ? '<div class="hand-badge">✋</div>' : '<div class="status-dot"></div>'}
      </div>
      <div class="p-info">
        <div class="p-name" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <span>${p.name}</span>
          ${isMe   ? '<span class="me-tag">Vous</span>' : ''}
          ${isHost ? '<i class="fa-solid fa-crown" style="color:#f59e0b;font-size:10px;"></i>' : ''}
          ${notifBadge}
        </div>
        <div class="p-status-row">
          <span class="p-status ${isHost && state.isSharing ? 'sharing' : ''}">
            ${isHost && state.isSharing ? '📺 Partage' : '🟢 Connecté'}
          </span>
          <span class="mic-status-inline" style="margin-left:6px;">
            ${micIcon}
          </span>
        </div>
        ${notif ? `<div style="font-size:10px;color:#7c3aed;font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">💬 ${notif.preview}</div>` : ''}
      </div>
      ${actionBar}
    </div>`;
}
