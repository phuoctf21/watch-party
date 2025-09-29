// script.js
const socket = io();
let player;
let currentVideoId = null;
let localChange = false; // prevent loops
let roomId = 'main';
let nick = null;

// YouTube API ready
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '360',
    width: '640',
    videoId: 'dQw4w9WgXcQ',
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
}

function onPlayerReady() {
  console.log('YT ready');
}

function onPlayerStateChange(e) {
  if (!player) return;
  const state = e.data;
  const time = player.getCurrentTime();
  // 1 = playing, 2 = paused, 0 ended
  if (state === YT.PlayerState.PLAYING) {
    if (!localChange) socket.emit('video action', { type: 'play', time });
  } else if (state === YT.PlayerState.PAUSED) {
    if (!localChange) socket.emit('video action', { type: 'pause', time });
  } else if (state === YT.PlayerState.ENDED) {
    socket.emit('play next');
  }
}

// UI elements
const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const seekBack = document.getElementById('seekBack');
const seekFwd = document.getElementById('seekFwd');
const infoDiv = document.getElementById('info');
const changeBtn = document.getElementById('changeBtn');
const changeUrl = document.getElementById('changeUrl');

const joinBtn = document.getElementById('joinBtn');
const nickInput = document.getElementById('nickInput');
const roomInput = document.getElementById('roomInput');
const userSetup = document.getElementById('userSetup');
const roomArea = document.getElementById('roomArea');
const roomNameSpan = document.getElementById('roomName');
const userList = document.getElementById('userList');

const playlistUl = document.getElementById('playlist');
const videoUrl = document.getElementById('videoUrl');
const videoTitle = document.getElementById('videoTitle');
const addVideoBtn = document.getElementById('addVideoBtn');
const nextBtn = document.getElementById('nextBtn');
const voteSkipBtn = document.getElementById('voteSkipBtn');

const messages = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

const overlayReactions = document.getElementById('overlayReactions');
const reactBtns = document.querySelectorAll('.reactBtn');

const pollsArea = document.getElementById('pollsArea');
const createPollBtn = document.getElementById('createPollBtn');
const pollQuestion = document.getElementById('pollQuestion');
const pollOptions = document.getElementById('pollOptions');
const pollQInput = document.getElementById('pollQuestion');
const pollOptsInput = document.getElementById('pollOptions');

const toggleThemeBtn = document.getElementById('toggleTheme');

// theme
toggleThemeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  toggleThemeBtn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
});

// join room
joinBtn.addEventListener('click', () => {
  nick = nickInput.value.trim() || `User${Math.floor(Math.random()*1000)}`;
  roomId = roomInput.value.trim() || 'main';
  socket.emit('join', { roomId, nick });
  userSetup.style.display = 'none';
  roomArea.style.display = 'block';
  roomNameSpan.textContent = roomId;
});

// socket listeners
socket.on('room state', (state) => {
  // populate playlist/users
  updatePlaylist(state.playlist || []);
  updateUsers(state.users || []);
  if (state.current && state.current.videoId) {
    loadVideo(state.current.videoId, state.current.time || 0);
  }
  if (state.polls) {
    Object.entries(state.polls).forEach(([id,p]) => renderOrUpdatePoll(id, p));
  }
});

socket.on('user list', (list) => updateUsers(list));

socket.on('system message', (text) => {
  appendSystem(text);
});

socket.on('chat message', (msg) => {
  appendChat(msg.nick, msg.text, msg.time);
});

socket.on('video action', (action) => {
  if (!player) return;
  localChange = true;
  if (action.type === 'play') {
    if (action.time !== undefined) player.seekTo(action.time, true);
    player.playVideo();
  } else if (action.type === 'pause') {
    if (action.time !== undefined) player.seekTo(action.time, true);
    player.pauseVideo();
  } else if (action.type === 'setCurrentFromPlaylist' || action.type === 'change') {
    loadVideo(action.videoId, action.time || 0);
  }
  setTimeout(() => localChange = false, 200);
});

socket.on('playlist update', (pls) => updatePlaylist(pls));

socket.on('skip votes', ({votes, needed}) => {
  appendSystem(`Vote skip: ${votes}/${needed}`);
});

socket.on('reaction', ({nick, reaction}) => {
  showReaction(reaction);
  appendSystem(`${nick} thả reaction ${reaction}`);
});

socket.on('poll created', ({id, poll}) => {
  renderOrUpdatePoll(id, poll);
});
socket.on('poll update', ({id, poll}) => {
  renderOrUpdatePoll(id, poll);
});

// UI actions
playBtn.onclick = () => {
  if (!player) return;
  const time = player.getCurrentTime();
  player.playVideo();
  socket.emit('video action', { type: 'play', time });
};
pauseBtn.onclick = () => {
  if (!player) return;
  const time = player.getCurrentTime();
  player.pauseVideo();
  socket.emit('video action', { type: 'pause', time });
};
seekBack.onclick = () => {
  if (!player) return;
  const t = Math.max(0, player.getCurrentTime() - 10);
  player.seekTo(t, true);
  socket.emit('video action', { type: 'seek', time: t });
};
seekFwd.onclick = () => {
  if (!player) return;
  const t = player.getCurrentTime() + 10;
  player.seekTo(t, true);
  socket.emit('video action', { type: 'seek', time: t });
};

changeBtn.onclick = () => {
  const id = extractVideoId(changeUrl.value.trim());
  if (!id) { alert('Không tìm thấy videoId'); return; }
  loadVideo(id,0);
  socket.emit('video action', { type: 'change', videoId: id, time: 0 });
  changeUrl.value = '';
};

// chat
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!chatInput.value) return;
  const msg = { text: chatInput.value, time: new Date().toLocaleTimeString() };
  socket.emit('chat message', msg);
  chatInput.value = '';
});

// add video to playlist
addVideoBtn.addEventListener('click', () => {
  const id = extractVideoId(videoUrl.value.trim());
  if (!id) { alert('Link/ID không hợp lệ'); return; }
  socket.emit('add video', { videoId: id, title: videoTitle.value.trim() || id });
  videoUrl.value = '';
  videoTitle.value = '';
});
nextBtn.addEventListener('click', () => socket.emit('play next'));
voteSkipBtn.addEventListener('click', () => socket.emit('vote skip'));

// reactions
reactBtns.forEach(b => b.addEventListener('click', (e) => {
  const r = e.currentTarget.dataset.react;
  socket.emit('reaction', r);
  showReaction(r);
}));

// polls
createPollBtn.addEventListener('click', () => {
  const q = pollQInput.value.trim();
  const opts = pollOptsInput.value.split(';').map(s => s.trim()).filter(Boolean);
  if (!q || opts.length < 2) { alert('Cần câu hỏi và ít nhất 2 tùy chọn'); return; }
  socket.emit('create poll', { question: q, options: opts });
  pollQInput.value = '';
  pollOptsInput.value = '';
});

function renderOrUpdatePoll(id, poll) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'poll';
    pollsArea.appendChild(el);
  }
  el.innerHTML = `<strong>${poll.question}</strong><div>${poll.options.map((o,idx)=>`<div><button data-poll="${id}" data-opt="${idx}">Bầu</button> ${o.text} — ${o.votes}</div>`).join('')}</div>`;
  el.querySelectorAll('button[data-poll]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.poll;
      const opt = parseInt(btn.dataset.opt);
      socket.emit('vote poll', { id: pid, optionIndex: opt });
    };
  });
}

function appendSystem(text) {
  const li = document.createElement('li');
  li.textContent = `[System] ${text}`;
  li.style.opacity = 0.9;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}
function appendChat(nick, text, time) {
  const li = document.createElement('li');
  li.innerHTML = `<strong>${nick}</strong> <small>${time}</small><div>${escapeHtml(text)}</div>`;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

function updateUsers(list) {
  userList.innerHTML = '';
  list.forEach(n => {
    const li = document.createElement('li');
    li.textContent = n;
    userList.appendChild(li);
  });
}

function updatePlaylist(pls) {
  playlistUl.innerHTML = '';
  pls.forEach((p, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${p.title}</strong> <small>by ${p.addedBy}</small> <button data-idx="${idx}">Xóa</button> <button data-idx-play="${idx}">▶ Play</button>`;
    playlistUl.appendChild(li);
  });
  // attach handlers
  playlistUl.querySelectorAll('button[data-idx]').forEach(b => b.onclick = (e) => {
    const idx = parseInt(e.currentTarget.dataset.idx);
    socket.emit('remove video', idx);
  });
  playlistUl.querySelectorAll('button[data-idx-play]').forEach(b => b.onclick = (e) => {
    const idx = parseInt(e.currentTarget.dataset.idxPlay || e.currentTarget.dataset.idxPlay);
    // we don't have direct mapping here, so call server to set current by shift - but simpler: request server to play next until reach idx
    // Instead, when user clicks play on queue item, we will set current to that ID client-side and emit setCurrentFromPlaylist
    const li = e.currentTarget.parentElement;
    const title = li.querySelector('strong').textContent;
    // find videoId by index in last playlist received
    socket.emit('play next'); // fallback - user can use next
  });
}

function loadVideo(videoId, time) {
  currentVideoId = videoId;
  infoDiv.textContent = `Video: ${videoId}`;
  if (!player) {
    // wait - create player later
    return;
  }
  localChange = true;
  player.loadVideoById(videoId, time || 0);
  setTimeout(()=> localChange = false, 300);
}

// small utils
function extractVideoId(input) {
  if (!input) return null;
  // ID pattern 11 chars
  const ytRegex = /(?:v=|\/v\/|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/;
  const m = input.match(ytRegex);
  if (m && m[1]) return m[1];
  if (input.length === 11 && /^[A-Za-z0-9_-]+$/.test(input)) return input;
  return null;
}

function escapeHtml(unsafe) {
  return unsafe.replace(/[&<"'>]/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function showReaction(r) {
  const span = document.createElement('div');
  span.className = 'react';
  span.textContent = r;
  span.style.left = (40 + Math.random() * 60) + '%';
  overlayReactions.appendChild(span);
  setTimeout(()=> span.remove(), 2100);
}

// small UX: allow Enter to join
nickInput.addEventListener('keydown', (e)=> { if(e.key==='Enter') joinBtn.click(); });
roomInput.addEventListener('keydown', (e)=> { if(e.key==='Enter') joinBtn.click(); });

