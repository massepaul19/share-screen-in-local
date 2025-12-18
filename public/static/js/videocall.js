// ========================================
// public/static/videocall.js
// Client mediasoup - Appel vidéo
// ========================================

class VideoCallManager {
  constructor(socket) {
    this.socket = socket;
    this.device = null;
    this.roomId = null;
    this.myName = null;
    
    this.sendTransport = null;
    this.recvTransport = null;
    
    this.videoProducer = null;
    this.audioProducer = null;
    
    this.consumers = new Map();
    this.participants = new Map();
    
    this.localStream = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    
    this.ui = null;
  }

  async init(roomId, name) {
    try {
      this.roomId = roomId;
      this.myName = name;

      await this.loadDevice();
      await this.joinRoom();
      await this.createTransports();
      await this.startMedia();

      this.setupSocketListeners();
      
      console.log('✅ VideoCall initialisé');
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur init VideoCall:', error);
      return { success: false, error: error.message };
    }
  }

  async loadDevice() {
    const response = await this.socket.emitWithAck('join-video-room', {
      roomId: this.roomId,
      name: this.myName
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.device = new mediasoupClient.Device();
    await this.device.load({ routerRtpCapabilities: response.rtpCapabilities });

    response.participants.forEach(p => {
      this.participants.set(p.socketId, p);
    });

    console.log('📱 Device chargé');
  }

  async createTransports() {
    await this.createSendTransport();
    await this.createRecvTransport();
  }

  async createSendTransport() {
    const response = await this.socket.emitWithAck('create-video-transport', {
      roomId: this.roomId,
      direction: 'send'
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.sendTransport = this.device.createSendTransport(response);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socket.emitWithAck('connect-video-transport', {
          roomId: this.roomId,
          transportId: this.sendTransport.id,
          dtlsParameters
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const response = await this.socket.emitWithAck('produce-video', {
          roomId: this.roomId,
          transportId: this.sendTransport.id,
          kind,
          rtpParameters
        });
        callback({ id: response.id });
      } catch (error) {
        errback(error);
      }
    });

    console.log('🚛 Send transport créé');
  }

  async createRecvTransport() {
    const response = await this.socket.emitWithAck('create-video-transport', {
      roomId: this.roomId,
      direction: 'recv'
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.recvTransport = this.device.createRecvTransport(response);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socket.emitWithAck('connect-video-transport', {
          roomId: this.roomId,
          transportId: this.recvTransport.id,
          dtlsParameters
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });

    console.log('🚛 Recv transport créé');
  }

  async startMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const videoTrack = this.localStream.getVideoTracks()[0];
      const audioTrack = this.localStream.getAudioTracks()[0];

      this.videoProducer = await this.sendTransport.produce({
        track: videoTrack,
        encodings: [
          { maxBitrate: 100000 },
          { maxBitrate: 300000 },
          { maxBitrate: 900000 }
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000
        }
      });

      this.audioProducer = await this.sendTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: true,
          opusDtx: true
        }
      });

      if (this.ui) {
        this.ui.addLocalVideo(this.localStream, this.myName);
      }

      console.log('📹 Média démarré');
    } catch (error) {
      console.error('❌ Erreur startMedia:', error);
      throw error;
    }
  }

  setupSocketListeners() {
    this.socket.on('video-participant-joined', (data) => {
      console.log('👤 Participant rejoint:', data.name);
      this.participants.set(data.socketId, data);
    });

    this.socket.on('new-video-producer', async (data) => {
      console.log('📹 Nouveau producer:', data.kind);
      await this.consumeMedia(data.producerId, data.socketId, data.kind);
    });

    this.socket.on('video-participant-left', (data) => {
      console.log('👋 Participant parti:', data.socketId);
      this.participants.delete(data.socketId);
      
      this.consumers.forEach((consumer, id) => {
        if (consumer.socketId === data.socketId) {
          consumer.close();
          this.consumers.delete(id);
        }
      });

      if (this.ui) {
        this.ui.removeParticipant(data.socketId);
      }
    });

    this.socket.on('video-producer-closed', (data) => {
      const consumer = this.consumers.get(data.consumerId);
      if (consumer) {
        consumer.close();
        this.consumers.delete(data.consumerId);
      }
    });
  }

  async consumeMedia(producerId, socketId, kind) {
    try {
      const response = await this.socket.emitWithAck('consume-video', {
        roomId: this.roomId,
        transportId: this.recvTransport.id,
        producerId,
        rtpCapabilities: this.device.rtpCapabilities
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      const consumer = await this.recvTransport.consume({
        id: response.id,
        producerId: response.producerId,
        kind: response.kind,
        rtpParameters: response.rtpParameters
      });

      consumer.socketId = socketId;
      this.consumers.set(consumer.id, consumer);

      await this.socket.emitWithAck('resume-video-consumer', {
        roomId: this.roomId,
        consumerId: consumer.id
      });

      await consumer.resume();

      if (this.ui) {
        const participant = this.participants.get(socketId);
        this.ui.addRemoteMedia(consumer, socketId, participant?.name || 'Unknown', kind);
      }

      console.log(`📺 Consumer ${kind} créé`);
    } catch (error) {
      console.error('❌ Erreur consumeMedia:', error);
    }
  }

  async toggleVideo() {
    if (this.videoProducer) {
      if (this.isVideoEnabled) {
        this.videoProducer.pause();
        this.localStream.getVideoTracks()[0].enabled = false;
      } else {
        this.videoProducer.resume();
        this.localStream.getVideoTracks()[0].enabled = true;
      }
      this.isVideoEnabled = !this.isVideoEnabled;
      return this.isVideoEnabled;
    }
  }

  async toggleAudio() {
    if (this.audioProducer) {
      if (this.isAudioEnabled) {
        this.audioProducer.pause();
        this.localStream.getAudioTracks()[0].enabled = false;
      } else {
        this.audioProducer.resume();
        this.localStream.getAudioTracks()[0].enabled = true;
      }
      this.isAudioEnabled = !this.isAudioEnabled;
      return this.isAudioEnabled;
    }
  }

  async leave() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.videoProducer) this.videoProducer.close();
    if (this.audioProducer) this.audioProducer.close();

    this.consumers.forEach(consumer => consumer.close());
    this.consumers.clear();

    if (this.sendTransport) this.sendTransport.close();
    if (this.recvTransport) this.recvTransport.close();

    await this.socket.emit('leave-video-room', { roomId: this.roomId });

    console.log('👋 Quitté VideoCall');
  }
}

window.VideoCallManager = VideoCallManager;

// ========================================
// 📚 COURS : COMPRENDRE LE CLIENT VIDÉO
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│                    🎯 À QUOI ÇA SERT ?                          │
└─────────────────────────────────────────────────────────────────┘

Ce fichier est le CLIENT mediasoup pour l'appel vidéo.
Il gère :
- La connexion à la room
- La capture caméra/micro
- L'envoi de vidéo/audio au serveur
- La réception des flux des autres
- Les contrôles (mute, caméra off, etc.)


┌─────────────────────────────────────────────────────────────────┐
│              📦 PROPRIÉTÉS PRINCIPALES                          │
└─────────────────────────────────────────────────────────────────┘

this.device
→ mediasoup Device (objet principal)
→ Gère les codecs, transports, producers, consumers

this.sendTransport
→ Transport pour ENVOYER vidéo/audio au serveur
→ 1 transport send par participant

this.recvTransport
→ Transport pour RECEVOIR vidéo/audio des autres
→ 1 transport recv par participant

this.videoProducer
→ Producer pour la caméra
→ Envoie le flux vidéo au serveur

this.audioProducer
→ Producer pour le micro
→ Envoie le flux audio au serveur

this.consumers = new Map()
→ Map<consumerId, Consumer>
→ Stocke tous les consumers (flux reçus des autres)

this.participants = new Map()
→ Map<socketId, Participant>
→ Liste des participants dans la room

this.localStream
→ MediaStream local (caméra + micro)


┌─────────────────────────────────────────────────────────────────┐
│              🔄 FLUX D'INITIALISATION                           │
└─────────────────────────────────────────────────────────────────┘

1️⃣ CHARGER LE DEVICE
---------------------
await this.loadDevice()
→ Appelle 'join-video-room' sur le serveur
→ Reçoit rtpCapabilities du router
→ Charge le device avec ces capacités
→ Le device sait maintenant quels codecs utiliser

💡 Le device est l'objet central de mediasoup-client
Il gère toute la logique WebRTC côté client


2️⃣ CRÉER LES TRANSPORTS
-------------------------
await this.createTransports()
→ Crée sendTransport (pour envoyer)
→ Crée recvTransport (pour recevoir)
→ Configure les événements 'connect' et 'produce'

💡 Pourquoi 2 transports ?
Architecture mediasoup : séparer send et receive
Plus propre et plus performant


3️⃣ DÉMARRER LE MÉDIA
---------------------
await this.startMedia()
→ getUserMedia() : capture caméra + micro
→ Crée videoProducer avec le track vidéo
→ Crée audioProducer avec le track audio
→ Les producers commencent à envoyer au serveur

💡 Encodings avec 3 qualités :
- 100 kbps : basse qualité
- 300 kbps : moyenne qualité
- 900 kbps : haute qualité
Le serveur choisit selon la bande passante


4️⃣ ÉCOUTER LES ÉVÉNEMENTS
--------------------------
this.setupSocketListeners()
→ 'video-participant-joined' : quelqu'un arrive
→ 'new-video-producer' : quelqu'un produit
→ 'video-participant-left' : quelqu'un part
→ 'video-producer-closed' : un producer ferme


┌─────────────────────────────────────────────────────────────────┐
│              🚛 GESTION DES TRANSPORTS                          │
└─────────────────────────────────────────────────────────────────┘

📤 SEND TRANSPORT
-----------------
this.sendTransport.on('connect', ...)
→ Événement déclenché quand transport doit se connecter
→ Envoie dtlsParameters au serveur
→ Serveur connecte le transport

this.sendTransport.on('produce', ...)
→ Événement déclenché quand on veut produire
→ Envoie rtpParameters au serveur
→ Serveur crée le producer
→ Retourne le producer ID

💡 Ces événements sont automatiques !
mediasoup-client les déclenche tout seul


📥 RECV TRANSPORT
-----------------
this.recvTransport.on('connect', ...)
→ Même logique que send transport
→ Connecte le transport de réception

Pas besoin de 'produce' sur recv transport
→ On ne produit que sur send transport


┌─────────────────────────────────────────────────────────────────┐
│              📹 PRODUCTION VIDÉO/AUDIO                          │
└─────────────────────────────────────────────────────────────────┘

VIDEO PRODUCER
--------------
this.videoProducer = await this.sendTransport.produce({
  track: videoTrack,
  encodings: [
    { maxBitrate: 100000 },   // 100 kbps
    { maxBitrate: 300000 },   // 300 kbps
    { maxBitrate: 900000 }    // 900 kbps
  ],
  codecOptions: {
    videoGoogleStartBitrate: 1000  // Démarrer à 1 Mbps
  }
});

💡 Simulcast (3 qualités) :
Le serveur peut choisir quelle qualité envoyer à chaque participant
selon leur bande passante


AUDIO PRODUCER
--------------
this.audioProducer = await this.sendTransport.produce({
  track: audioTrack,
  codecOptions: {
    opusStereo: true,  // Stéréo
    opusDtx: true      // Discontinuous Transmission
  }
});

💡 opusDtx = true :
Arrête la transmission quand personne ne parle
Économise ~50% de bande passante


┌─────────────────────────────────────────────────────────────────┐
│              📺 CONSOMMATION DES FLUX                           │
└─────────────────────────────────────────────────────────────────┘

FLUX COMPLET :
--------------
1. Serveur émet 'new-video-producer'
   → Un participant a créé un producer

2. Client appelle consumeMedia(producerId)
   → Demande au serveur de créer un consumer

3. Serveur crée le consumer
   → Retourne les paramètres RTP

4. Client crée le consumer local
   await this.recvTransport.consume({ ... })

5. Client resume le consumer
   → Côté client : consumer.resume()
   → Côté serveur : socket.emit('resume-video-consumer')

6. Le flux arrive !
   → consumer.track contient le MediaStreamTrack
   → Créer un <video> avec ce track


STOCKAGE DES CONSUMERS :
-------------------------
this.consumers.set(consumer.id, consumer);
consumer.socketId = socketId;

💡 On stocke le socketId pour savoir à qui appartient le consumer
Quand quelqu'un part, on ferme tous ses consumers


┌─────────────────────────────────────────────────────────────────┐
│              🎛️ CONTRÔLES (MUTE, CAMÉRA)                       │
└─────────────────────────────────────────────────────────────────┘

TOGGLE VIDÉO (caméra on/off)
-----------------------------
async toggleVideo() {
  if (this.isVideoEnabled) {
    this.videoProducer.pause();              // Arrête l'envoi réseau
    this.localStream.getVideoTracks()[0].enabled = false;  // Arrête la capture
  } else {
    this.videoProducer.resume();             // Reprend l'envoi
    this.localStream.getVideoTracks()[0].enabled = true;   // Reprend la capture
  }
  this.isVideoEnabled = !this.isVideoEnabled;
}

💡 Pourquoi faire les 2 ?
- producer.pause() : arrête l'envoi réseau
- track.enabled = false : arrête la capture (économise CPU)


TOGGLE AUDIO (mute/unmute)
---------------------------
async toggleAudio() {
  // Même logique que toggleVideo
  // Mais pour audioProducer et audio track
}


┌─────────────────────────────────────────────────────────────────┐
│              👋 QUITTER L'APPEL                                 │
└─────────────────────────────────────────────────────────────────┘

async leave() {
  // 1. Arrêter la capture
  this.localStream.getTracks().forEach(track => track.stop());
  
  // 2. Fermer les producers
  this.videoProducer.close();
  this.audioProducer.close();
  
  // 3. Fermer tous les consumers
  this.consumers.forEach(consumer => consumer.close());
  
  // 4. Fermer les transports
  this.sendTransport.close();
  this.recvTransport.close();
  
  // 5. Notifier le serveur
  socket.emit('leave-video-room', { roomId });
}

💡 IMPORTANT : Toujours nettoyer !
Sinon : fuites mémoire et connexions zombies


┌─────────────────────────────────────────────────────────────────┐
│              🎨 INTÉGRATION AVEC UI                             │
└─────────────────────────────────────────────────────────────────┘

this.ui = new VideoCallUI(this);

Dans startMedia() :
this.ui.addLocalVideo(this.localStream, this.myName);

Dans consumeMedia() :
this.ui.addRemoteMedia(consumer, socketId, name, kind);

Quand quelqu'un part :
this.ui.removeParticipant(socketId);

💡 Séparation logique / UI
VideoCallManager = logique pure
VideoCallUI = affichage


┌─────────────────────────────────────────────────────────────────┐
│              📊 EXEMPLE D'UTILISATION                           │
└─────────────────────────────────────────────────────────────────┘

// Créer le manager
const videoCall = new VideoCallManager(socket);

// Créer l'UI
videoCall.ui = new VideoCallUI(videoCall);

// Rejoindre l'appel
await videoCall.init('room-123', 'Paul');

// Mute micro
await videoCall.toggleAudio();

// Caméra off
await videoCall.toggleVideo();

// Quitter
await videoCall.leave();


┌─────────────────────────────────────────────────────────────────┐
│                      ❓ FAQ                                     │
└─────────────────────────────────────────────────────────────────┘

Q: Pourquoi mediasoupClient et pas juste WebRTC ?
R: mediasoup-client simplifie énormément WebRTC.
   Il gère automatiquement les SDP, ICE, etc.

Q: C'est quoi les encodings ?
R: Simulcast = envoyer 3 qualités différentes.
   Le serveur choisit laquelle envoyer à chaque participant.

Q: Pourquoi consumer démarre en pause ?
R: Pour éviter de recevoir des paquets avant d'être prêt.
   On appelle resume() quand le <video> est créé.

Q: Peut-on changer la qualité vidéo en cours ?
R: Oui, avec producer.setMaxSpatialLayer(layer)
   layer = 0 (basse), 1 (moyenne), 2 (haute)

Q: Comment détecter la qualité réseau ?
R: Écouter les stats :
   const stats = await producer.getStats();
   → Contient bitrate, perte de paquets, etc.


┌─────────────────────────────────────────────────────────────────┐
│              📖 DOCUMENTATION                                   │
└─────────────────────────────────────────────────────────────────┘

mediasoup-client :
https://mediasoup.org/documentation/v3/mediasoup-client/api/

getUserMedia :
https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

WebRTC :
https://webrtc.org/
*/