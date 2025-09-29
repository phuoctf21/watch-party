const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // phục vụ file tĩnh

let users = 0;

io.on("connection", (socket) => {
  users++;
  io.emit("updateUsers", users);

  socket.on("chatMessage", (msg) => {
    const time = new Date().toLocaleTimeString();
    io.emit("chatMessage", { msg, time });
  });

  socket.on("videoControl", (action) => {
    io.emit("videoControl", action);
  });

  socket.on("disconnect", () => {
    users--;
    io.emit("updateUsers", users);
  });
});

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
