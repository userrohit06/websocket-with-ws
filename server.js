const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();

app.use(express.static("public"));

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const rooms = new Map();

const HEARTBEAT_INTERVAL = 30000;
const PORT = 9000;

function getOnlineUsers() {
  const users = [];

  wss.clients.forEach((client) => {
    if (client.username) {
      users.push(client.username);
    }
  });

  return users;
}

function broadcastOnlineUsers() {
  const users = getOnlineUsers();

  wss.clients.forEach((client) => {
    if (!client.username) return;

    client.send(
      JSON.stringify({
        type: "online_users",
        users,
      }),
    );
  });
}

function broadcastRoomCreated(roomName) {
  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: "room_created",
        roomName,
      }),
    );
  });
}

function broadcastRooms() {
  const roomList = [];

  for (const [roomName, room] of rooms) {
    roomList.push({ roomName, members: room.members.size });
  }

  wss.clients.forEach((client) => {
    client.send(
      JSON.stringify({
        type: "rooms_list",
        rooms: roomList,
      }),
    );
  });
}

wss.on("connection", (socket) => {
  socket.id = Math.random().toString(36).slice(2, 8);
  socket.username = null;
  socket.isAlive = true;
  socket.rooms = new Set();

  console.log(`Client Connected : ${socket.id}`);

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (message) => {
    const data = JSON.parse(message.toString());

    console.log(`Received from ${socket.id}`, data);

    /* ---------------------- CREATE ROOM ---------------------- */

    if (data.type === "create_room") {
      const roomName = data.roomName?.trim();

      if (!roomName) {
        socket.send(
          JSON.stringify({
            type: "room_error",
            message: "Room name required",
          }),
        );

        return;
      }

      if (rooms.has(roomName)) {
        socket.send(
          JSON.stringify({
            type: "room_error",
            message: "Room already exists",
          }),
        );

        return;
      }

      rooms.set(roomName, {
        members: new Set(),
      });

      console.log(`Room Created : ${roomName}`);

      console.log(rooms);

      // broadcastRoomCreated(roomName);
      broadcastRooms();

      return;
    }

    /* ---------------------- JOIN ROOM ---------------------- */

    if (data.type === "join_room") {
      const room = rooms.get(data.roomName);

      if (!room) {
        socket.send(
          JSON.stringify({
            type: "room_error",
            message: "Room does not exist",
          }),
        );

        return;
      }

      room.members.add(socket);
      broadcastRooms();

      socket.rooms.add(data.roomName);

      for (const client of room.members) {
        if (client === socket) return;

        client.send(
          JSON.stringify({
            type: "room_user_joined",
            roomName: data.roomName,
            username: socket.username,
          }),
        );
      }

      socket.send(
        JSON.stringify({
          type: "room_joined",
          roomName: data.roomName,
        }),
      );

      console.log(`${socket.username} joined ${data.roomName}`);

      return;
    }

    /* ---------------------- LEAVE ROOM ---------------------- */

    if (data.type === "leave_room") {
      const room = rooms.get(data.roomName);

      if (!room) {
        socket.send(
          JSON.stringify({
            type: "room_error",
            message: "Room does not exist",
          }),
        );

        return;
      }

      for (const client of room.members) {
        if (client === socket) return;

        client.send(
          JSON.stringify({
            type: "room_user_left",
            roomName: data.roomName,
            username: socket.username,
          }),
        );
      }

      room.members.delete(socket);
      broadcastRooms();

      socket.rooms.delete(data.roomName);

      console.log(`${socket.username} left ${data.roomName}`);

      if (room.members.size === 0) {
        rooms.delete(data.roomName);

        console.log(`Room Deleted : ${data.roomName}`);
      }

      socket.send(
        JSON.stringify({
          type: "room_left",
          roomName: data.roomName,
        }),
      );

      return;
    }

    /* ---------------------- ROOM MESSAGE ---------------------- */

    if (data.type === "room_message") {
      const room = rooms.get(data.roomName);

      if (!room) {
        socket.send(
          JSON.stringify({
            type: "room_error",
            message: "Room does not exist",
          }),
        );

        return;
      }

      if (!room.members.has(socket)) {
        socket.send(
          JSON.stringify({
            type: "room_error",
            message: "You are not a member of this room",
          }),
        );

        return;
      }

      for (const client of room.members) {
        if (client === socket) continue;

        client.send(
          JSON.stringify({
            type: "room_message",
            roomName: data.roomName,
            username: socket.username,
            text: data.text,
          }),
        );
      }

      return;
    }

    /* ---------------------- JOIN CHAT ---------------------- */

    if (data.type === "join") {
      socket.username = data.username;

      socket.send(
        JSON.stringify({
          type: "rooms_list",
          rooms: [...rooms.keys()],
        }),
      );

      broadcastOnlineUsers();

      console.log(`${socket.id} -> ${socket.username}`);

      wss.clients.forEach((client) => {
        if (client === socket) return;

        if (!client.username) return;

        client.send(
          JSON.stringify({
            type: "join",
            username: socket.username,
          }),
        );
      });

      return;
    }
    /* ---------------------- TYPING ---------------------- */

    if (data.type === "typing") {
      wss.clients.forEach((client) => {
        if (client === socket) return;

        if (!client.username) return;

        client.send(
          JSON.stringify({
            type: "typing",
            username: socket.username,
          }),
        );
      });

      return;
    }

    /* ---------------------- STOP TYPING ---------------------- */

    if (data.type === "stop_typing") {
      wss.clients.forEach((client) => {
        if (client === socket) return;

        if (!client.username) return;

        client.send(
          JSON.stringify({
            type: "stop_typing",
            username: socket.username,
          }),
        );
      });

      return;
    }

    /* ---------------------- PUBLIC MESSAGE ---------------------- */

    if (data.type === "message") {
      wss.clients.forEach((client) => {
        if (client === socket) return;

        client.send(
          JSON.stringify({
            type: "message",
            username: socket.username,
            text: data.text,
          }),
        );
      });

      return;
    }

    /* ---------------------- PRIVATE MESSAGE ---------------------- */

    if (data.type === "private_message") {
      let receiver = null;

      for (const client of wss.clients) {
        if (client.username === data.to) {
          receiver = client;
          break;
        }
      }

      if (!receiver) {
        socket.send(
          JSON.stringify({
            type: "message_failed",
            reason: "User is offline",
          }),
        );

        return;
      }

      receiver.send(
        JSON.stringify({
          type: "private_message",
          username: socket.username,
          text: data.text,
        }),
      );

      socket.send(
        JSON.stringify({
          type: "message_sent",
        }),
      );

      return;
    }
  });

  /* ---------------------- DISCONNECT ---------------------- */

  socket.on("close", () => {
    console.log(`${socket.username || socket.id} disconnected`);

    // Remove from every joined room
    for (const roomName of socket.rooms) {
      const room = rooms.get(roomName);

      if (!room) continue;

      room.members.delete(socket);
      broadcastRooms();

      console.log(`${socket.username} removed from ${roomName}`);

      if (room.members.size === 0) {
        rooms.delete(roomName);
        broadcastRooms();

        console.log(`Room Deleted : ${roomName}`);
      }
    }

    // Notify users
    wss.clients.forEach((client) => {
      if (client === socket) return;

      if (!client.username) return;

      client.send(
        JSON.stringify({
          type: "close",
          username: socket.username,
        }),
      );
    });

    broadcastOnlineUsers();
  });
});

/* ---------------------- HEARTBEAT ---------------------- */

setInterval(() => {
  for (const client of wss.clients) {
    if (!client.isAlive) {
      console.log(`${client.username || client.id} timed out`);

      client.terminate();

      continue;
    }

    client.isAlive = false;

    client.ping();
  }
}, HEARTBEAT_INTERVAL);

/* ---------------------- SERVER ---------------------- */

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
