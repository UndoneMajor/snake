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
const MAX_BOTS = 3; // Maximum number of AI bots
let botCounter = 0;

// Generate random food position
function generateFood() {
  food.x = Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)) * GRID_SIZE;
  food.y = Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)) * GRID_SIZE;
}

// Initialize food
generateFood();

// AI Bot names
const botNames = [
  'Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 
  'Bot Sigma', 'Bot Omega', 'Bot Prime', 'Bot Ultra'
];

// Create AI bot
function createBot() {
  const botId = `bot_${botCounter++}`;
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  
  players[botId] = {
    id: botId,
    x: Math.floor(Math.random() * 20) * GRID_SIZE,
    y: Math.floor(Math.random() * 20) * GRID_SIZE,
    snake: [],
    direction: ['UP', 'DOWN', 'LEFT', 'RIGHT'][Math.floor(Math.random() * 4)],
    color: randomColor,
    score: 0,
    alive: true,
    isBot: true,
    name: botNames[Math.floor(Math.random() * botNames.length)],
    number: null // Bots don't have numbers
  };

  players[botId].snake = [
    { x: players[botId].x, y: players[botId].y }
  ];

  console.log(`🤖 Bot spawned: ${players[botId].name}`);
  io.emit('playerJoined', players[botId]);
}

// AI bot decision making
function updateBotDirection(botId) {
  const bot = players[botId];
  if (!bot || !bot.alive) return;

  const head = bot.snake[0];
  
  // Calculate distance to food
  const foodDx = food.x - head.x;
  const foodDy = food.y - head.y;
  
  // Possible directions
  const directions = [];
  
  // Prefer moving towards food
  if (Math.abs(foodDx) > Math.abs(foodDy)) {
    if (foodDx > 0) directions.push('RIGHT');
    else if (foodDx < 0) directions.push('LEFT');
    if (foodDy > 0) directions.push('DOWN');
    else if (foodDy < 0) directions.push('UP');
  } else {
    if (foodDy > 0) directions.push('DOWN');
    else if (foodDy < 0) directions.push('UP');
    if (foodDx > 0) directions.push('RIGHT');
    else if (foodDx < 0) directions.push('LEFT');
  }

  // Add some randomness (20% chance to pick random direction)
  if (Math.random() < 0.2) {
    const allDirections = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    directions.push(allDirections[Math.floor(Math.random() * allDirections.length)]);
  }

  // Try each direction and pick first valid one
  for (let direction of directions) {
    const currentDir = bot.direction;
    
    // Check if valid direction (no 180 degree turns)
    if (
      (direction === 'UP' && currentDir !== 'DOWN') ||
      (direction === 'DOWN' && currentDir !== 'UP') ||
      (direction === 'LEFT' && currentDir !== 'RIGHT') ||
      (direction === 'RIGHT' && currentDir !== 'LEFT')
    ) {
      // Check if this direction is safe
      const testHead = { ...head };
      switch (direction) {
        case 'UP': testHead.y -= GRID_SIZE; break;
        case 'DOWN': testHead.y += GRID_SIZE; break;
        case 'LEFT': testHead.x -= GRID_SIZE; break;
        case 'RIGHT': testHead.x += GRID_SIZE; break;
      }

      // Basic safety check (avoid immediate walls)
      if (testHead.x >= 0 && testHead.x < CANVAS_SIZE && 
          testHead.y >= 0 && testHead.y < CANVAS_SIZE) {
        bot.direction = direction;
        return;
      }
    }
  }
}

// Spawn initial bots
function spawnInitialBots() {
  for (let i = 0; i < MAX_BOTS; i++) {
    createBot();
  }
}

// Respawn bot after death
function respawnBot(botId) {
  setTimeout(() => {
    const botCount = Object.values(players).filter(p => p.isBot && p.alive).length;
    if (botCount < MAX_BOTS) {
      createBot();
    }
  }, 5000); // Respawn after 5 seconds
}

// Initialize bots
setTimeout(spawnInitialBots, 2000); // Spawn bots 2 seconds after server start

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`🎮 Player connected: ${socket.id}`);

  // Wait for player to choose number
  socket.on('chooseNumber', (playerNumber) => {
    // Check if number is already taken
    const numberTaken = Object.values(players).some(p => !p.isBot && p.number === playerNumber);
    
    if (numberTaken) {
      socket.emit('numberTaken', playerNumber);
      return;
    }

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
      alive: true,
      number: playerNumber
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

    console.log(`✅ Player #${playerNumber} joined: ${socket.id}`);
  });

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
  // Update bot directions every tick
  Object.keys(players).forEach((playerId) => {
    if (players[playerId].isBot && players[playerId].alive) {
      updateBotDirection(playerId);
    }
  });

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
      io.emit('playerDied', { playerId, killer: null, type: 'wall' });
      if (player.isBot) {
        respawnBot(playerId);
        delete players[playerId];
      }
      return;
    }

    // Check self collision
    for (let segment of player.snake) {
      if (head.x === segment.x && head.y === segment.y) {
        player.alive = false;
        io.emit('playerDied', { playerId, killer: null, type: 'self' });
        if (player.isBot) {
          respawnBot(playerId);
          delete players[playerId];
        }
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
          if (player.isBot) {
            respawnBot(playerId);
            delete players[playerId];
          }
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

