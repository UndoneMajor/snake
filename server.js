const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Game constants
const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1800;
const PLAYER_SIZE = 30;
const PLAYER_SPEED = 3;

// Class configs
const CLASS_CONFIGS = {
  shotgun: { bulletSpeed: 10, bulletCount: 3, spread: 0.3, fireRate: 600, damage: 20, maxAmmo: 20 },
  sniper: { bulletSpeed: 20, bulletCount: 1, spread: 0, fireRate: 800, damage: 30, maxAmmo: 15 },
  rifle: { bulletSpeed: 12, bulletCount: 1, spread: 0.05, fireRate: 100, damage: 15, maxAmmo: 40 }
};

// Walls
const walls = [
  { x: 0, y: 0, width: MAP_WIDTH, height: 20 },
  { x: 0, y: MAP_HEIGHT - 20, width: MAP_WIDTH, height: 20 },
  { x: 0, y: 0, width: 20, height: MAP_HEIGHT },
  { x: MAP_WIDTH - 20, y: 0, width: 20, height: MAP_HEIGHT },
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

const players = {};
const bullets = {};
const powerUps = {};
let bulletIdCounter = 0;
let powerUpIdCounter = 0;

function randomPosition() {
  return {
    x: Math.random() * (MAP_WIDTH - 100) + 50,
    y: Math.random() * (MAP_HEIGHT - 100) + 50
  };
}

function spawnPowerUp() {
  const id = `powerup_${powerUpIdCounter++}`;
  powerUps[id] = {
    id,
    ...randomPosition(),
    type: ['health', 'speed', 'ammo'][Math.floor(Math.random() * 3)]
  };
  io.emit('powerUpSpawned', powerUps[id]);
}

setInterval(spawnPowerUp, 10000);
for (let i = 0; i < 3; i++) spawnPowerUp();

io.on('connection', (socket) => {
  console.log(`🎮 Player connected: ${socket.id}`);

  socket.on('selectClass', (playerClass) => {
    if (!CLASS_CONFIGS[playerClass]) return;

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
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

    socket.emit('init', {
      playerId: socket.id,
      players: players,
      bullets: bullets,
      powerUps: powerUps,
      walls: walls,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT
    });

    socket.broadcast.emit('playerJoined', players[socket.id]);
    console.log(`✅ ${playerClass}: ${socket.id}`);
  });

  // Simple position update - trust client
  socket.on('updatePosition', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].angle = data.angle;
    }
  });

  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player || player.ammo <= 0) return;

    player.ammo--;
    const config = player.classConfig;

    for (let i = 0; i < config.bulletCount; i++) {
      const bulletId = `bullet_${bulletIdCounter++}`;
      let angle = data.angle;
      
      if (config.bulletCount > 1) {
        angle += (i - (config.bulletCount - 1) / 2) * config.spread;
      } else if (config.spread > 0) {
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

  socket.on('collectPowerUp', (powerUpId) => {
    const player = players[socket.id];
    const powerUp = powerUps[powerUpId];
    if (!player || !powerUp) return;

    switch(powerUp.type) {
      case 'health':
        player.health = Math.min(100, player.health + 30);
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

  socket.on('disconnect', () => {
    console.log(`👋 Disconnect: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Game loop - bullets only
setInterval(() => {
  Object.keys(bullets).forEach(bulletId => {
    const bullet = bullets[bulletId];
    if (!bullet) return;
    
    bullet.x += bullet.velocityX;
    bullet.y += bullet.velocityY;

    // Remove out of bounds
    if (bullet.x < 0 || bullet.x > MAP_WIDTH || bullet.y < 0 || bullet.y > MAP_HEIGHT) {
      delete bullets[bulletId];
      return;
    }

    // Check player hits
    Object.keys(players).forEach(playerId => {
      if (playerId === bullet.ownerId) return;
      const player = players[playerId];
      if (!player) return;
      
      const dx = player.x - bullet.x;
      const dy = player.y - bullet.y;
      
      if (dx * dx + dy * dy < 225) { // Hit radius
        player.health -= bullet.damage;
        
        if (player.health <= 0) {
          player.deaths++;
          if (players[bullet.ownerId]) {
            players[bullet.ownerId].kills++;
            players[bullet.ownerId].score += 100;
          }

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

  // Broadcast at 20 FPS
  io.emit('gameState', {
    players: players,
    bullets: bullets
  });
}, 50); // 20 FPS

server.listen(PORT, () => {
  console.log(`\n🎮 Server Running: http://localhost:${PORT}\n`);
});
