const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  pingInterval: 25000,
  pingTimeout: 60000,
  upgradeTimeout: 30000,
  perMessageDeflate: false
});

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1800;
const PLAYER_SPEED = 3;

const CLASS_CONFIGS = {
  shotgun: { bulletSpeed: 25, bulletCount: 3, spread: 0.3, fireRate: 500, damage: 20, maxAmmo: 20 },
  sniper: { bulletSpeed: 50, bulletCount: 1, spread: 0, fireRate: 700, damage: 30, maxAmmo: 15 },
  rifle: { bulletSpeed: 30, bulletCount: 1, spread: 0.05, fireRate: 80, damage: 15, maxAmmo: 40 }
};

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

const SPAWN_POINTS = [
  { x: 100, y: 100 },
  { x: 2300, y: 100 },
  { x: 100, y: 1700 },
  { x: 2300, y: 1700 },
  { x: 1200, y: 900 },
  { x: 200, y: 500 },
  { x: 2200, y: 500 },
  { x: 700, y: 150 },
  { x: 1700, y: 150 },
  { x: 200, y: 1000 },
  { x: 2100, y: 1000 },
  { x: 900, y: 600 }
];

let lastSpawnIndex = 0;

function getSpawnPosition() {
  const spawn = SPAWN_POINTS[lastSpawnIndex];
  lastSpawnIndex = (lastSpawnIndex + 1) % SPAWN_POINTS.length;
  return { ...spawn };
}

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

function collidesWithWall(x, y, size = 10) {
  const halfSize = size / 2;
  for (let wall of walls) {
    if (x + halfSize > wall.x && 
        x - halfSize < wall.x + wall.width && 
        y + halfSize > wall.y && 
        y - halfSize < wall.y + wall.height) {
      return true;
    }
  }
  return false;
}

io.on('connection', (socket) => {
  console.log(`🎮 ${socket.id}`);

  socket.on('selectClass', (playerClass) => {
    if (!CLASS_CONFIGS[playerClass]) return;

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
    const pos = getSpawnPosition();
    const config = CLASS_CONFIGS[playerClass];
    
    players[socket.id] = {
      id: socket.id,
      x: pos.x,
      y: pos.y,
      angle: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
      health: 100,
      score: 0,
      kills: 0,
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
  });

  socket.on('updatePosition', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
    }
  });

  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player || player.ammo <= 0) return;

    player.ammo--;
    const config = player.classConfig;

    for (let i = 0; i < config.bulletCount; i++) {
      let angle = data.angle;
      if (config.bulletCount > 1) {
        angle += (i - (config.bulletCount - 1) / 2) * config.spread;
      } else if (config.spread > 0) {
        angle += (Math.random() - 0.5) * config.spread;
      }

      const bulletId = `bullet_${bulletIdCounter++}`;
      bullets[bulletId] = {
        id: bulletId,
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * config.bulletSpeed,
        vy: Math.sin(angle) * config.bulletSpeed,
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

  socket.on('collectPowerUp', (id) => {
    const player = players[socket.id];
    const powerUp = powerUps[id];
    if (!player || !powerUp) return;

    switch(powerUp.type) {
      case 'health': player.health = Math.min(100, player.health + 30); break;
      case 'speed': 
        player.speed = PLAYER_SPEED + 2;
        setTimeout(() => { if (players[socket.id]) players[socket.id].speed = PLAYER_SPEED; }, 5000);
        break;
      case 'ammo': player.ammo += 10; break;
    }
    delete powerUps[id];
    io.emit('powerUpCollected', id);
  });

  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PLAYER_KEYS = () => Object.keys(players);
const BULLET_KEYS = () => Object.keys(bullets);

setInterval(() => {
  const bulletKeys = BULLET_KEYS();
  const playerKeys = PLAYER_KEYS();
  
  for (let i = 0; i < bulletKeys.length; i++) {
    const bid = bulletKeys[i];
    const b = bullets[bid];
    if (!b) continue;
    
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT || collidesWithWall(b.x, b.y, 10)) {
      delete bullets[bid];
      continue;
    }

    for (let j = 0; j < playerKeys.length; j++) {
      const pid = playerKeys[j];
      if (pid === b.ownerId) continue;
      
      const p = players[pid];
      if (!p) continue;
      
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      
      if (dx * dx + dy * dy < 225) {
        p.health -= b.damage;
        
        if (p.health <= 0) {
          if (players[b.ownerId]) {
            players[b.ownerId].kills++;
            players[b.ownerId].score += 100;
          }
          io.to(pid).emit('youDied', {
            killerId: b.ownerId,
            killerClass: players[b.ownerId]?.class
          });
          delete players[pid];
          io.emit('playerKilled', { killerId: b.ownerId, victimId: pid });
        }
        
        io.emit('bulletHit', bid);
        delete bullets[bid];
        break;
      }
    }
  }

  io.emit('update', { players, bullets });
}, 16);

server.listen(PORT, () => {
  console.log(`\n🎮 Server: http://localhost:${PORT}\n`);
});
