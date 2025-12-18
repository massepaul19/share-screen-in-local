// ========================================
// public/static/audiocall.js
// Client mediasoup - Appel audio
// ========================================

class AudioCallManager {
  constructor(socket) {
    this.socket = socket;
    this.device = null;
    this.roomId = null;
    this.myName = null;
    
    this.sendTransport = null;
    this.recvTransport = null;
    
    this.audioProducer = null;
    this.consumers = new Map();
    this.participants = new Map();
    
    this.localStream = null;
    this.isAudioEnabled = true;
    
    this.ui = null;
  }

  async init(roomId, name) {
    try {
      this.roomId = roomId;
      this.myName = name;

      await this.loadDevice();
      await this.createTransports();
      await this.startAudio();
      this.setupSocketListeners();
      
      console.log('✅ AudioCall initialisé');
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur init AudioCall:', error);
      return { success: false, error: error.message };
    }
  }

  async loadDevice() {
    const response = await this.socket.emitWithAck('join-audio-room', {
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
    const response = await this.socket.emitWithAck('create-audio-transport', {
      roomId: this.roomId,
      direction: 'send'
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.sendTransport = this.device.createSendTransport(response);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socket.emitWithAck('connect-audio-transport', {
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
        const response = await this.socket.emitWithAck('produce-audio', {
          roomId: this.roomId,
          transportId: this.sendTransport.id,
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
    const response = await this.socket.emitWithAck('create-audio-transport', {
      roomId: this.roomId,
      direction: 'recv'
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    this.recvTransport = this.device.createRecvTransport(response);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socket.emitWithAck('connect-audio-transport', {
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

  async startAudio() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      const audioTrack = this.localStream.getAudioTracks()[0];

      this.audioProducer = await this.sendTransport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: false,
          opusDtx: true,
          opusFec: true,
          opusPtime: 20
        }
      });

      if (this.ui) {
        this.ui.updateMyStatus(true);
      }

      console.log('🎙️ Audio démarré');
    } catch (error) {
      console.error('❌ Erreur startAudio:', error);
      throw error;
    }
  }

  setupSocketListeners() {
    this.socket.on('audio-participant-joined', (data) => {
      console.log('👤 Participant rejoint:', data.name);
      this.participants.set(data.socketId, data);
      if (this.ui) {
        this.ui.addParticipant(data.socketId, data.name, false);
      }
    });

    this.socket.on('new-audio-producer', async (data) => {
      console.log('🎙️ Nouveau producer audio');
      await this.consumeAudio(data.producerId, data.socketId);
    });

    this.socket.on('audio-participant-left', (data) => {
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

    this.socket.on('audio-producer-closed', (data) => {
      const consumer = this.consumers.get(data.consumerId);
      if (consumer) {
        consumer.close();
        this.consumers.delete(data.consumerId);
      }
    });

    this.socket.on('audio-producer-paused', (data) => {
      if (this.ui) {
        this.ui.updateParticipantMute(data.socketId, true);
      }
    });

    this.socket.on('audio-producer-resumed', (data) => {
      if (this.ui) {
        this.ui.updateParticipantMute(data.socketId, false);
      }
    });
  }

  async consumeAudio(producerId, socketId) {
    try {
      const response = await this.socket.emitWithAck('consume-audio', {
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
        kind: 'audio',
        rtpParameters: response.rtpParameters
      });

      consumer.socketId = socketId;
      this.consumers.set(consumer.id, consumer);

      await this.socket.emitWithAck('resume-audio-consumer', {
        roomId: this.roomId,
        consumerId: consumer.id
      });

      await consumer.resume();

      const audioElement = new Audio();
      audioElement.srcObject = new MediaStream([consumer.track]);
      audioElement.play();

      if (this.ui) {
        const participant = this.participants.get(socketId);
        this.ui.addParticipant(socketId, participant?.name || 'Unknown', false);
      }

      console.log('🔊 Consumer audio créé');
    } catch (error) {
      console.error('❌ Erreur consumeAudio:', error);
    }
  }

  async toggleAudio() {
    if (this.audioProducer) {
      if (this.isAudioEnabled) {
        await this.socket.emitWithAck('pause-audio-producer', {
          roomId: this.roomId,
          producerId: this.audioProducer.id
        });
        this.audioProducer.pause();
        this.localStream.getAudioTracks()[0].enabled = false;
      } else {
        await this.socket.emitWithAck('resume-audio-producer', {
          roomId: this.roomId,
          producerId: this.audioProducer.id
        });
        this.audioProducer.resume();
        this.localStream.getAudioTracks()[0].enabled = true;
      }
      this.isAudioEnabled = !this.isAudioEnabled;
      
      if (this.ui) {
        this.ui.updateMyStatus(this.isAudioEnabled);
      }
      
      return this.isAudioEnabled;
    }
  }

  async leave() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.audioProducer) this.audioProducer.close();

    this.consumers.forEach(consumer => consumer.close());
    this.consumers.clear();

    if (this.sendTransport) this.sendTransport.close();
    if (this.recvTransport) this.recvTransport.close();

    await this.socket.emit('leave-audio-room', { roomId: this.roomId });

    console.log('👋 Quitté AudioCall');
  }
}

window.AudioCallManager = AudioCallManager;

// ========================================
// 📚 COURS : COMPRENDRE LE CLIENT AUDIO
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│           🆚 DIFFÉRENCES AVEC VIDEOCALL.JS                      │
└─────────────────────────────────────────────────────────────────┘

SIMILITUDES :
✅ Même structure générale
✅ Même flux d'initialisation
✅ Même gestion des transports
✅ Même système de consumers

DIFFÉRENCES CLÉS :
❌ Pas de videoProducer (seulement audioProducer)
❌ Pas de getUserMedia video
❌ Pas d'élément <video> (seulement <audio>)
✅ Gestion mute/unmute côté serveur (pause/resume-audio-producer)
✅ Plus léger en ressources

┌─────────────────────────────────────────────────────────────────┐
│              🎙️ CAPTURE AUDIO OPTIMISÉE                        │
└─────────────────────────────────────────────────────────────────┘

getUserMedia({
  video: false,  // ← Pas de vidéo !
  audio: {
    echoCancellation: true,    // Supprime écho
    noiseSuppression: true,    // Supprime bruit de fond
    autoGainControl: true,     // Normalise volume
    sampleRate: 48000         // 48 kHz (qualité pro)
  }
});

💡 Ces paramètres améliorent considérablement la qualité audio

┌─────────────────────────────────────────────────────────────────┐
│              📡 CODEC OPTIONS AUDIO                             │
└─────────────────────────────────────────────────────────────────┘

codecOptions: {
  opusStereo: false,  // Mono (économise 50% BP)
  opusDtx: true,      // Discontinuous Transmission
  opusFec: true,      // Forward Error Correction
  opusPtime: 20       // Packet time 20ms
}

opusDtx: true
→ Arrête transmission quand personne ne parle
→ Économise ~50% bande passante

opusFec: true
→ Correction d'erreur
→ Compense perte de paquets
→ Meilleure qualité en mauvais réseau

opusPtime: 20
→ 20ms par paquet
→ Bon équilibre latence/overhead

┌─────────────────────────────────────────────────────────────────┐
│              🔇 MUTE/UNMUTE CÔTÉ SERVEUR                        │
└─────────────────────────────────────────────────────────────────┘

DIFFÉRENCE MAJEURE avec videocall.js :

Dans audiocall.js :
- Appelle pause-audio-producer sur le serveur
- Le serveur notifie les autres
- Les autres voient que tu es muted

Dans videocall.js :
- Seulement local (producer.pause())
- Pas de notification serveur

💡 Pourquoi cette différence ?
En audio, il est IMPORTANT de voir qui est muted
En vidéo, on voit déjà si la caméra est off

┌─────────────────────────────────────────────────────────────────┐
│              🔊 LECTURE AUDIO AUTOMATIQUE                       │
└─────────────────────────────────────────────────────────────────┘

const audioElement = new Audio();
audioElement.srcObject = new MediaStream([consumer.track]);
audioElement.play();

💡 Pas besoin d'ajouter au DOM !
L'élément <audio> joue en arrière-plan
Le navigateur mixe tous les flux audio automatiquement

⚠️ NE PAS écouter son propre micro !
→ Crée un effet larsen (feedback)

┌─────────────────────────────────────────────────────────────────┐
│              📊 BANDE PASSANTE                                  │
└─────────────────────────────────────────────────────────────────┘

Audio mono Opus avec DTX :
- En parlant : ~20-30 kbps
- En silence : ~2-5 kbps (grâce à DTX)
- Moyenne : ~15-20 kbps

Comparaison :
- 10 participants audio : ~150-200 kbps
- 10 participants vidéo : ~10-20 Mbps

Audio = 50-100x moins de bande passante !

┌─────────────────────────────────────────────────────────────────┐
│              🎯 UTILISATION TYPIQUE                             │
└─────────────────────────────────────────────────────────────────┘

// Créer le manager
const audioCall = new AudioCallManager(socket);

// Créer l'UI
audioCall.ui = new AudioCallUI(audioCall);

// Rejoindre la conférence
await audioCall.init('conference-123', 'Paul');

// Toggle mute/unmute
await audioCall.toggleAudio();

// Quitter
await audioCall.leave();

┌─────────────────────────────────────────────────────────────────┐
│              ❓ FAQ                                             │
└─────────────────────────────────────────────────────────────────┘

Q: Pourquoi pas de <audio> visible dans le DOM ?
R: Les flux audio se jouent en arrière-plan.
   Le navigateur les mixe automatiquement.

Q: Comment détecter qui parle ?
R: Utiliser Web Audio API pour analyser le volume :
   const analyser = audioContext.createAnalyser();

Q: Combien de participants max ?
R: 50-100+ sur serveur moyen (beaucoup plus qu'en vidéo)

Q: Peut-on améliorer encore la qualité ?
R: Oui, utiliser opusStereo: true (stéréo)
   Mais double la bande passante
*/