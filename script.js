const socket = io();
let player;

// Tạo player YouTube
function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    height: "360",
    width: "640",
    videoId: "dQw4w9WgXcQ", // 🔥 thay ID video YouTube ở đây
    events: {
      onReady: () => console.log("Player ready"),
    },
  });
}

// Gửi hành động video
document.getElementById("play").onclick = () => {
  player.playVideo();
  socket.emit("video action", { type: "play", time: player.getCurrentTime() });
};

document.getElementById("pause").onclick = () => {
  player.pauseVideo();
  socket.emit("video action", { type: "pause", time: player.getCurrentTime() });
};

// Nhận hành động video
socket.on("video action", (action) => {
  if (!player) return;
  if (action.type === "play") {
    player.seekTo(action.time, true);
    player.playVideo();
  } else if (action.type === "pause") {
    player.seekTo(action.time, true);
    player.pauseVideo();
  }
});

// Chat
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const messages = document.getElementById("messages");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (input.value) {
    const msg = {
      text: input.value,
      time: new Date().toLocaleTimeString(),
    };
    socket.emit("chat message", msg);
    input.value = "";
  }
});

socket.on("chat message", (msg) => {
  const li = document.createElement("li");
  li.textContent = `[${msg.time}] ${msg.text}`;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
});
