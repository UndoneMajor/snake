const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Game state
const players = {};
const food = { x: 0, y: 0 };
const GRID_SIZE = 20;
const CANVAS_SIZE = 600;

// Generate random food position
function generateFood() {
  food.x = Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)) * GRID_SIZE;
  food.y = Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)) * GRID_SIZE;
}

// Initialize food
generateFood();

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`🎮 Player connected: ${socket.id}`);

  // Create new player
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  
  players[socket.id] = {
    id: socket.id,
    x: Math.floor(Math.random() * 20) * GRID_SIZE,
    y: Math.floor(Math.random() * 20) * GRID_SIZE,
    snake: [],
    direction: 'RIGHT',
    color: randomColor,
    score: 0,
    alive: true
  };

  // Initialize snake
  players[socket.id].snake = [
    { x: players[socket.id].x, y: players[socket.id].y }
  ];

  // Send current game state to new player
  socket.emit('init', {
    playerId: socket.id,
    players: players,
    food: food
  });

  // Broadcast new player to all others
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // Handle player movement
  socket.on('changeDirection', (direction) => {
    if (players[socket.id] && players[socket.id].alive) {
      const currentDir = players[socket.id].direction;
      
      // Prevent 180 degree turns
      if (
        (direction === 'UP' && currentDir !== 'DOWN') ||
        (direction === 'DOWN' && currentDir !== 'UP') ||
        (direction === 'LEFT' && currentDir !== 'RIGHT') ||
        (direction === 'RIGHT' && currentDir !== 'LEFT')
      ) {
        players[socket.id].direction = direction;
      }
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`👋 Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Game loop
setInterval(() => {
  Object.keys(players).forEach((playerId) => {
    const player = players[playerId];
    
    if (!player.alive) return;

    // Get current head position
    const head = { ...player.snake[0] };

    // Move based on direction
    switch (player.direction) {
      case 'UP':
        head.y -= GRID_SIZE;
        break;
      case 'DOWN':
        head.y += GRID_SIZE;
        break;
      case 'LEFT':
        head.x -= GRID_SIZE;
        break;
      case 'RIGHT':
        head.x += GRID_SIZE;
        break;
    }

    // Check wall collision
    if (head.x < 0 || head.x >= CANVAS_SIZE || head.y < 0 || head.y >= CANVAS_SIZE) {
      player.alive = false;
      io.emit('playerDied', playerId);
      return;
    }

    // Check self collision
    for (let segment of player.snake) {
      if (head.x === segment.x && head.y === segment.y) {
        player.alive = false;
        io.emit('playerDied', { playerId, killer: null, type: 'self' });
        return;
      }
    }

    // Check collision with other players' bodies
    Object.keys(players).forEach((otherPlayerId) => {
      if (otherPlayerId === playerId) return; // Skip self
      
      const otherPlayer = players[otherPlayerId];
      if (!otherPlayer.alive) return; // Skip dead players
      
      // Check if current player's head hits another player's body
      for (let segment of otherPlayer.snake) {
        if (head.x === segment.x && head.y === segment.y) {
          player.alive = false;
          io.emit('playerDied', { 
            playerId, 
            killer: otherPlayerId, 
            type: 'collision' 
          });
          return;
        }
      }
    });

    // Add new head
    player.snake.unshift(head);

    // Check food collision
    if (head.x === food.x && head.y === food.y) {
      player.score += 10;
      generateFood();
      io.emit('foodEaten', { playerId, food, score: player.score });
    } else {
      // Remove tail if no food eaten
      player.snake.pop();
    }

    // Update player position
    player.x = head.x;
    player.y = head.y;
  });

  // Broadcast game state to all players
  io.emit('gameState', {
    players: players,
    food: food
  });
}, 100); // Update every 100ms

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`\n🎮 Multiplayer Game Server Running!`);
  console.log(`   📍 http://localhost:${PORT}`);
  console.log(`\n   Open multiple browser tabs to play!\n`);
});

