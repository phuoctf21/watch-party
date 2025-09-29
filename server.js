// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static(path.join(__dirname, '/')));

const rooms = {}; // { roomId: { users: {}, playlist: [], current: {videoId, time, paused}, polls: {...} } }

function ensureRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      users: {}, // socketId -> {nick, avatarColor}
      playlist: [], // [{videoId, title, addedBy}]
      current: null, // {videoId, time, paused}
      skipVotes: new Set(),
      polls: {}, // pollId -> {question, options:{opt:count}, voters:set}
    };
  }
  return rooms[roomId];
}

io.on('connection', (socket) => {
  socket.on('join', ({roomId, nick}) => {
    roomId = roomId || 'main';
    socket.join(roomId);
    socket.roomId = roomId;
    socket.nick = nick || 'Guest';
    const room = ensureRoom(roomId);
    room.users[socket.id] = { nick: socket.nick };

    // send room state
    socket.emit('room state', {
      playlist: room.playlist,
      current: room.current,
      users: Object.values(room.users).map(u => u.nick),
      polls: room.polls
    });

    // notify others
    io.to(roomId).emit('user list', Object.values(room.users).map(u => u.nick));
    io.to(roomId).emit('system message', `${socket.nick} đã tham gia phòng.`);
  });

  socket.on('chat message', (msg) => {
    const roomId = socket.roomId || 'main';
    io.to(roomId).emit('chat message', { text: msg.text, time: msg.time, nick: socket.nick });
  });

  socket.on('video action', (action) => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);

    // update room current if change video or time
    if (action.type === 'change') {
      room.current = { videoId: action.videoId, time: action.time || 0, paused: true };
      io.to(roomId).emit('video action', action);
      // push to playlist front if requested
    } else if (action.type === 'setCurrentFromPlaylist') {
      room.current = { videoId: action.videoId, time: 0, paused: true };
      io.to(roomId).emit('video action', action);
    } else {
      // play/pause/seek
      if (!room.current) room.current = { videoId: action.videoId || null, time: action.time || 0, paused: action.type === 'pause' };
      room.current.time = action.time || room.current.time;
      room.current.paused = action.type === 'pause';
      // broadcast to other clients
      socket.to(roomId).emit('video action', action);
    }
  });

  socket.on('add video', ({videoId, title}) => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);
    const entry = { videoId, title: title || videoId, addedBy: socket.nick };
    room.playlist.push(entry);
    io.to(roomId).emit('playlist update', room.playlist);
  });

  socket.on('remove video', (index) => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);
    if (typeof index === 'number' && index >= 0 && index < room.playlist.length) {
      room.playlist.splice(index, 1);
      io.to(roomId).emit('playlist update', room.playlist);
    }
  });

  socket.on('play next', () => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);
    if (room.playlist.length > 0) {
      const next = room.playlist.shift();
      room.current = { videoId: next.videoId, time: 0, paused: true };
      io.to(roomId).emit('playlist update', room.playlist);
      io.to(roomId).emit('video action', { type: 'setCurrentFromPlaylist', videoId: next.videoId });
    }
  });

  socket.on('vote skip', () => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);
    if (!room.skipVotes) room.skipVotes = new Set();
    room.skipVotes.add(socket.id);
    const votes = room.skipVotes.size;
    const needed = Math.ceil(Object.keys(room.users).length / 2);
    io.to(roomId).emit('skip votes', { votes, needed });
    if (votes >= needed) {
      // skip
      room.skipVotes = new Set();
      if (room.playlist.length > 0) {
        const next = room.playlist.shift();
        room.current = { videoId: next.videoId, time: 0, paused: true };
        io.to(roomId).emit('playlist update', room.playlist);
        io.to(roomId).emit('video action', { type: 'setCurrentFromPlaylist', videoId: next.videoId });
        io.to(roomId).emit('system message', 'Vote skip đạt tỉ lệ, chuyển video tiếp theo.');
      } else {
        io.to(roomId).emit('system message', 'Không có video tiếp theo trong playlist.');
      }
    }
  });

  socket.on('reaction', (reaction) => {
    const roomId = socket.roomId || 'main';
    io.to(roomId).emit('reaction', { nick: socket.nick, reaction });
  });

  socket.on('create poll', (poll) => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);
    const id = `poll_${Date.now()}`;
    room.polls[id] = { question: poll.question, options: poll.options.map(o => ({ text: o, votes: 0 })), voters: new Set() };
    io.to(roomId).emit('poll created', { id, poll: room.polls[id] });
  });

  socket.on('vote poll', ({id, optionIndex}) => {
    const roomId = socket.roomId || 'main';
    const room = ensureRoom(roomId);
    const poll = room.polls[id];
    if (!poll) return;
    if (poll.voters.has(socket.id)) {
      socket.emit('system message', 'Bạn đã bầu cho poll này rồi.');
      return;
    }
    poll.options[optionIndex].votes++;
    poll.voters.add(socket.id);
    io.to(roomId).emit('poll update', { id, poll });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (room) {
      delete room.users[socket.id];
      io.to(roomId).emit('user list', Object.values(room.users).map(u => u.nick));
      io.to(roomId).emit('system message', `${socket.nick || 'Một người'} đã rời phòng.`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
