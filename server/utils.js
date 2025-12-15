// server/utils.js
const os = require('os');

// Obtenir toutes les IPs réseau
function getAllNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name in interfaces) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ 
          interface: name, 
          address: net.address 
        });
      }
    }
  }

  return addresses;
}

// Obtenir l'IP du client
function getClientIP(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address.replace('::ffff:', '');
}

// Détecter le navigateur
function detectBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('OPR') || userAgent.includes('Opera')) return 'Opera';
  
  return 'Other';
}

// Logger simple
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${message}`); // ✅ CORRIGÉ: parenthèses au lieu de backticks
}

// Afficher les infos du serveur
function displayServerInfo(protocol, port) {
  const allIPs = getAllNetworkIPs();
  
  console.clear();
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 SERVEUR DE PARTAGE D\'ÉCRAN MULTI-NAVIGATEURS');
  console.log('═'.repeat(80));
  
  if (protocol === 'https') {
    console.log('\n🔒 MODE HTTPS (Certificat auto-signé avec SAN)');
    console.log('✅ Compatible: Chrome, Firefox, Safari, Edge, Opera\n');
    console.log('⚠️  IMPORTANT: Acceptez le certificat au premier accès:\n');
    console.log('   Chrome/Edge : "Avancé" → "Continuer"');
    console.log('   Firefox     : "Avancé" → "Accepter le risque"');
    console.log('   Safari      : "Afficher détails" → "Visiter ce site"\n');
  } else {
    console.log('\n⚠️  MODE HTTP (Non sécurisé)\n');
  }

  console.log('📡 URLs D\'ACCÈS:\n');

  if (allIPs.length === 0) {
    console.log(`   ➜  ${protocol}://localhost:${port}\n`); // ✅ CORRIGÉ
  } else {
    allIPs.forEach(item => {
      const icon = item.interface.toLowerCase().includes('wi') || 
                   item.interface.toLowerCase().includes('wlan') ? '📶' : '🔌';
      console.log(`   ${icon}  ${item.interface.padEnd(20)} → ${protocol}://${item.address}:${port}`); // ✅ CORRIGÉ
    });
    console.log('');
  }

  console.log('🌐 NAVIGATEURS SUPPORTÉS:\n');
  console.log('   ✅ Chrome/Chromium (v60+)');
  console.log('   ✅ Firefox (v55+)');
  console.log('   ✅ Safari (v11+)');
  console.log('   ✅ Edge (v79+)');
  console.log('   ✅ Opera (v47+)');

  console.log('\n⚙️  CONFIGURATION:\n');
  console.log(`   Protocole : ${protocol.toUpperCase()}`); // ✅ CORRIGÉ
  console.log(`   Port      : ${port}`); // ✅ CORRIGÉ
  console.log(`   PID       : ${process.pid}`); // ✅ CORRIGÉ
  console.log(`   Node      : ${process.version}`); // ✅ CORRIGÉ

  console.log('\n' + '═'.repeat(80));
  console.log('✅ Serveur prêt !');
  console.log('═'.repeat(80) + '\n');
}

module.exports = {
  getAllNetworkIPs,
  getClientIP,
  detectBrowser,
  log,
  displayServerInfo
};
