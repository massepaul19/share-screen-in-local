// ========================================
// server/videocall-handlers.js
// Gestionnaire événements Socket.IO - Appel vidéo
// ========================================

const config = require('./mediasoup-config');

function setupVideoCallHandlers(io, roomManager) {
  io.on('connection', (socket) => {
    
    // EVENT: join-video-room
    socket.on('join-video-room', async (data, callback) => {
      try {
        const { roomId, name } = data;
        console.log(`🎥 ${name} rejoint video room: ${roomId}`);

        const room = await roomManager.createRoom(roomId, 'video');
        
        room.addParticipant(socket.id, {
          name,
          socketId: socket.id
        });

        socket.join(roomId);
        socket.data.currentVideoRoom = roomId;

        const rtpCapabilities = room.router.rtpCapabilities;
        const otherParticipants = room.getOtherParticipants(socket.id);

        socket.to(roomId).emit('video-participant-joined', {
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

        console.log(`✅ ${name} dans video room ${roomId} (${room.participants.size} participants)`);
      } catch (error) {
        console.error(`❌ Erreur join-video-room: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // EVENT: create-video-transport
    socket.on('create-video-transport', async (data, callback) => {
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

        console.log(`🚛 Transport créé (${direction}): ${transport.id.slice(0, 8)}`);
      } catch (error) {
        console.error(`❌ Erreur create-video-transport: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // EVENT: connect-video-transport
    socket.on('connect-video-transport', async (data, callback) => {
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
        console.log(`🔗 Transport connecté: ${transportId.slice(0, 8)}`);
      } catch (error) {
        console.error(`❌ Erreur connect-video-transport: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // EVENT: produce-video
    socket.on('produce-video', async (data, callback) => {
      try {
        const { roomId, transportId, kind, rtpParameters } = data;
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
          kind,
          rtpParameters
        });

        participant.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
          producer.close();
          participant.producers.delete(producer.id);
        });

        socket.to(roomId).emit('new-video-producer', {
          producerId: producer.id,
          socketId: socket.id,
          kind
        });

        callback({
          success: true,
          id: producer.id
        });

        console.log(`📹 Producer créé (${kind}): ${producer.id.slice(0, 8)}`);
      } catch (error) {
        console.error(`❌ Erreur produce-video: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // EVENT: consume-video
    socket.on('consume-video', async (data, callback) => {
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
          socket.emit('video-producer-closed', { consumerId: consumer.id });
          consumer.close();
          participant.consumers.delete(consumer.id);
        });

        callback({
          success: true,
          id: consumer.id,
          producerId: producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        });

        console.log(`📺 Consumer créé: ${consumer.id.slice(0, 8)}`);
      } catch (error) {
        console.error(`❌ Erreur consume-video: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // EVENT: resume-video-consumer
    socket.on('resume-video-consumer', async (data, callback) => {
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
        console.log(`▶️  Consumer resumed: ${consumerId.slice(0, 8)}`);
      } catch (error) {
        console.error(`❌ Erreur resume-video-consumer: ${error.message}`);
        callback({ success: false, error: error.message });
      }
    });

    // EVENT: leave-video-room
    socket.on('leave-video-room', async (data) => {
      try {
        const { roomId } = data;
        const room = roomManager.getRoom(roomId);
        
        if (room) {
          room.removeParticipant(socket.id);
          socket.leave(roomId);
          socket.data.currentVideoRoom = null;

          socket.to(roomId).emit('video-participant-left', {
            socketId: socket.id
          });

          if (room.participants.size === 0) {
            roomManager.deleteRoom(roomId);
          }

          console.log(`👋 Participant quitté video room: ${roomId}`);
        }
      } catch (error) {
        console.error(`❌ Erreur leave-video-room: ${error.message}`);
      }
    });

    // EVENT: disconnect
    socket.on('disconnect', () => {
      const roomId = socket.data.currentVideoRoom;
      if (roomId) {
        const room = roomManager.getRoom(roomId);
        if (room) {
          room.removeParticipant(socket.id);
          socket.to(roomId).emit('video-participant-left', {
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

module.exports = { setupVideoCallHandlers };
