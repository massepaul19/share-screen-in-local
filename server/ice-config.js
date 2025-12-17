// server/ice-config.js
// Configuration des serveurs STUN/TURN pour WebRTC avec détection automatique de l'IP

const os = require('os');

/**
 * Détecte automatiquement l'IP locale de la machine
 * @returns {string} L'adresse IP locale (ex: 192.168.2.97)
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Parcourt toutes les interfaces réseau
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignore les adresses loopback (127.0.0.1) et IPv6
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`🌐 IP locale détectée: ${iface.address} (interface: ${name})`);
        return iface.address;
      }
    }
  }
  
  console.warn('⚠️  Aucune IP locale trouvée, utilisation de 127.0.0.1');
  return '127.0.0.1';
}

/**
 * Retourne la configuration ICE avec l'IP détectée automatiquement
 * @returns {Array} Liste des serveurs STUN/TURN
 */
function getICEServers() {
  const localIP = getLocalIP();
  
  return [
    // Serveurs STUN Google (gratuits et fiables)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // Serveur TURN local avec IP auto-détectée
    {
      urls: `turn:${localIP}:3478`,
      username: 'paolo',
      credential: 'massepaul',
      credentialType: 'password'
    },
    // TURN avec UDP explicite (meilleure performance)
    {
      urls: `turn:${localIP}:3478?transport=udp`,
      username: 'paolo',
      credential: 'massepaul',
      credentialType: 'password'
    },
    // TURN avec TCP (backup si UDP bloqué)
    {
      urls: `turn:${localIP}:3478?transport=tcp`,
      username: 'paolo',
      credential: 'massepaul',
      credentialType: 'password'
    }
  ];
}

module.exports = { getICEServers, getLocalIP };
