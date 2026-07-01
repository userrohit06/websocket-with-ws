let socket;

let username = "";
let selectedUser = null;
let currentRoom = null;

let typingTimeout;
let isTyping = false;

let reconnectTimer = null;
let reconnectDelay = 2000;

const MAX_RECONNECT_DELAY = 30000;

/* ---------------------- DOM ---------------------- */

const joinContainer = document.getElementById("joinContainer");
const chatContainer = document.getElementById("chatContainer");

const usernameInput = document.getElementById("usernameInput");
const joinBtn = document.getElementById("joinBtn");

const onlineUsers = document.getElementById("onlineUsers");

const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const roomList = document.getElementById("roomList");
const selectedRoomLabel = document.getElementById("selectedRoom");

const messageDiv = document.getElementById("messages");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const typingIndicator = document.getElementById("typingIndicator");

const selectedUserLabel = document.getElementById("selectedUserLabel");

/* ---------------------- SOCKET ---------------------- */

function connect() {
  console.log("Creating websocket...");

  socket = new WebSocket("ws://localhost:9000");

  socket.onopen = () => {
    console.log("Connected");

    reconnectDelay = 2000;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (username) {
      socket.send(
        JSON.stringify({
          type: "join",
          username,
        }),
      );

      // Rejoin rooms after reconnect
      joinedRooms.forEach((roomName) => {
        socket.send(
          JSON.stringify({
            type: "join_room",
            roomName,
          }),
        );
      });
    }
  };

  socket.onmessage = handleMessage;

  socket.onerror = (err) => {
    console.log(err);
  };

  socket.onclose = () => {
    console.log("Disconnected");

    scheduleReconnect();
  };
}

connect();

/* ---------------------- RECONNECT ---------------------- */

function scheduleReconnect() {
  if (reconnectTimer) return;

  console.log(`Reconnect in ${reconnectDelay / 1000}s`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    connect();

    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }, reconnectDelay);
}

/* ---------------------- HELPERS ---------------------- */

const joinedRooms = new Set();

function addMessage(text) {
  const p = document.createElement("p");

  p.innerText = text;

  messageDiv.appendChild(p);

  messageDiv.scrollTop = messageDiv.scrollHeight;
}

/* ---------------------- HANDLE MESSAGE ---------------------- */

function handleMessage(event) {
  const data = JSON.parse(event.data);

  console.log(data);

  switch (data.type) {
    case "join":
      addMessage(`${data.username} joined`);
      break;

    case "close":
      addMessage(`${data.username} left`);
      break;

    case "message":
      addMessage(`${data.username}: ${data.text}`);
      break;

    case "private_message":
      addMessage(`[Private] ${data.username}: ${data.text}`);
      break;

    case "typing":
      typingIndicator.innerText = `${data.username} is typing...`;
      break;

    case "stop_typing":
      typingIndicator.innerText = "";
      break;

    case "online_users":
      renderOnlineUsers(data.users);
      break;

    case "room_joined":
      joinedRooms.add(data.roomName);

      currentRoom = data.roomName;

      selectedRoomLabel.innerText = `Current Room : ${currentRoom}`;

      addMessage(`Joined room ${data.roomName}`);

      break;

    case "room_left":
      joinedRooms.delete(data.roomName);

      if (currentRoom === data.roomName) {
        currentRoom = null;

        selectedRoomLabel.innerText = "No Room Selected";
      }

      addMessage(`Left room ${data.roomName}`);

      break;

    case "room_message":
      addMessage(`[${data.roomName}] ${data.username}: ${data.text}`);

      break;

    case "room_error":
      alert(data.message);
      break;

    case "message_sent":
      console.log("Delivered");
      break;

    case "message_failed":
      alert(data.reason);
      break;

    case "rooms_list":
      renderRooms(data.rooms);
      break;

    case "room_user_joined":
      addMessage(`${data.username} joined ${data.roomName}`);
      break;

    case "room_user_left":
      addMessage(`${data.username} left ${data.roomName}`);
      break;
  }
}

/* ---------------------- RENDER USERS ---------------------- */

function renderOnlineUsers(users) {
  onlineUsers.innerHTML = "";

  users.forEach((user) => {
    if (user === username) return;

    const li = document.createElement("li");

    li.innerText = user;

    onlineUsers.appendChild(li);
  });
}

function renderRooms(rooms) {
  roomList.innerHTML = "";

  rooms.forEach((room) => {
    const li = document.createElement("li");

    li.dataset.room = room.roomName;

    li.innerText = `${room.roomName} (${room.members})`;

    roomList.appendChild(li);
  });
}

/* ---------------------- JOIN CHAT ---------------------- */

joinBtn.addEventListener("click", () => {
  username = usernameInput.value.trim();

  if (!username) {
    alert("Enter username");
    return;
  }

  socket.send(
    JSON.stringify({
      type: "join",
      username,
    }),
  );

  joinContainer.style.display = "none";
  chatContainer.style.display = "block";
});

/* ---------------------- CREATE ROOM ---------------------- */

createRoomBtn.addEventListener("click", () => {
  const roomName = roomInput.value.trim();

  if (!roomName) {
    alert("Enter room name");
    return;
  }

  socket.send(
    JSON.stringify({
      type: "create_room",
      roomName,
    }),
  );

  roomInput.value = "";
});

/* ---------------------- SELECT USER ---------------------- */

onlineUsers.addEventListener("click", (e) => {
  if (e.target.tagName !== "LI") return;

  selectedUser = e.target.innerText;

  selectedUserLabel.innerText = `Talking To : ${selectedUser}`;
});

/* ---------------------- SELECT ROOM ---------------------- */

roomList.addEventListener("click", (e) => {
  if (e.target.tagName !== "LI") return;

  const roomName = e.target.dataset.room;

  // already inside
  if (currentRoom === roomName) return;

  // leave previous room
  if (currentRoom) {
    socket.send(
      JSON.stringify({
        type: "leave_room",
        roomName: currentRoom,
      }),
    );
  }

  socket.send(
    JSON.stringify({
      type: "join_room",
      roomName,
    }),
  );
});

/* ---------------------- SEND MESSAGE ---------------------- */

sendBtn.addEventListener("click", () => {
  const message = messageInput.value.trim();

  if (!message) return;

  // stop typing
  if (isTyping) {
    isTyping = false;

    clearTimeout(typingTimeout);

    socket.send(
      JSON.stringify({
        type: "stop_typing",
      }),
    );
  }

  /* ---------- ROOM MESSAGE ---------- */

  if (currentRoom) {
    addMessage(`You (${currentRoom}): ${message}`);

    socket.send(
      JSON.stringify({
        type: "room_message",
        roomName: currentRoom,
        text: message,
      }),
    );

    messageInput.value = "";

    return;
  }

  /* ---------- PRIVATE MESSAGE ---------- */

  if (!selectedUser) {
    alert("Select a user or room first.");

    return;
  }

  addMessage(`You: ${message}`);

  socket.send(
    JSON.stringify({
      type: "private_message",
      to: selectedUser,
      text: message,
    }),
  );

  messageInput.value = "";
});

/* ---------------------- TYPING ---------------------- */

messageInput.addEventListener("input", () => {
  if (!isTyping) {
    isTyping = true;

    socket.send(
      JSON.stringify({
        type: "typing",
      }),
    );
  }

  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    isTyping = false;

    socket.send(
      JSON.stringify({
        type: "stop_typing",
      }),
    );
  }, 2000);
});
