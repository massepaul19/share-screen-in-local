# 🎥 ESTLC SHARE SCREEN

Application web permettant de partager un écran avec plusieurs utilisateurs sur un **réseau local sans connexion internet**.

---

## 📋 Table des matières

1. [Auteur](#auteur)
2. [Vue d'ensemble](#vue-densemble)
3. [Comment ça fonctionne](#comment-ça-fonctionne)
4. [Architecture technique](#architecture-technique)
5. [Installation](#installation)
6. [Utilisation](#utilisation)
7. [Dépannage](#dépannage)

---

## 🎯 Vue d'ensemble

### Qu'est-ce que c'est ?

Une application web pour le partage d'écran en temps réel qui fonctionne **100% en local** :
- ✅ Une seule URL pour tous les participants
- ✅ Partage d'écran en temps réel
- ✅ Blocage automatique (une seule personne partage à la fois)
- ✅ Notifications en temps réel
- ✅ Pas besoin d'internet
- ✅ **Audio Mesh P2P** : Discussion vocale entre tous les participants
- ✅ **Modération** : L'hôte peut couper les micros et gérer les mains levées
- ✅ **Chat Privé & Public** : Messagerie complète avec envoi de fichiers
- ✅ **Prise de Notes** : Éditeur intégré avec export PDF et dictée vocale
- ✅ Pas de base de données

### Cas d'usage

- 📊 Présentations en salle de réunion
- 🏫 Cours/formations en local
- 🎮 Partage de jeux/démonstrations
- 💼 Réunions d'équipe sans cloud
- 🔒 Partage sécurisé en réseau privé

---

## 🔧 Comment ça fonctionne

### Architecture globale

```
┌─────────────────────────────────────────────────────────────┐
│                    RÉSEAU LOCAL (LAN)                       │
│                                                             │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│  │  Jean    │      │  Marie   │      │  Paul    │        │
│  │ (Hôte)   │      │(Viewer)  │      │(Viewer)  │        │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘        │
│       │                 │                   │              │
│       │    WebSocket    │    WebSocket     │              │
│       └─────────┬───────┴──────────┬───────┘              │
│                 │                  │                       │
│           ┌─────▼──────────────────▼─────┐                │
│           │   SERVEUR Node.js            │                │
│           │   (192.168.1.10:3000)        │                │
│           │   - Socket.io (signaling)    │                │
│           │   - Express (web server)     │                │
│           └──────────────────────────────┘                │
│                                                             │
│  Après connexion initiale :                                │
│                                                             │
│  ┌──────────┐                                              │
│  │  Jean    │  ════════════════════════════>              │
│  │ (Hôte)   │     WebRTC P2P (vidéo)                      │
│  └──────────┘                            │                 │
│                                          │                 │
│                          ┌───────────────▼──────────────┐  │
│                          │  Marie & Paul                 │  │
│                          │  (Reçoivent directement)      │  │
│                          └───────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Flux détaillé - Étape par étape

#### **Phase 1 : Démarrage du serveur**

```bash
$ npm start

╔═══════════════════════════════════════════════════════════════╗
║  🚀 SERVEUR DE PARTAGE D'ÉCRAN - RÉSEAU LOCAL                ║
╚═══════════════════════════════════════════════════════════════╝

📡 URLs D'ACCÈS :
   📶  Wi-Fi     → http://192.168.1.10:3000
   🔌  Ethernet  → http://192.168.43.1:3000
```

**Ce qui se passe :**
1. Le serveur écoute sur `0.0.0.0:3000` (toutes les interfaces réseau)
2. Il affiche toutes les adresses IP disponibles (WiFi, Ethernet, etc.)
3. Il initialise Socket.io pour la communication temps réel

---

#### **Phase 2 : Connexion des utilisateurs**

```
JEAN ouvre http://192.168.1.10:3000
↓
1. Navigateur télécharge index.html
2. Socket.io se connecte au serveur
3. Serveur envoie l'état actuel :
   {
     isSharing: false,
     hostName: null,
     connectedUsers: 0
   }
4. Jean voit : "Prêt à démarrer"
```

```
MARIE ouvre http://192.168.1.10:3000
↓
1. Socket.io se connecte
2. Serveur envoie l'état : isSharing: false
3. Serveur notifie : "2 utilisateurs connectés"
```

```
PAUL ouvre http://192.168.1.10:3000
↓
Même processus
Serveur notifie : "3 utilisateurs connectés"
```

**Terminal serveur :**
```
[10:30:15] 🟢 CONNEXION | Socket: abc123 | IP: 192.168.1.10
[10:30:15] 👤 REGISTER | Jean (192.168.1.10)
[10:30:20] 🟢 CONNEXION | Socket: def456 | IP: 192.168.1.15
[10:30:20] 👤 REGISTER | Marie (192.168.1.15)
[10:30:25] 🟢 CONNEXION | Socket: ghi789 | IP: 192.168.1.20
[10:30:25] 👤 REGISTER | Paul (192.168.1.20)
```

---

#### **Phase 3 : Jean décide de partager**

```
JEAN clique sur "Partager mon écran"
↓
1. Navigateur demande : "Choisir l'écran à partager"
   - Écran entier
   - Fenêtre spécifique
   - Onglet navigateur

2. Jean sélectionne "Écran entier"

3. JavaScript capture le stream :
   localStream = getDisplayMedia({
     video: { cursor: 'always' },
     audio: false
   })

4. Événement envoyé au serveur :
   socket.emit('request-share', { name: 'Jean' })
```

**Serveur reçoit la demande :**
```javascript
// Vérification : quelqu'un partage déjà ?
if (globalState.isSharing) {
  // ❌ Refuser
  socket.emit('share-blocked')
} else {
  // ✅ Accepter
  globalState.isSharing = true
  globalState.hostSocketId = socket.id
  globalState.hostName = 'Jean'
  
  // Confirmer à Jean
  socket.emit('share-approved')
  
  // Notifier les autres
  socket.broadcast.emit('host-started-sharing', {
    hostName: 'Jean',
    hostId: socket.id
  })
}
```

**Terminal serveur :**
```
[10:31:00] 🎥 SHARE START | Jean commence à partager
```

---

#### **Phase 4 : Établissement des connexions WebRTC**

**Jean (Hôte) → Marie (Spectateur)**

```
1. Jean crée une connexion WebRTC :
   peerConnection = new RTCPeerConnection({
     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
   })

2. Jean ajoute son stream vidéo :
   localStream.getTracks().forEach(track => {
     peerConnection.addTrack(track, localStream)
   })

3. Jean crée une OFFRE :
   offer = await peerConnection.createOffer()
   await peerConnection.setLocalDescription(offer)

4. Jean envoie l'offre via Socket.io :
   socket.emit('webrtc-offer', {
     to: 'marie-socket-id',
     offer: offer
   })

5. Serveur transfère l'offre :
   io.to('marie-socket-id').emit('webrtc-offer', {
     from: 'jean-socket-id',
     offer: offer
   })

6. Marie reçoit l'offre :
   - Crée sa propre RTCPeerConnection
   - Applique l'offre : setRemoteDescription(offer)
   - Crée une RÉPONSE : createAnswer()
   - Envoie la réponse via Socket.io

7. Jean reçoit la réponse :
   - Applique la réponse : setRemoteDescription(answer)

8. Échange de ICE candidates :
   - Jean : "Je suis accessible sur 192.168.1.10:xxxxx"
   - Marie : "Je suis accessible sur 192.168.1.15:xxxxx"
   - Chacun ajoute les candidates de l'autre

9. WebRTC établit la connexion P2P :
   Jean (192.168.1.10) ═══════> Marie (192.168.1.15)
   
10. Le stream vidéo passe directement :
    peerConnection.ontrack = (event) => {
      videoElement.srcObject = event.streams[0]
    }
```

**Marie voit maintenant l'écran de Jean en temps réel !** ✨

**Le même processus se répète pour Paul.**

---

#### **Phase 5 : État pendant le partage**

**Chez Jean (Hôte) :**
```
┌─────────────────────────────────┐
│ 🎥 Vous partagez votre écran    │
│ 👥 2 spectateur(s)              │
│ [⏹️ Arrêter le partage]         │
└─────────────────────────────────┘
│                                 │
│  [Aperçu de son écran]          │
│                                 │
└─────────────────────────────────┘
```

**Chez Marie et Paul (Spectateurs) :**
```
┌─────────────────────────────────┐
│ 👁️ Jean partage                 │
│ [🎥 Partager mon écran] ❌ Bloqué│
└─────────────────────────────────┘
│                                 │
│  [Écran de Jean en direct]      │
│                                 │
└─────────────────────────────────┘
```

**Important :** Le bouton "Partager" est **DÉSACTIVÉ** pour Marie et Paul tant que Jean partage.

---

#### **Phase 6 : Jean arrête le partage**

```
Jean clique sur "Arrêter le partage"
↓
1. JavaScript arrête le stream :
   localStream.getTracks().forEach(track => track.stop())

2. Ferme la connexion WebRTC :
   peerConnection.close()

3. Envoie au serveur :
   socket.emit('stop-share')

4. Serveur met à jour l'état :
   globalState.isSharing = false
   globalState.hostSocketId = null
   globalState.hostName = null

5. Serveur notifie TOUT LE MONDE :
   io.emit('host-stopped-sharing', {
     message: 'Jean a arrêté le partage'
   })

6. Marie et Paul reçoivent la notification :
   - Affichage : "Jean a arrêté le partage"
   - Bouton "Partager" se RÉACTIVE
   - Retour à l'écran vide
```

**Terminal serveur :**
```
[10:35:00] ⏹️ SHARE STOP | Jean a arrêté le partage
```

**Maintenant Marie ou Paul peuvent cliquer sur "Partager" à leur tour !**

#### **Phase 7 : Fonctionnalités Avancées**

1. **Audio & Modération** :
   - Tout le monde peut parler (Mesh Audio).
   - L'hôte voit qui parle et peut couper les micros.
   - Les participants peuvent lever la main ✋ pour demander la parole.

2. **Prise de Notes** :
   - Chaque participant a son bloc-notes personnel.
   - Export en PDF avec en-tête du cours.
   - Sauvegarde automatique locale.

---

## 🏗️ Architecture technique

### Stack technologique

```
┌─────────────────────────────────────┐
│           FRONTEND                  │
│  ┌─────────────────────────────┐   │
│  │  HTML5 + CSS3 + JavaScript  │   │
│  │  - Interface utilisateur     │   │
│  │  - WebRTC APIs              │   │
│  │  - Socket.io Client         │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
                 ▲
                 │ HTTP + WebSocket
                 ▼
┌─────────────────────────────────────┐
│           BACKEND                   │
│  ┌─────────────────────────────┐   │
│  │  Node.js + Express          │   │
│  │  - Serveur web              │   │
│  │  - API REST                 │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  Socket.io Server           │   │
│  │  - Communication temps réel │   │
│  │  - Signaling WebRTC         │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
                 ▲
                 │ État en mémoire
                 ▼
┌─────────────────────────────────────┐
│      ÉTAT GLOBAL (RAM)              │
│  {                                  │
│    isSharing: boolean,              │
│    hostSocketId: string,            │
│    hostName: string,                │
│    connectedUsers: Map              │
│  }                                  │
└─────────────────────────────────────┘
```

### Technologies utilisées

| Technologie | Rôle | Pourquoi |
|-------------|------|----------|
| **Node.js** | Runtime JavaScript côté serveur | Léger, performant, asynchrone |
| **Express** | Framework web | Servir les fichiers HTML/CSS/JS |
| **Socket.io** | Communication temps réel | WebSocket pour notifications instantanées |
| **WebRTC** | Streaming vidéo P2P | Connexion directe sans passer par le serveur |
| **HTML5** | Interface utilisateur | Standard web |
| **CSS3** | Style et animations | Interface moderne |
| **JavaScript (Vanilla)** | Logique frontend | Pas de framework lourd |

### Pas de base de données

```
❌ MySQL / PostgreSQL / MongoDB
✅ Tout en mémoire (RAM)

Pourquoi ?
- Application temporaire (session)
- Pas besoin de persistance
- Plus rapide
- Plus simple
- Redémarrage = état réinitialisé
```

---

## 🚀 Installation

### Prérequis

```bash
# Vérifier Node.js (version 14+)
node --version

# Si pas installé :
# https://nodejs.org/ (version LTS)
```

### Installation en 5 minutes

```bash
# 1. Créer le projet
mkdir partage-ecran-local
cd partage-ecran-local

# 2. Créer la structure
mkdir public

# 3. Créer package.json
cat > package.json << 'EOF'
{
  "name": "partage-ecran-local",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1"
  }
}
EOF

# 4. Copier server.js (voir artifact)
# 5. Copier public/index.html (voir artifact)

# 6. Installer les dépendances
npm install

# 7. Démarrer
npm start
```

### Structure du projet

```
partage-ecran-local/
├── server.js           ← Serveur Node.js (backend)
├── package.json        ← Configuration npm
├── package-lock.json   ← Dépendances verrouillées
├── node_modules/       ← Bibliothèques (auto-généré)
└── public/
    └── index.html      ← Interface web (frontend)
```

---

## 📱 Utilisation

### Démarrage

```bash
npm start
```

### Partager l'URL

**Le serveur affiche :**
```
📡 URLs D'ACCÈS :
   📶  Wi-Fi     → http://192.168.1.10:3000
   🔌  Ethernet  → http://192.168.43.1:3000
```

**Partagez cette URL à tous les participants** (écrivez-la au tableau, envoyez par chat, etc.)

### Scénario d'utilisation

```
🏢 SALLE DE RÉUNION

1. Responsable lance le serveur sur son laptop
   → Obtient : http://192.168.1.10:3000

2. Écrit l'URL au tableau ou projecteur

3. Chaque participant ouvre l'URL :
   - Laptop A : http://192.168.1.10:3000
   - Laptop B : http://192.168.1.10:3000
   - Tablette : http://192.168.1.10:3000
   - Téléphone : http://192.168.1.10:3000

4. Celui qui présente clique "Partager mon écran"
   → Sélectionne sa présentation PowerPoint
   → Tout le monde voit !

5. Quand il termine, il clique "Arrêter"
   → Un autre peut prendre le relais
```

### Raccourcis clavier

- **F11** : Plein écran (recommandé pour projection)
- **Ctrl + R** : Rafraîchir la page
- **Esc** : Sortir du plein écran

---

## 🔧 Dépannage

### ❌ Problème : "npm: command not found"

**Cause :** Node.js n'est pas installé

**Solution :**
```bash
# Télécharger Node.js LTS depuis :
https://nodejs.org/

# Vérifier après installation :
node --version
npm --version
```

---

### ❌ Problème : "Port 3000 already in use"

**Cause :** Un autre programme utilise le port 3000

**Solution 1 :** Changer le port
```javascript
// Dans server.js, ligne 12
const PORT = 3001; // Au lieu de 3000
```

**Solution 2 :** Tuer le processus
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <numero> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

---

### ❌ Problème : "Les autres ne voient pas mon écran"

**Checklist :**

1. **Tout le monde sur le même réseau ?**
   ```bash
   # Vérifier l'IP
   # Windows : ipconfig
   # Mac/Linux : ifconfig
   
   # Tout le monde doit être en 192.168.1.x ou 192.168.43.x
   ```

2. **L'hôte a bien cliqué "Partager" ?**
   - Vérifier qu'il voit "Vous partagez votre écran"

3. **Firewall désactivé ou autorisé ?**
   ```bash
   # Windows : Panneau de configuration → Pare-feu
   # Autoriser Node.js et le port 3000
   ```

4. **Rafraîchir la page (F5)**
   - Parfois la connexion WebRTC prend quelques secondes

---

### ❌ Problème : "Impossible de capturer l'écran"

**Cause :** Navigateur bloque l'accès

**Solution :**
1. Utiliser Chrome, Edge, ou Firefox (pas Safari)
2. Accepter la demande d'autorisation
3. Vérifier les paramètres de confidentialité :
   - Chrome : `chrome://settings/content/screen`
   - Autoriser le partage d'écran

---

### ❌ Problème : "Lag / Décalage vidéo"

**Causes possibles :**

1. **Réseau Wi-Fi surchargé**
   ```
   Solution : Utiliser Ethernet si possible
   ```

2. **Trop de spectateurs (>10)**
   ```
   Solution : WebRTC limite à ~10-15 connexions simultanées
   ```

3. **Résolution trop élevée**
   ```javascript
   // Dans index.html, réduire la résolution
   width: { ideal: 1280 },  // Au lieu de 1920
   height: { ideal: 720 },  // Au lieu de 1080
   ```

---

### ❌ Problème : "Connexion perdue régulièrement"

**Solution :**
```javascript
// Augmenter le timeout dans server.js
pingTimeout: 120000,  // 2 minutes au lieu de 60s
pingInterval: 50000,  // 50s au lieu de 25s
```

---

## 📊 Limites et recommandations

### Limites connues

| Limite | Valeur | Explication |
|--------|--------|-------------|
| **Spectateurs simultanés** | ~15-20 max | WebRTC P2P limite technique |
| **Qualité vidéo** | 1080p@30fps | Au-delà, lag possible |
| **Latence** | 100-500ms | Dépend du réseau local |
| **Distance réseau** | Même sous-réseau | Pas de routage complexe |

### Recommandations

✅ **Bonnes pratiques :**
- Utiliser un réseau 5GHz (plus rapide que 2.4GHz)
- Fermer les applications inutiles
- Connexion Ethernet pour l'hôte
- Limiter à 10-12 spectateurs

❌ **À éviter :**
- Partager sur un réseau public
- Trop de spectateurs (>20)
- Réseau Wi-Fi 2.4GHz surchargé
- Streaming vidéo pendant le partage

---

## 🔒 Sécurité

### ⚠️ Important

Cette application est conçue pour un **réseau local de confiance**.

**Ne PAS :**
- ❌ Exposer sur internet sans sécurité
- ❌ Utiliser sur un réseau public
- ❌ Partager des données sensibles

**Pourquoi :**
- Pas d'authentification
- Pas de chiffrement des données (hors WebRTC)
- Pas de contrôle d'accès

### Pour une utilisation sécurisée

Si vous devez sécuriser :
1. Ajouter un mot de passe
2. Utiliser HTTPS (certificat SSL)
3. Implémenter une authentification
4. Logger tous les accès

---

## 📝 Licence

Ce projet est à usage éducatif / interne.
Vous pouvez l'utiliser, le modifier, le distribuer librement.

---

## ✍️ Auteur

Ce projet a été développé par **MASSE MASSE PAUL - BASTHYLE**.

---

## 🆘 Support

**En cas de problème :**

1. Vérifier le terminal serveur (logs en temps réel)
2. Ouvrir la console navigateur (F12 → Console)
3. Vérifier la connexion réseau
4. Redémarrer le serveur

**Logs serveur utiles :**
```
🟢 CONNEXION = Nouvelle connexion
🎥 SHARE START = Partage démarré
⏹️ SHARE STOP = Partage arrêté
⛔ SHARE BLOCKED = Tentative bloquée
🔴 DÉCONNEXION = Utilisateur parti
```

---

## ✅ Checklist avant utilisation

- [ ] Node.js installé
- [ ] `npm install` exécuté
- [ ] Serveur démarre sans erreur
- [ ] URL accessible depuis votre navigateur
- [ ] Test avec un 2ème appareil réussi
- [ ] Firewall configuré
- [ ] URL notée pour la partager

**Temps total : 5-10 minutes** ⚡

---

**Prêt à utiliser ! 🎉**
