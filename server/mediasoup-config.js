// ========================================
// server/mediasoup-config.js
// Configuration mediasoup SFU - Vidéo et Audio
// ========================================

module.exports = {
  // Configuration Worker (processus C++)
  worker: {
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
  },
  
  // Configuration Router (gestion flux média)
  router: {
    mediaCodecs: [
      // Audio codec
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      // Vidéo codecs
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000
      }
    ]
  },
  
  // Configuration Transport WebRTC
  webRtcTransport: {
    listenIps: [
      { 
        ip: '0.0.0.0',
        announcedIp: null  // Auto-détection IP
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true
  }
};

// =============================================
// 📚 MON COURS : COMPRENDRE CETTE CONFIGURATION
// =============================================

/*
┌─────────────────────────────────────────────────────────────────┐
│                    1️⃣ SECTION WORKER                           │
└─────────────────────────────────────────────────────────────────┘

🔥 QU'EST-CE QU'UN WORKER ?
---------------------------
Un worker est un processus C++ qui fait tourner le moteur mediasoup.
C'est lui qui traite les flux audio/vidéo en temps réel.

📊 PARAMÈTRES :

rtcMinPort: 40000
rtcMaxPort: 49999
→ Plage de ports pour WebRTC (10 000 ports disponibles)
→ Chaque connexion utilise un port unique dans cette plage
→ 10 000 ports = plusieurs milliers de connexions possibles
→ ⚠️ Sur serveur public : ouvrir ces ports dans le firewall

logLevel: 'warn'
→ Niveaux disponibles : 'debug', 'warn', 'error', 'none'
→ 'warn' = recommandé en production (avertissements + erreurs)
→ 'debug' = utile pour déboguer les problèmes

logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
→ Quels types de logs afficher
→ 'ice'  : Connexion réseau (NAT, firewall)
→ 'dtls' : Chiffrement de la connexion
→ 'rtp'  : Transport des paquets média
→ 'srtp' : Transport chiffré
→ 'rtcp' : Statistiques de qualité


┌─────────────────────────────────────────────────────────────────┐
│                    2️⃣ SECTION ROUTER                           │
└─────────────────────────────────────────────────────────────────┘

🔥 QU'EST-CE QU'UN ROUTER ?
---------------------------
Un router = une "salle d'appel" dans mediasoup.
Il gère les codecs et route les flux entre participants.

📊 CODECS MÉDIA :

▶ Audio : Opus
---------------
kind: 'audio'
mimeType: 'audio/opus'
→ Opus = meilleur codec audio pour WebRTC
→ Faible latence, excellente qualité
→ Supporte voix ET musique

clockRate: 48000
→ 48 kHz = fréquence d'échantillonnage (qualité CD)
→ Standard professionnel

channels: 2
→ Stéréo (gauche + droite)
→ Pour mono : channels: 1 (économise 50% bande passante)

💾 Bande passante Opus :
- Mono   : 20-40 kbps
- Stéréo : 40-80 kbps


▶ Vidéo : VP8
---------------
kind: 'video'
mimeType: 'video/VP8'
→ Codec Google open source
→ Gratuit, pas de licence
→ Bon équilibre qualité/performance
→ Supporté par tous les navigateurs

clockRate: 90000
→ Standard fixe pour TOUS les codecs vidéo
→ Ne pas changer cette valeur

💾 Bande passante VP8 :
- 360p  : 300-500 kbps
- 720p  : 1-2 Mbps
- 1080p : 2-4 Mbps


▶ Vidéo : VP9
---------------
mimeType: 'video/VP9'
→ Version améliorée de VP8
→ Meilleure compression (-30% bande passante)
→ Meilleure qualité à débit égal
→ Plus gourmand en CPU

💾 Bande passante VP9 :
- 720p  : 700 kbps - 1.4 Mbps
- 1080p : 1.4-2.8 Mbps


▶ Vidéo : H264
---------------
mimeType: 'video/H264'
→ Codec le plus répandu
→ Excellent support matériel (GPU)
→ Décodage accéléré sur mobile
→ Safari fonctionne mieux avec H264

💾 Bande passante H264 :
- Similaire à VP8
- Mais moins de CPU grâce au hardware


🎯 NÉGOCIATION AUTOMATIQUE :
----------------------------
mediasoup et le client négocient automatiquement :
1. Client dit : "Je supporte VP8, VP9, H264"
2. Serveur choisit le meilleur disponible
3. Généralement : VP9 (desktop) ou H264 (mobile)


┌─────────────────────────────────────────────────────────────────┐
│                 3️⃣ SECTION WEBRTC TRANSPORT                    │
└─────────────────────────────────────────────────────────────────┘

🔥 QU'EST-CE QU'UN TRANSPORT ?
------------------------------
Un transport = une connexion WebRTC entre client et serveur.
Chaque participant a 2 transports :
- Transport SEND : envoie son audio/vidéo
- Transport RECV : reçoit les flux des autres

📊 PARAMÈTRES :

listenIps
---------
ip: '0.0.0.0'
→ Écoute sur toutes les interfaces réseau
→ Fonctionne pour IPv4 local ET public

announcedIp: null
→ Auto-détection de l'IP publique
→ Sur réseau local : utilise IP locale (192.168.x.x)
→ Sur serveur public : utilise IP publique

🌍 Pour serveur Internet :
listenIps: [
  {
    ip: '0.0.0.0',
    announcedIp: '203.0.113.1'  // Ton IP publique
  }
]

🏠 Pour réseau local (ton cas) :
→ Laisser null = parfait


enableUdp: true
enableTcp: true
preferUdp: true
----------------

🔥 UDP vs TCP :

UDP (User Datagram Protocol) :
✅ Très rapide, faible latence
✅ Parfait pour temps réel
❌ Peut perdre des paquets
→ Utilisé dans 95% des cas

TCP (Transmission Control Protocol) :
✅ Fiable, aucune perte
❌ Plus lent, latence élevée
→ Fallback si UDP bloqué (firewall d'entreprise)

preferUdp: true
→ Essaie UDP en premier
→ Si échec, utilise TCP automatiquement


┌─────────────────────────────────────────────────────────────────┐
│                     📊 RÉCAPITULATIF                            │
└─────────────────────────────────────────────────────────────────┘

Cette configuration dit à mediasoup :

1️⃣ WORKER
   ✅ Utilise les ports 40000-49999 pour WebRTC
   ✅ Log les avertissements et erreurs
   ✅ Affiche les détails de connexion (ICE, DTLS, RTP)

2️⃣ ROUTER
   ✅ Supporte Opus pour audio (stéréo, 48 kHz)
   ✅ Supporte VP8, VP9, H264 pour vidéo
   ✅ Négocie automatiquement le meilleur codec

3️⃣ TRANSPORT
   ✅ Écoute sur toutes les interfaces
   ✅ Détecte automatiquement l'IP
   ✅ UDP en priorité, TCP en fallback


┌─────────────────────────────────────────────────────────────────┐
│              🎯 POUR TON RÉSEAU LOCAL                           │
└─────────────────────────────────────────────────────────────────┘

✅ Cette config fonctionne PARFAITEMENT en l'état
✅ Pas besoin de modifier quoi que ce soit
✅ Pas besoin d'ouvrir de ports (tout en local)
✅ Clients se connectent via 192.168.2.97:40000-49999


┌─────────────────────────────────────────────────────────────────┐
│              🌍 POUR SERVEUR INTERNET (FUTUR)                   │
└─────────────────────────────────────────────────────────────────┘

Si tu veux rendre accessible depuis Internet :

1. Modifier announcedIp :
   announcedIp: 'ton-ip-publique'

2. Ouvrir les ports :
   sudo ufw allow 40000:49999/udp
   sudo ufw allow 40000:49999/tcp

3. Port forwarding sur le routeur :
   40000-49999 → IP locale serveur


┌─────────────────────────────────────────────────────────────────┐
│                   🚀 OPTIMISATIONS                              │
└─────────────────────────────────────────────────────────────────┘

Pour AUDIO SEULEMENT :
→ Retirer VP8, VP9, H264 (garder seulement Opus)
→ Réduit charge CPU

Pour VIDÉO HAUTE QUALITÉ :
→ Garder VP9 + H264 uniquement
→ Meilleure qualité, plus de CPU

Pour FAIBLE BANDE PASSANTE :
→ Garder VP8 uniquement
→ Compression rapide


┌─────────────────────────────────────────────────────────────────┐
│                   ❓ FAQ                                        │
└─────────────────────────────────────────────────────────────────┘

Q: Pourquoi 3 codecs vidéo ?
R: Compatibilité maximale. Safari préfère H264, Chrome préfère 
   VP9. mediasoup choisit automatiquement le meilleur.

Q: C'est quoi clockRate ?
R: Fréquence d'échantillonnage
   Audio : 48000 Hz (48 kHz) = qualité professionnelle
   Vidéo : 90000 Hz = standard fixe (ne pas changer)

Q: Pourquoi channels: 2 ?
R: Stéréo. Pour mono : channels: 1 (économise 50% bande passante)

Q: UDP est sécurisé ?
R: Oui ! WebRTC chiffre tout avec DTLS et SRTP.
   Aussi sécurisé que HTTPS.

Q: Combien de participants max ?
R: Dépend du serveur :
   - Serveur moyen : 20-50 (vidéo), 100+ (audio)
   - Serveur puissant : 100+ (vidéo), 500+ (audio)

Q: Dois-je modifier pour réseau local ?
R: NON. Cette config est parfaite telle quelle.


┌─────────────────────────────────────────────────────────────────┐
│              📖 POUR ALLER PLUS LOIN                            │
└─────────────────────────────────────────────────────────────────┘

Documentation officielle mediasoup :
https://mediasoup.org/documentation/

Comprendre les codecs vidéo :
https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Video_codecs

Comprendre WebRTC :
https://webrtc.org/getting-started/overview

*/