import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const httpServer = createServer(app);
const corsOrigin = process.env.FRONTEND_URL || '*';
const io = new Server(httpServer, {
  cors: { origin: corsOrigin },
});

const redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const chatNamespace = io.of('/chat');

redisSub.on('error', (error: Error) => {
  console.error('Redis subscriber error:', error.message || error.name);
});

redisSub.subscribe('SOCKET_EVENTS', (err) => {
  if (err) {
    console.error('Redis subscribe failed:', err);
  }
});

redisSub.on('message', (channel, raw) => {
  if (channel !== 'SOCKET_EVENTS') return;

  try {
    const payload = JSON.parse(raw);
    if (payload.event !== 'NEW_MESSAGE') return;

    const { channelId, message: chatMessage } = payload.data ?? {};
    if (!channelId || !chatMessage) return;

    chatNamespace.to(channelId).emit('new_message', chatMessage);
  } catch (error) {
    console.error('Invalid SOCKET_EVENTS payload:', error);
  }
});

chatNamespace.on('connection', (socket: Socket) => {
  socket.on('join_room', ({ channelId }: { channelId: string }) => {
    if (channelId) socket.join(channelId);
  });
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down socket server...`);

  void io.close(() => {
    redisSub
      .quit()
      .catch(() => {
        redisSub.disconnect();
      })
      .finally(() => {
        httpServer.close(() => {
          process.exit(0);
        });
      });
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`Socket server listening on ${PORT}`);
});
