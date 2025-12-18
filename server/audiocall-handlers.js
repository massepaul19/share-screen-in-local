// ========================================
// server/audiocall-handlers.js
// Gestionnaire événements Socket.IO - Appel audio
// ========================================

const config = require('./mediasoup-config');
const { log } = require('./utils');

function setupAudioCallHandlers(io, roomManager) {
  io.on('connection', (socket) => {
    
    // ========================================
    // EVENT: join-audio-room
    // ========================================
    socket.on('join-audio-room', async (data, callback) => {
      try {
        const { roomId, name } = data;
        log(`🎤 ${name} rejoint audio room: ${roomId}`);

        const room = await roomManager.createRoom(roomId, 'audio');
        
        room.addParticipant(socket.id, {
          name,
          socketId: socket.id
        });

        socket.join(roomId);
        socket.data.currentAudioRoom = roomId;

        const rtpCapabilities = room.router.rtpCapabilities;
        const otherParticipants = room.getOtherParticipants(socket.id);

        socket.to(roomId).emit('audio-participant-joined', {
          socketId: socket.id,
          name
        });

        callback({
          success: true,
          rtpCapabilities,
          participants: otherParticipants.map(p => ({
            socketId: p.socketId,
            name: p.name
          }))
        });

        log(`✅ ${name} dans audio room ${roomId} (${room.participants.size} participants)`);
      } catch (error) {
        log(`❌ Erreur join-audio-room: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: create-audio-transport
    // ========================================
    socket.on('create-audio-transport', async (data, callback) => {
      try {
        const { roomId, direction } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const transport = await room.router.createWebRtcTransport({
          listenIps: config.webRtcTransport.listenIps,
          enableUdp: config.webRtcTransport.enableUdp,
          enableTcp: config.webRtcTransport.enableTcp,
          preferUdp: config.webRtcTransport.preferUdp
        });

        const participant = room.getParticipant(socket.id);
        participant.transports.set(transport.id, transport);

        transport.on('dtlsstatechange', (dtlsState) => {
          if (dtlsState === 'closed') {
            transport.close();
            participant.transports.delete(transport.id);
          }
        });

        callback({
          success: true,
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        });

        log(`🚛 Audio transport créé (${direction}): ${transport.id.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur create-audio-transport: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: connect-audio-transport
    // ========================================
    socket.on('connect-audio-transport', async (data, callback) => {
      try {
        const { roomId, transportId, dtlsParameters } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const participant = room.getParticipant(socket.id);
        const transport = participant.transports.get(transportId);

        if (!transport) {
          throw new Error('Transport non trouvé');
        }

        await transport.connect({ dtlsParameters });

        callback({ success: true });
        log(`🔗 Audio transport connecté: ${transportId.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur connect-audio-transport: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: produce-audio
    // ========================================
    socket.on('produce-audio', async (data, callback) => {
      try {
        const { roomId, transportId, rtpParameters } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const participant = room.getParticipant(socket.id);
        const transport = participant.transports.get(transportId);

        if (!transport) {
          throw new Error('Transport non trouvé');
        }

        const producer = await transport.produce({
          kind: 'audio',
          rtpParameters
        });

        participant.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
          producer.close();
          participant.producers.delete(producer.id);
        });

        socket.to(roomId).emit('new-audio-producer', {
          producerId: producer.id,
          socketId: socket.id
        });

        callback({
          success: true,
          id: producer.id
        });

        log(`🎙️ Audio producer créé: ${producer.id.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur produce-audio: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: consume-audio
    // ========================================
    socket.on('consume-audio', async (data, callback) => {
      try {
        const { roomId, transportId, producerId, rtpCapabilities } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const participant = room.getParticipant(socket.id);
        const transport = participant.transports.get(transportId);

        if (!transport) {
          throw new Error('Transport non trouvé');
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          throw new Error('Cannot consume');
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true
        });

        participant.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
          consumer.close();
          participant.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
          socket.emit('audio-producer-closed', { consumerId: consumer.id });
          consumer.close();
          participant.consumers.delete(consumer.id);
        });

        callback({
          success: true,
          id: consumer.id,
          producerId: producerId,
          rtpParameters: consumer.rtpParameters
        });

        log(`🔊 Audio consumer créé: ${consumer.id.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur consume-audio: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: resume-audio-consumer
    // ========================================
    socket.on('resume-audio-consumer', async (data, callback) => {
      try {
        const { roomId, consumerId } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const participant = room.getParticipant(socket.id);
        const consumer = participant.consumers.get(consumerId);

        if (!consumer) {
          throw new Error('Consumer non trouvé');
        }

        await consumer.resume();

        callback({ success: true });
        log(`▶️  Audio consumer resumed: ${consumerId.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur resume-audio-consumer: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: pause-audio-producer (MUTE)
    // ========================================
    socket.on('pause-audio-producer', async (data, callback) => {
      try {
        const { roomId, producerId } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const participant = room.getParticipant(socket.id);
        const producer = participant.producers.get(producerId);

        if (!producer) {
          throw new Error('Producer non trouvé');
        }

        await producer.pause();

        socket.to(roomId).emit('audio-producer-paused', {
          socketId: socket.id,
          producerId
        });

        callback({ success: true });
        log(`🔇 Audio muted: ${socket.id.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur pause-audio-producer: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: resume-audio-producer (UNMUTE)
    // ========================================
    socket.on('resume-audio-producer', async (data, callback) => {
      try {
        const { roomId, producerId } = data;
        const room = roomManager.getRoom(roomId);
        
        if (!room) {
          throw new Error('Room non trouvée');
        }

        const participant = room.getParticipant(socket.id);
        const producer = participant.producers.get(producerId);

        if (!producer) {
          throw new Error('Producer non trouvé');
        }

        await producer.resume();

        socket.to(roomId).emit('audio-producer-resumed', {
          socketId: socket.id,
          producerId
        });

        callback({ success: true });
        log(`🔊 Audio unmuted: ${socket.id.slice(0, 8)}`);
      } catch (error) {
        log(`❌ Erreur resume-audio-producer: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // ========================================
    // EVENT: leave-audio-room
    // ========================================
    socket.on('leave-audio-room', async (data) => {
      try {
        const { roomId } = data;
        const room = roomManager.getRoom(roomId);
        
        if (room) {
          room.removeParticipant(socket.id);
          socket.leave(roomId);
          socket.data.currentAudioRoom = null;

          socket.to(roomId).emit('audio-participant-left', {
            socketId: socket.id
          });

          if (room.participants.size === 0) {
            roomManager.deleteRoom(roomId);
          }

          log(`👋 Participant quitté audio room: ${roomId}`);
        }
      } catch (error) {
        log(`❌ Erreur leave-audio-room: ${error.message}`);
      }
    });

    // ========================================
    // EVENT: disconnect
    // ========================================
    socket.on('disconnect', () => {
      const roomId = socket.data.currentAudioRoom;
      if (roomId) {
        const room = roomManager.getRoom(roomId);
        if (room) {
          room.removeParticipant(socket.id);
          socket.to(roomId).emit('audio-participant-left', {
            socketId: socket.id
          });

          if (room.participants.size === 0) {
            roomManager.deleteRoom(roomId);
          }
        }
      }
    });
  });
}

module.exports = { setupAudioCallHandlers };

// ========================================
// 📚 COURS : COMPRENDRE LES HANDLERS AUDIO
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│                    🎯 À QUOI ÇA SERT ?                          │
└─────────────────────────────────────────────────────────────────┘

Ce fichier gère les événements Socket.IO pour l'appel AUDIO.
C'est presque identique à videocall-handlers.js, mais :
- Seulement audio (pas de vidéo)
- Plus léger en bande passante
- Permet plus de participants
- Idéal pour conférences audio


┌─────────────────────────────────────────────────────────────────┐
│        🆚 DIFFÉRENCES AVEC VIDEOCALL-HANDLERS                   │
└─────────────────────────────────────────────────────────────────┘

SIMILITUDES (même logique) :
✅ join-audio-room          (comme join-video-room)
✅ create-audio-transport    (comme create-video-transport)
✅ connect-audio-transport   (comme connect-video-transport)
✅ consume-audio            (comme consume-video)
✅ resume-audio-consumer    (comme resume-video-consumer)
✅ leave-audio-room         (comme leave-video-room)

DIFFÉRENCES :
🆕 produce-audio            → Seulement audio (pas video + audio)
🆕 pause-audio-producer     → Mute micro
🆕 resume-audio-producer    → Unmute micro

💡 POURQUOI SÉPARER VIDÉO ET AUDIO ?
- Audio seul = beaucoup moins de bande passante
- Audio seul = plus de participants possibles
- Audio seul = moins de CPU nécessaire
- Use case différent : conférence audio vs visio


┌─────────────────────────────────────────────────────────────────┐
│               📡 LES 9 ÉVÉNEMENTS                               │
└─────────────────────────────────────────────────────────────────┘

1️⃣ join-audio-room         → Rejoindre conférence audio
2️⃣ create-audio-transport  → Créer connexion WebRTC
3️⃣ connect-audio-transport → Connecter la connexion
4️⃣ produce-audio           → Envoyer audio (micro)
5️⃣ consume-audio           → Recevoir audio des autres
6️⃣ resume-audio-consumer   → Démarrer la réception
7️⃣ pause-audio-producer    → MUTE micro
8️⃣ resume-audio-producer   → UNMUTE micro
9️⃣ leave-audio-room        → Quitter la conférence


┌─────────────────────────────────────────────────────────────────┐
│              4️⃣ EVENT: produce-audio                           │
└─────────────────────────────────────────────────────────────────┘

🔥 DIFFÉRENCE AVEC VIDÉO :

Dans videocall-handlers.js :
- produce-video appelé 2 fois (video + audio)
- kind: 'video' puis kind: 'audio'

Dans audiocall-handlers.js :
- produce-audio appelé 1 seule fois
- kind: 'audio' uniquement

📥 REÇOIT :
{
  roomId: 'conference-123',
  transportId: 'transport-id',
  rtpParameters: { ... }
}

📤 RÉPOND :
{
  success: true,
  id: 'producer-id'
}

💡 CE QUI SE PASSE :
1. Crée un producer audio uniquement
2. Producer commence à recevoir le flux du micro
3. Notifie les autres qu'un nouveau flux audio est dispo

🎯 CÔTÉ CLIENT :
const audioTrack = stream.getAudioTracks()[0];
const audioProducer = await sendTransport.produce({
  track: audioTrack,
  codecOptions: {
    opusStereo: true,
    opusDtx: true  // Discontinuous Transmission (économise BP)
  }
});


┌─────────────────────────────────────────────────────────────────┐
│         7️⃣ EVENT: pause-audio-producer (MUTE)                  │
└─────────────────────────────────────────────────────────────────┘

🔥 NOUVELLE FONCTIONNALITÉ (pas dans videocall)

📥 REÇOIT :
{
  roomId: 'conference-123',
  producerId: 'producer-id'
}

📤 RÉPOND :
{ success: true }

💡 CE QUI SE PASSE :
1. Met le producer en pause
2. Arrête l'envoi de paquets audio
3. Notifie les autres que le participant est muted

🎯 CÔTÉ CLIENT (bouton mute) :
await socket.emitWithAck('pause-audio-producer', {
  roomId,
  producerId: audioProducer.id
});

// Aussi pauser côté client
await audioProducer.pause();

💡 DIFFÉRENCE pause() VS track.enabled = false :
- producer.pause() : arrête l'envoi réseau (économise BP)
- track.enabled = false : arrête la capture micro
→ Recommandé : utiliser producer.pause()


┌─────────────────────────────────────────────────────────────────┐
│        8️⃣ EVENT: resume-audio-producer (UNMUTE)                │
└─────────────────────────────────────────────────────────────────┘

🔥 NOUVELLE FONCTIONNALITÉ (pas dans videocall)

📥 REÇOIT :
{
  roomId: 'conference-123',
  producerId: 'producer-id'
}

📤 RÉPOND :
{ success: true }

💡 CE QUI SE PASSE :
1. Réactive le producer
2. Reprend l'envoi de paquets audio
3. Notifie les autres que le participant a unmuted

🎯 CÔTÉ CLIENT (bouton unmute) :
await socket.emitWithAck('resume-audio-producer', {
  roomId,
  producerId: audioProducer.id
});

// Aussi reprendre côté client
await audioProducer.resume();


┌─────────────────────────────────────────────────────────────────┐
│              🎬 FLUX COMPLET CONFÉRENCE AUDIO                   │
└─────────────────────────────────────────────────────────────────┘

Scénario : Alice, Bob, Charlie en conférence audio

ALICE REJOINT :
---------------
1. join-audio-room
2. create-audio-transport (send)
3. create-audio-transport (recv)
4. connect-audio-transport (send)
5. connect-audio-transport (recv)
6. produce-audio (micro)

BOB REJOINT :
-------------
1. join-audio-room → Voit Alice
2. create-audio-transport (send)
3. create-audio-transport (recv)
4. connect-audio-transport (send)
5. connect-audio-transport (recv)
6. produce-audio (son micro)
7. consume-audio (micro d'Alice)
8. resume-audio-consumer (Alice)

ALICE REÇOIT :
--------------
1. 'new-audio-producer' → Bob a produit audio
2. consume-audio (micro de Bob)
3. resume-audio-consumer (Bob)

CHARLIE REJOINT :
-----------------
1. join-audio-room → Voit Alice + Bob
2. Crée ses transports
3. produce-audio (son micro)
4. consume-audio (Alice)
5. consume-audio (Bob)
6. resume-audio-consumer (Alice)
7. resume-audio-consumer (Bob)

ALICE ET BOB REÇOIVENT :
------------------------
1. 'new-audio-producer' → Charlie
2. consume-audio (Charlie)
3. resume-audio-consumer (Charlie)

BOB MUTE SON MICRO :
--------------------
1. pause-audio-producer
→ Alice et Charlie reçoivent 'audio-producer-paused'
→ Peuvent afficher icône mute pour Bob

BOB UNMUTE :
------------
1. resume-audio-producer
→ Alice et Charlie reçoivent 'audio-producer-resumed'
→ Peuvent retirer icône mute pour Bob


┌─────────────────────────────────────────────────────────────────┐
│              📊 COMPARAISON BANDE PASSANTE                      │
└─────────────────────────────────────────────────────────────────┘

1 PARTICIPANT (send + receive) :

Vidéo :
- Envoi : 1-2 Mbps (720p)
- Réception : (N-1) × 1-2 Mbps
- 5 participants : ~4-8 Mbps download

Audio :
- Envoi : 40-80 kbps (stéréo Opus)
- Réception : (N-1) × 40-80 kbps
- 5 participants : ~160-320 kbps download

💡 AUDIO = 10-25x MOINS DE BANDE PASSANTE !

Résultat :
- Vidéo : 10-20 participants max
- Audio : 50-100+ participants possibles


┌─────────────────────────────────────────────────────────────────┐
│              🎙️ OPTIMISATIONS AUDIO                            │
└─────────────────────────────────────────────────────────────────┘

1️⃣ DTX (Discontinuous Transmission)
------------------------------------
Producer côté client :
codecOptions: {
  opusDtx: true
}

💡 Arrête la transmission quand personne ne parle
→ Économise ~50% de bande passante

2️⃣ Mono vs Stéréo
------------------
Mono : channels: 1 → 20-40 kbps
Stéréo : channels: 2 → 40-80 kbps

Pour conférence audio, mono suffit :
Dans mediasoup-config.js :
{
  kind: 'audio',
  mimeType: 'audio/opus',
  clockRate: 48000,
  channels: 1  // ← MONO
}

3️⃣ Voice Activity Detection (VAD)
-----------------------------------
Détecter quand quelqu'un parle :
- Afficher indicateur visuel
- Augmenter volume de celui qui parle
- Réduire volume des autres (ducking)

4️⃣ Noise Suppression
---------------------
getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
})

💡 Améliore qualité audio en supprimant bruits de fond


┌─────────────────────────────────────────────────────────────────┐
│              🎨 INTERFACE UTILISATEUR                           │
└─────────────────────────────────────────────────────────────────┘

Conférence audio typique (style Discord) :

┌─────────────────────────────────────────┐
│  🎤 Conférence Audio - Room 123         │
├─────────────────────────────────────────┤
│                                         │
│  👤 Alice          🔊 [====    ] 70%   │
│  👤 Bob            🔇 [        ] Mute  │
│  👤 Charlie        🔊 [========] 95%   │
│  👤 David          🔊 [===     ] 45%   │
│                                         │
├─────────────────────────────────────────┤
│  [🎤 Mute] [🚪 Quitter]                │
└─────────────────────────────────────────┘

Éléments à afficher :
- Nom du participant
- Indicateur mute/unmute
- Niveau audio (volume bar)
- Qui parle actuellement (border glow)


┌─────────────────────────────────────────────────────────────────┐
│                  ⚡ POINTS IMPORTANTS                           │
└─────────────────────────────────────────────────────────────────┘

🔥 MUTE LOCAL VS SERVEUR :
--------------------------
Deux façons de muter :

1. Local (track.enabled = false)
   → Arrête la capture micro
   → Ne dit rien au serveur
   → Autres ne savent pas que tu es muted

2. Serveur (producer.pause())
   → Arrête l'envoi réseau
   → Notifie le serveur
   → Autres savent que tu es muted
   → RECOMMANDÉ

🔥 GESTION DU SON :
-------------------
Chaque consumer = 1 élément <audio>

for (const consumer of consumers.values()) {
  const audioElement = new Audio();
  audioElement.srcObject = new MediaStream([consumer.track]);
  audioElement.play();
}

Le navigateur mixe automatiquement tous les flux audio !

🔥 FEEDBACK AUDIO :
-------------------
⚠️ ATTENTION : Ne pas écouter son propre micro !
→ Crée un effet larsen (feedback)

Solution : Ne pas créer <audio> pour soi-même


┌─────────────────────────────────────────────────────────────────┐
│                      ❓ FAQ                                     │
└─────────────────────────────────────────────────────────────────┘

Q: Différence entre pause-audio-producer et track.enabled = false ?
R: pause-audio-producer arrête l'envoi réseau mais continue la capture.
   track.enabled = false arrête la capture micro.
   Utilise pause-audio-producer pour mute (recommandé).

Q: Combien de participants max en audio ?
R: Serveur moyen : 50-100 participants
   Serveur puissant : 200-500 participants
   Beaucoup plus qu'en vidéo !

Q: Peut-on détecter qui parle ?
R: Oui, analyser consumer.track avec Web Audio API :
   const analyser = audioContext.createAnalyser();
   analyser.fftSize = 256;
   // Analyser le volume en temps réel

Q: Comment réduire encore plus la bande passante ?
R: 1. Utiliser mono (channels: 1)
   2. Activer DTX (opusDtx: true)
   3. Réduire le bitrate si besoin

Q: Peut-on mixer audio + vidéo dans la même room ?
R: Oui, mais c'est mieux de séparer :
   - Room vidéo : video + audio
   - Room audio : audio seulement
   Sinon, utiliser videocall-handlers.js et désactiver vidéo.

Q: Comment implémenter "Push to talk" ?
R: Bouton enfoncé → resume-audio-producer
   Bouton relâché → pause-audio-producer


┌─────────────────────────────────────────────────────────────────┐
│              🎯 PROCHAINES ÉTAPES                               │
└─────────────────────────────────────────────────────────────────┘

Tu as maintenant tous les handlers serveur :
✅ mediasoup-config.js
✅ room-manager.js
✅ videocall-handlers.js
✅ audiocall-handlers.js

Prochains fichiers nécessaires :

1. Modifier server.js
   → Charger roomManager
   → Charger les handlers

2. videocall.js (client)
   → Utilise videocall-handlers

3. audiocall.js (client)
   → Utilise audiocall-handlers

4. videocallUI.js (interface vidéo)
5. audiocallUI.js (interface audio)
6. CSS pour vidéo et audio

Prêt pour la suite ? 🚀
*/