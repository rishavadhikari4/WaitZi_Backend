import { Server } from 'socket.io';

let io = null;

export function initializeSocket(httpServer, allowedOrigins) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on('join', (rooms) => {
      if (!Array.isArray(rooms)) rooms = [rooms];
      rooms.forEach((room) => {
        if (typeof room === 'string' && room.length < 100) {
          socket.join(room);
        }
      });
    });

    socket.on('leave', (rooms) => {
      if (!Array.isArray(rooms)) rooms = [rooms];
      rooms.forEach((room) => {
        if (typeof room === 'string') {
          socket.leave(room);
        }
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('🔌 Socket.IO initialized');
  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
}

export function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

export function emitOrderEvent(event, { orderId, tableId, order }) {
  if (!io) return;
  const payload = { orderId, tableId, order };

  // Always emit to dashboard (analytics refresh) and admin-alerts (persistent layout notification)
  io.to('dashboard').emit(event, payload);
  io.to('admin-alerts').emit(event, payload);

  // Emit to kitchen for relevant events
  if (['order:new', 'order:status-updated', 'order:item-updated', 'order:cancelled', 'order:items-added'].includes(event)) {
    io.to('kitchen').emit(event, payload);
  }

  // Emit to specific table room
  if (tableId) {
    io.to(`table:${tableId}`).emit(event, payload);
  }

  // Emit to specific order room
  if (orderId) {
    io.to(`order:${orderId}`).emit(event, payload);
  }
}
