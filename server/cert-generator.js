// server/cert-generator.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAllNetworkIPs } = require('./utils');

function generateSelfSignedCert() {
  const certDir = path.join(__dirname, '../certs');
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.cert');
  const configPath = path.join(certDir, 'openssl.cnf');

  // Vérifier si certificats existent
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('✅ Certificats trouvés');
    return { key: keyPath, cert: certPath };
  }

  // Créer dossier certs
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  console.log('🔐 Génération du certificat SSL...');

  try {
    const allIPs = getAllNetworkIPs();
    
    // Créer SAN pour tous les IPs
    const sanList = [
      'DNS:localhost',
      'IP:127.0.0.1',
      ...allIPs.map(ip => `IP:${ip.address}`)
    ].join(',');

    // Configuration OpenSSL
    const opensslConfig = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=CM
ST=Centre
L=Yaounde
O=ScreenShare
CN=localhost

[v3_req]
subjectAltName = ${sanList}
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth
`;

    fs.writeFileSync(configPath, opensslConfig);

    // Générer certificat
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 ` +
      `-keyout "${keyPath}" -out "${certPath}" ` +
      `-config "${configPath}" -extensions v3_req`,
      { stdio: 'ignore' }
    );

    // Nettoyer
    fs.unlinkSync(configPath);

    console.log('✅ Certificat généré avec SAN multi-navigateurs');
    return { key: keyPath, cert: certPath };

  } catch (err) {
    console.error('❌ Erreur génération certificat:', err.message);
    console.log('\n⚠️  OpenSSL requis. Installation:');
    console.log('   Windows: https://slproweb.com/products/Win32OpenSSL.html');
    console.log('   Mac: brew install openssl');
    console.log('   Linux: sudo apt install openssl\n');
    return null;
  }
}

module.exports = { generateSelfSignedCert };