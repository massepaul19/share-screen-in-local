// ========================================
// server/room-manager.js
// Gestionnaire de salles d'appel (vidéo et audio)
// ========================================

const mediasoup = require('mediasoup');
const config = require('./mediasoup-config');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.workers = [];
    this.nextWorkerIndex = 0;
  }

  async init() {
    const numWorkers = Object.keys(require('os').cpus()).length;
    console.log(`🔧 Création de ${numWorkers} workers mediasoup...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: config.worker.logLevel,
        logTags: config.worker.logTags,
        rtcMinPort: config.worker.rtcMinPort,
        rtcMaxPort: config.worker.rtcMaxPort
      });

      worker.on('died', () => {
        console.error(`❌ Worker ${worker.pid} died, quitting...`);
        process.exit(1);
      });

      this.workers.push(worker);
    }

    console.log(`✅ ${numWorkers} workers prêts`);
  }

  getNextWorker() {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  async createRoom(roomId, type = 'video') {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    const worker = this.getNextWorker();
    const router = await worker.createRouter({
      mediaCodecs: config.router.mediaCodecs
    });

    const room = new Room(roomId, type, router);
    this.rooms.set(roomId, room);

    console.log(`🏠 Room créée: ${roomId} (type: ${type})`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.close();
      this.rooms.delete(roomId);
      console.log(`🗑️  Room supprimée: ${roomId}`);
    }
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}

class Room {
  constructor(roomId, type, router) {
    this.roomId = roomId;
    this.type = type;
    this.router = router;
    this.participants = new Map();
    this.createdAt = Date.now();
  }

  addParticipant(socketId, participantData) {
    this.participants.set(socketId, {
      socketId,
      ...participantData,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      joinedAt: Date.now()
    });
    console.log(`👤 Participant ajouté: ${socketId} → Room ${this.roomId}`);
  }

  removeParticipant(socketId) {
    const participant = this.participants.get(socketId);
    if (participant) {
      participant.transports.forEach(transport => transport.close());
      participant.producers.forEach(producer => producer.close());
      participant.consumers.forEach(consumer => consumer.close());
      this.participants.delete(socketId);
      console.log(`👋 Participant retiré: ${socketId} ← Room ${this.roomId}`);
    }
  }

  getParticipant(socketId) {
    return this.participants.get(socketId);
  }

  getParticipants() {
    return Array.from(this.participants.values());
  }

  getOtherParticipants(socketId) {
    return this.getParticipants().filter(p => p.socketId !== socketId);
  }

  close() {
    this.participants.forEach(participant => {
      participant.transports.forEach(transport => transport.close());
      participant.producers.forEach(producer => producer.close());
      participant.consumers.forEach(consumer => consumer.close());
    });
    this.participants.clear();
    this.router.close();
  }

  getStats() {
    return {
      roomId: this.roomId,
      type: this.type,
      participantCount: this.participants.size,
      createdAt: this.createdAt,
      uptime: Date.now() - this.createdAt
    };
  }
}

module.exports = { RoomManager, Room };

// ========================================
// 📚 COURS : COMPRENDRE LE ROOM MANAGER
// ========================================

/*
┌─────────────────────────────────────────────────────────────────┐
│                    🎯 À QUOI ÇA SERT ?                          │
└─────────────────────────────────────────────────────────────────┘

Le RoomManager gère les "salles d'appel" (rooms).
C'est le chef d'orchestre qui :
- Crée et détruit les rooms
- Gère les participants dans chaque room
- Distribue les workers (processus mediasoup)
- Nettoie les ressources quand quelqu'un part


┌─────────────────────────────────────────────────────────────────┐
│                  1️⃣ CLASSE ROOMMANAGER                         │
└─────────────────────────────────────────────────────────────────┘

🔥 RESPONSABILITÉS :
--------------------
- Gérer plusieurs rooms simultanément
- Créer des workers mediasoup au démarrage
- Distribuer la charge entre les workers (load balancing)
- Fournir des rooms aux clients qui se connectent


📊 PROPRIÉTÉS :

this.rooms = new Map()
→ Stocke toutes les rooms actives
→ Structure : Map<roomId, Room>
→ Exemple : { 'room1' => Room, 'room2' => Room }

this.workers = []
→ Liste des workers mediasoup (processus C++)
→ Nombre de workers = nombre de CPU du serveur
→ Chaque worker peut gérer plusieurs rooms

this.nextWorkerIndex = 0
→ Index pour le round-robin (répartition équitable)
→ Permet de distribuer les rooms entre workers


🔧 MÉTHODE : init()
-------------------
async init() {
  const numWorkers = Object.keys(require('os').cpus()).length;
  // Créer 1 worker par CPU
}

💡 Pourquoi créer plusieurs workers ?
- 1 worker = 1 processus C++
- 1 processus = 1 CPU
- Plusieurs workers = utilise tous les CPU
- Serveur 4 cœurs = 4 workers = 4x plus de capacité

🎯 Exemple :
Ton PC a 4 CPU ? → 4 workers créés
Chaque worker peut gérer 10-20 rooms
Total : 40-80 rooms possibles


🔧 MÉTHODE : getNextWorker()
-----------------------------
getNextWorker() {
  const worker = this.workers[this.nextWorkerIndex];
  this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
  return worker;
}

💡 C'est quoi le round-robin ?
Algorithme qui distribue équitablement :

Appel 1 → Worker 0
Appel 2 → Worker 1
Appel 3 → Worker 2
Appel 4 → Worker 3
Appel 5 → Worker 0 (on reboucle)

Résultat : charge équilibrée entre tous les workers


🔧 MÉTHODE : createRoom()
--------------------------
async createRoom(roomId, type = 'video') {
  // Si room existe déjà, la retourner
  if (this.rooms.has(roomId)) {
    return this.rooms.get(roomId);
  }
  
  // Sinon, créer une nouvelle room
  const worker = this.getNextWorker();
  const router = await worker.createRouter({ ... });
  const room = new Room(roomId, type, router);
  this.rooms.set(roomId, room);
  return room;
}

💡 Paramètres :
- roomId : identifiant unique ('room-123', 'meeting-abc', etc.)
- type : 'video' ou 'audio' (défaut: 'video')

🎯 Utilisation :
const room = await roomManager.createRoom('room-123', 'video');


┌─────────────────────────────────────────────────────────────────┐
│                     2️⃣ CLASSE ROOM                             │
└─────────────────────────────────────────────────────────────────┘

🔥 RESPONSABILITÉS :
--------------------
Une room = une salle d'appel
Elle gère :
- Les participants dans cette salle
- Le router mediasoup (gère les flux média)
- Les transports WebRTC de chaque participant
- Les producers (flux envoyés) et consumers (flux reçus)


📊 PROPRIÉTÉS :

this.roomId
→ Identifiant unique de la room

this.type
→ 'video' ou 'audio'
→ Détermine quels flux sont autorisés

this.router
→ Router mediasoup (gère codecs et transports)
→ 1 router par room

this.participants = new Map()
→ Map<socketId, Participant>
→ Stocke tous les participants de la room

Structure d'un participant :
{
  socketId: 'abc123',
  name: 'Paul',
  transports: Map(),    // Transports WebRTC (send + recv)
  producers: Map(),     // Flux envoyés (video + audio)
  consumers: Map(),     // Flux reçus des autres
  joinedAt: 1234567890
}


🔧 MÉTHODE : addParticipant()
------------------------------
addParticipant(socketId, participantData) {
  this.participants.set(socketId, {
    socketId,
    ...participantData,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    joinedAt: Date.now()
  });
}

💡 Ajoute un participant à la room
Initialise les Maps vides pour ses connexions


🔧 MÉTHODE : removeParticipant()
---------------------------------
removeParticipant(socketId) {
  const participant = this.participants.get(socketId);
  if (participant) {
    // Fermer toutes les connexions
    participant.transports.forEach(transport => transport.close());
    participant.producers.forEach(producer => producer.close());
    participant.consumers.forEach(consumer => consumer.close());
    this.participants.delete(socketId);
  }
}

💡 Supprime un participant et nettoie toutes ses ressources
IMPORTANT : Évite les fuites mémoire


┌─────────────────────────────────────────────────────────────────┐
│                  🎬 FLUX D'UTILISATION                          │
└─────────────────────────────────────────────────────────────────┘

1️⃣ DÉMARRAGE SERVEUR
---------------------
const roomManager = new RoomManager();
await roomManager.init(); // Crée les workers

2️⃣ CLIENT REJOINT APPEL VIDÉO
------------------------------
socket.on('join-video-room', async (data) => {
  const room = await roomManager.createRoom(data.roomId, 'video');
  room.addParticipant(socket.id, { name: data.name });
});

3️⃣ CLIENT CRÉE TRANSPORT
-------------------------
const participant = room.getParticipant(socket.id);
const transport = await room.router.createWebRtcTransport({ ... });
participant.transports.set(transport.id, transport);


┌─────────────────────────────────────────────────────────────────┐
│                      ❓ FAQ                                     │
└─────────────────────────────────────────────────────────────────┘

Q: Pourquoi séparer RoomManager et Room ?
R: Séparation des responsabilités :
   - RoomManager : gère TOUTES les rooms
   - Room : gère UNE room spécifique

Q: Peut-on avoir plusieurs rooms avec même roomId ?
R: Non. Un roomId est unique.
   Si room existe, createRoom() retourne la room existante.

Q: Quand supprimer une room ?
R: Quand elle est vide (plus de participants).

Q: Combien de participants max par room ?
R: Dépend du serveur :
   - Serveur moyen : 10-20 participants (vidéo)
   - Serveur moyen : 50-100 participants (audio)

Q: Que se passe-t-il si un worker crash ?
R: Le worker émet 'died' → serveur redémarre
   Les rooms sur ce worker sont perdues.
*/
