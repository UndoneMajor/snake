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
const PLAYER_SPEED = 3; // Reduced from 5 to 3

// Class configurations
const CLASS_CONFIGS = {
  shotgun: {
    bulletSpeed: 10, // Increased from 6 to 10
    bulletCount: 3,
    spread: 0.3,
    fireRate: 600,
    damage: 20,
    maxAmmo: 20
  },
  sniper: {
    bulletSpeed: 20, // Increased from 15 to 20
    bulletCount: 1,
    spread: 0,
    fireRate: 800,
    damage: 30,
    maxAmmo: 15
  },
  rifle: {
    bulletSpeed: 12, // Increased from 10 to 12
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

// Optimized collision check - early exit
function collidesWithWall(x, y, size = PLAYER_SIZE) {
  const halfSize = size / 2;
  const left = x - halfSize;
  const right = x + halfSize;
  const top = y - halfSize;
  const bottom = y + halfSize;
  
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    if (right > wall.x && 
        left < wall.x + wall.width && 
        bottom > wall.y && 
        top < wall.y + wall.height) {
      return true;
    }
  }
  return false;
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

  // Handle player input - trust client position for smooth movement
  socket.on('playerInput', (data) => {
    if (!players[socket.id]) return;
    
    const player = players[socket.id];
    const { dx, dy, angle } = data;
    
    // Just update what client sends (they handle collision client-side)
    // This makes movement smooth but server still validates major things
    if (dx !== 0 || dy !== 0) {
      const newX = player.x + dx * player.speed;
      const newY = player.y + dy * player.speed;
      
      // Basic bounds check only (trust client for walls)
      player.x = Math.max(PLAYER_SIZE/2, Math.min(MAP_WIDTH - PLAYER_SIZE/2, newX));
      player.y = Math.max(PLAYER_SIZE/2, Math.min(MAP_HEIGHT - PLAYER_SIZE/2, newY));
    }
    
    player.angle = angle;
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

    // Check distance server-side to prevent cheating
    const dx = player.x - powerUp.x;
    const dy = player.y - powerUp.y;
    const distSquared = dx * dx + dy * dy;
    
    if (distSquared > 1600) return; // Must be within 40 pixels

    console.log(`💊 ${socket.id} collected ${powerUp.type}`);

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

// Single game loop - simpler and less buggy
setInterval(() => {
  const bulletIds = Object.keys(bullets);
  const playerIds = Object.keys(players);
  
  // Update bullets
  for (let i = bulletIds.length - 1; i >= 0; i--) {
    const bulletId = bulletIds[i];
    const bullet = bullets[bulletId];
    
    if (!bullet) continue;
    
    bullet.x += bullet.velocityX;
    bullet.y += bullet.velocityY;

    // Quick bounds check first
    if (bullet.x < 0 || bullet.x > MAP_WIDTH || bullet.y < 0 || bullet.y > MAP_HEIGHT) {
      delete bullets[bulletId];
      continue;
    }

    // Check wall collision
    if (collidesWithWall(bullet.x, bullet.y, 10)) {
      delete bullets[bulletId];
      continue;
    }

    // Check collision with players
    let hit = false;
    for (let j = 0; j < playerIds.length; j++) {
      const playerId = playerIds[j];
      if (playerId === bullet.ownerId) continue;
      
      const player = players[playerId];
      if (!player) continue;
      
      const dx = player.x - bullet.x;
      const dy = player.y - bullet.y;
      const distSquared = dx * dx + dy * dy;
      const hitRadius = (PLAYER_SIZE / 2) * (PLAYER_SIZE / 2);

      if (distSquared < hitRadius) {
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
        hit = true;
        break;
      }
    }
    
    if (hit) continue;
  }

  // Broadcast game state
  io.emit('gameState', {
    players: players,
    bullets: bullets
  });
}, 1000 / 20); // Single 20 FPS game loop

server.listen(PORT, () => {
  console.log(`\n🎮 Multiplayer Shooter Server Running!`);
  console.log(`   📍 http://localhost:${PORT}`);
  console.log(`\n   Lock and load! 🔫\n`);
});

