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
const bullets = {};
const powerUps = {};
let bulletIdCounter = 0;
let powerUpIdCounter = 0;

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1800;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 30;
const PLAYER_SPEED = 5;

// Class configurations
const CLASS_CONFIGS = {
  shotgun: {
    bulletSpeed: 6,
    bulletCount: 3,
    spread: 0.3,
    fireRate: 600,
    damage: 20,
    maxAmmo: 20
  },
  sniper: {
    bulletSpeed: 15,
    bulletCount: 1,
    spread: 0,
    fireRate: 800,
    damage: 30,
    maxAmmo: 15
  },
  rifle: {
    bulletSpeed: 10,
    bulletCount: 1,
    spread: 0.05,
    fireRate: 100,
    damage: 15,
    maxAmmo: 40
  }
};

// Walls
const walls = [
  // Border walls
  { x: 0, y: 0, width: MAP_WIDTH, height: 20 }, // Top
  { x: 0, y: MAP_HEIGHT - 20, width: MAP_WIDTH, height: 20 }, // Bottom
  { x: 0, y: 0, width: 20, height: MAP_HEIGHT }, // Left
  { x: MAP_WIDTH - 20, y: 0, width: 20, height: MAP_HEIGHT }, // Right
  
  // Interior walls
  { x: 400, y: 200, width: 200, height: 40 },
  { x: 800, y: 400, width: 40, height: 300 },
  { x: 1200, y: 300, width: 300, height: 40 },
  { x: 600, y: 800, width: 40, height: 400 },
  { x: 1400, y: 600, width: 400, height: 40 },
  { x: 1000, y: 1000, width: 40, height: 300 },
  { x: 300, y: 1200, width: 500, height: 40 },
  { x: 1600, y: 800, width: 40, height: 400 },
  { x: 1800, y: 300, width: 300, height: 40 },
  { x: 500, y: 1400, width: 600, height: 40 },
];

// Check if position collides with walls
function collidesWithWall(x, y, size = PLAYER_SIZE) {
  const halfSize = size / 2;
  return walls.some(wall => 
    x + halfSize > wall.x &&
    x - halfSize < wall.x + wall.width &&
    y + halfSize > wall.y &&
    y - halfSize < wall.y + wall.height
  );
}

// Generate random position (avoiding walls)
function randomPosition() {
  let x, y, attempts = 0;
  do {
    x = Math.random() * (MAP_WIDTH - 100) + 50;
    y = Math.random() * (MAP_HEIGHT - 100) + 50;
    attempts++;
  } while (collidesWithWall(x, y) && attempts < 100);
  
  return { x, y };
}

// Spawn power-ups
function spawnPowerUp() {
  const id = `powerup_${powerUpIdCounter++}`;
  const types = ['health', 'speed', 'ammo'];
  powerUps[id] = {
    id,
    ...randomPosition(),
    type: types[Math.floor(Math.random() * types.length)]
  };
  io.emit('powerUpSpawned', powerUps[id]);
}

// Initial power-ups
setInterval(spawnPowerUp, 10000); // Spawn every 10 seconds
for (let i = 0; i < 3; i++) spawnPowerUp();

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`🎮 Player connected: ${socket.id}`);

  // Wait for class selection
  socket.on('selectClass', (playerClass) => {
    if (!CLASS_CONFIGS[playerClass]) return;

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#E74C3C', '#3498DB'];
    const pos = randomPosition();
    const config = CLASS_CONFIGS[playerClass];
    
    players[socket.id] = {
      id: socket.id,
      x: pos.x,
      y: pos.y,
      angle: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
      health: 100,
      maxHealth: 100,
      score: 0,
      kills: 0,
      deaths: 0,
      speed: PLAYER_SPEED,
      ammo: config.maxAmmo,
      class: playerClass,
      classConfig: config
    };

    // Send init data
    socket.emit('init', {
      playerId: socket.id,
      players: players,
      bullets: bullets,
      powerUps: powerUps,
      walls: walls,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT
    });

    // Broadcast new player
    socket.broadcast.emit('playerJoined', players[socket.id]);

    console.log(`✅ Player joined as ${playerClass}: ${socket.id}`);
  });

  // Handle player movement
  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      const player = players[socket.id];
      
      // Check wall collision before moving
      const newX = Math.max(PLAYER_SIZE/2, Math.min(MAP_WIDTH - PLAYER_SIZE/2, data.x));
      const newY = Math.max(PLAYER_SIZE/2, Math.min(MAP_HEIGHT - PLAYER_SIZE/2, data.y));
      
      if (!collidesWithWall(newX, newY)) {
        player.x = newX;
        player.y = newY;
      } else {
        // Try moving only on X axis
        if (!collidesWithWall(newX, player.y)) {
          player.x = newX;
        }
        // Try moving only on Y axis
        if (!collidesWithWall(player.x, newY)) {
          player.y = newY;
        }
      }
      
      player.angle = data.angle;
    }
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player || player.ammo <= 0) return;

    player.ammo--;
    const config = player.classConfig;

    // Fire multiple bullets (for shotgun)
    for (let i = 0; i < config.bulletCount; i++) {
      const bulletId = `bullet_${bulletIdCounter++}`;
      
      // Calculate spread
      let angle = data.angle;
      if (config.bulletCount > 1) {
        // Shotgun spread
        const spreadOffset = (i - (config.bulletCount - 1) / 2) * config.spread;
        angle += spreadOffset;
      } else if (config.spread > 0) {
        // Random spread for rifle
        angle += (Math.random() - 0.5) * config.spread;
      }

      bullets[bulletId] = {
        id: bulletId,
        x: player.x,
        y: player.y,
        velocityX: Math.cos(angle) * config.bulletSpeed,
        velocityY: Math.sin(angle) * config.bulletSpeed,
        ownerId: socket.id,
        color: player.color,
        damage: config.damage,
        class: player.class
      };

      io.emit('bulletFired', bullets[bulletId]);
    }
  });

  // Handle power-up collection
  socket.on('collectPowerUp', (powerUpId) => {
    const player = players[socket.id];
    const powerUp = powerUps[powerUpId];
    
    if (!player || !powerUp) return;

    switch(powerUp.type) {
      case 'health':
        player.health = Math.min(player.maxHealth, player.health + 30);
        break;
      case 'speed':
        player.speed = PLAYER_SPEED + 2;
        setTimeout(() => { 
          if (players[socket.id]) players[socket.id].speed = PLAYER_SPEED; 
        }, 5000);
        break;
      case 'ammo':
        player.ammo += 10;
        break;
    }

    delete powerUps[powerUpId];
    io.emit('powerUpCollected', powerUpId);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`👋 Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Game loop
setInterval(() => {
  // Update bullets
  Object.keys(bullets).forEach(bulletId => {
    const bullet = bullets[bulletId];
    bullet.x += bullet.velocityX;
    bullet.y += bullet.velocityY;

    // Check wall collision
    if (collidesWithWall(bullet.x, bullet.y, 10)) {
      delete bullets[bulletId];
      return;
    }

    // Remove out of bounds bullets
    if (bullet.x < 0 || bullet.x > MAP_WIDTH || bullet.y < 0 || bullet.y > MAP_HEIGHT) {
      delete bullets[bulletId];
      return;
    }

    // Check collision with players
    Object.keys(players).forEach(playerId => {
      if (playerId === bullet.ownerId) return;
      
      const player = players[playerId];
      const dx = player.x - bullet.x;
      const dy = player.y - bullet.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < PLAYER_SIZE / 2) {
        // Hit!
        const damage = bullet.damage || 20;
        player.health -= damage;
        
        if (player.health <= 0) {
          // Player died
          player.deaths++;
          if (players[bullet.ownerId]) {
            players[bullet.ownerId].kills++;
            players[bullet.ownerId].score += 100;
          }

          // Respawn
          const pos = randomPosition();
          player.x = pos.x;
          player.y = pos.y;
          player.health = 100;
          player.ammo = player.classConfig.maxAmmo;

          io.emit('playerKilled', {
            killerId: bullet.ownerId,
            victimId: playerId
          });
        }

        delete bullets[bulletId];
      }
    });
  });

  // Broadcast game state
  io.emit('gameState', {
    players: players,
    bullets: bullets
  });
}, 1000 / 60); // 60 FPS

server.listen(PORT, () => {
  console.log(`\n🎮 Multiplayer Shooter Server Running!`);
  console.log(`   📍 http://localhost:${PORT}`);
  console.log(`\n   Lock and load! 🔫\n`);
});

