/*
 * Real-time push over Socket.IO.
 *
 * Clients connect with their JWT (`auth: { token }`). The handshake runs the same checks as
 * middleware/auth.js (signature, expiry, revoked tokens). Rooms are chosen by the server from the
 * verified token, never by the client:
 *   'authenticated'      every signed-in socket
 *   'user:<user_id>'     one person (all their tabs)
 *   'role:<role>'        everyone with a role, e.g. 'role:supervisor'
 *
 * Emitters are no-ops until init() runs, so the REST API and the tests work without a socket server.
 */
const { Server } = require('socket.io');
const { resolveSession } = require('./utils/session');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',') },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing token'));
    try {
      const { decoded, user } = await resolveSession(token);
      socket.user = { ...decoded, role: user.role };
      return next();
    } catch (err) {
      return next(new Error(err.message));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role, exp } = socket.user;
    socket.join(['authenticated', `user:${userId}`, `role:${role}`]);

    // Drop the connection when the token expires; the client reconnects with a fresh login.
    if (exp) {
      const ms = exp * 1000 - Date.now();
      const timer = setTimeout(() => socket.disconnect(true), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
      socket.on('disconnect', () => clearTimeout(timer));
    }
  });

  return io;
}

const toAll = (event, data) => io?.to('authenticated').emit(event, data);
const toUser = (userId, event, data) => io?.to(`user:${userId}`).emit(event, data);
const toRole = (role, event, data) => io?.to(`role:${role}`).emit(event, data);

/** Tells a user's open apps they have been signed out, then closes their sockets. */
function signOutUser(userId, reason) {
  if (!io) return;
  io.to(`user:${userId}`).emit('session:ended', { reason });
  io.in(`user:${userId}`).disconnectSockets(true);
}

module.exports = { init, toAll, toUser, toRole, signOutUser };
