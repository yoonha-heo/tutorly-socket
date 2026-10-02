import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const httpServer = createServer(express());
const io = new Server(httpServer, { cors: { origin: '*' } });
const redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const chatNamespace = io.of('/chat');

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

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`Socket server listening on ${PORT}`);
});
