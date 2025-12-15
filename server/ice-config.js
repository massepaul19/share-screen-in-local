// server/ice-config.js
// Configuration des serveurs STUN/TURN pour WebRTC

function getICEServers() {
  return [
    // Serveurs STUN Google (gratuits et fiables)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
    
    // Pour ajouter un serveur TURN (si vous en avez un):
    // {
    //   urls: 'turn:votre-serveur-turn.com:3478',
    //   username: 'votre-username',
    //   credential: 'votre-password'
    // }
  ];
}

module.exports = { getICEServers };