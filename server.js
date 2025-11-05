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
const PLAYER_HIT_RADIUS = 20;

const CLASS_CONFIGS = {
  shotgun: { 
    bulletSpeed: 25, 
    bulletCount: 3, 
    spread: 0.3, 
    fireRate: 500, 
    damage: 35,
    maxAmmo: 4,
    maxReserve: 36,
    reloadTime: 2000,
    speed: PLAYER_SPEED * 1.15
  },
  sniper: { 
    bulletSpeed: 50, 
    bulletCount: 1, 
    spread: 0, 
    fireRate: 700, 
    baseDamage: 20,
    maxDamage: 60,
    maxAmmo: 5,
    maxReserve: 20,
    reloadTime: 2500,
    speed: PLAYER_SPEED
  },
  rifle: { 
    bulletSpeed: 30, 
    bulletCount: 1, 
    spread: 0.05, 
    fireRate: 80, 
    damage: 15,
    maxAmmo: 30,
    maxReserve: 60,
    reloadTime: 1500,
    speed: PLAYER_SPEED * 0.85
  },
  pyro: {
    bulletSpeed: 6,
    bulletCount: 1,
    spread: 0.3,
    fireRate: 80,
    damage: 12,
    maxAmmo: 100,
    maxReserve: 100,
    reloadTime: 3000,
    speed: PLAYER_SPEED * 1.05,
    isFlame: true,
    flameRange: 150
  }
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
let botIdCounter = 0;
const MAX_BOTS = 5;

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

const BOT_NAMES = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'SIGMA', 'OMEGA', 'PRIME', 'NEXUS'];

function createBot() {
  const botId = `bot_${botIdCounter++}`;
  const classes = ['shotgun', 'sniper', 'rifle', 'pyro'];
  const botClass = classes[Math.floor(Math.random() * classes.length)];
  const config = CLASS_CONFIGS[botClass];
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
  const pos = getSpawnPosition();
  
  players[botId] = {
    id: botId,
    x: pos.x,
    y: pos.y,
    angle: Math.random() * Math.PI * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    health: 100,
    score: 0,
    kills: 0,
    speed: config.speed,
    ammo: config.maxAmmo,
    reserve: config.maxReserve,
    class: botClass,
    classConfig: config,
    isBot: true,
    isReloading: false,
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    targetX: pos.x,
    targetY: pos.y,
    lastShot: 0
  };

  io.emit('playerJoined', players[botId]);
  console.log(`🤖 Bot ${players[botId].name} (${botClass})`);
}

function updateBot(botId) {
  const bot = players[botId];
  if (!bot || !bot.isBot) return;

  if (Math.random() < 0.02) {
    bot.targetX = Math.random() * MAP_WIDTH;
    bot.targetY = Math.random() * MAP_HEIGHT;
  }

  const dx = bot.targetX - bot.x;
  const dy = bot.targetY - bot.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 10) {
    const moveX = (dx / dist) * bot.speed;
    const moveY = (dy / dist) * bot.speed;
    
    const newX = bot.x + moveX;
    const newY = bot.y + moveY;
    
    if (!collidesWithWall(newX, newY, 30)) {
      bot.x = newX;
      bot.y = newY;
    } else {
      if (!collidesWithWall(newX, bot.y, 30)) bot.x = newX;
      if (!collidesWithWall(bot.x, newY, 30)) bot.y = newY;
      
      bot.targetX = Math.random() * MAP_WIDTH;
      bot.targetY = Math.random() * MAP_HEIGHT;
    }
  }

  const nearestPlayer = Object.values(players)
    .filter(p => p.id !== botId)
    .sort((a, b) => {
      const distA = Math.hypot(a.x - bot.x, a.y - bot.y);
      const distB = Math.hypot(b.x - bot.x, b.y - bot.y);
      return distA - distB;
    })[0];

  if (nearestPlayer) {
    bot.angle = Math.atan2(nearestPlayer.y - bot.y, nearestPlayer.x - bot.x);
    
    const distToPlayer = Math.hypot(nearestPlayer.x - bot.x, nearestPlayer.y - bot.y);
    const now = Date.now();
    
    if (bot.ammo === 0 && bot.reserve > 0 && !bot.isReloading) {
      bot.isReloading = true;
      setTimeout(() => {
        if (players[botId]) {
          const needed = bot.classConfig.maxAmmo;
          const toReload = Math.min(needed, bot.reserve);
          bot.ammo = toReload;
          bot.reserve -= toReload;
          bot.isReloading = false;
        }
      }, bot.classConfig.reloadTime);
    }
    
    if (distToPlayer < 400 && bot.ammo > 0 && !bot.isReloading && now - bot.lastShot > bot.classConfig.fireRate) {
      bot.lastShot = now;
      bot.ammo--;
      bot.isShooting = true;
      
      setTimeout(() => {
        if (players[botId]) {
          players[botId].isShooting = false;
        }
      }, 100);
      
      if (bot.class !== 'pyro') {
        for (let i = 0; i < bot.classConfig.bulletCount; i++) {
          let angle = bot.angle;
          if (bot.classConfig.bulletCount > 1) {
            angle += (i - (bot.classConfig.bulletCount - 1) / 2) * bot.classConfig.spread;
          }

          const damage = bot.class === 'sniper' ? bot.classConfig.baseDamage : bot.classConfig.damage;

          const bulletId = `bullet_${bulletIdCounter++}`;
          bullets[bulletId] = {
            id: bulletId,
            x: bot.x,
            y: bot.y,
            vx: Math.cos(angle) * bot.classConfig.bulletSpeed,
            vy: Math.sin(angle) * bot.classConfig.bulletSpeed,
            velocityX: Math.cos(angle) * bot.classConfig.bulletSpeed,
            velocityY: Math.sin(angle) * bot.classConfig.bulletSpeed,
            ownerId: botId,
            color: bot.color,
            damage: damage,
            class: bot.class,
            startX: bot.x,
            startY: bot.y
          };
          io.emit('bulletFired', bullets[bulletId]);
        }
      }
    }
  }

  Object.values(powerUps).forEach(powerUp => {
    const dx = bot.x - powerUp.x;
    const dy = bot.y - powerUp.y;
    if (dx * dx + dy * dy < 900) {
      switch(powerUp.type) {
        case 'health': bot.health = Math.min(100, bot.health + 30); break;
        case 'speed': 
          const baseSpeed = bot.classConfig.speed;
          bot.speed = baseSpeed * 1.3;
          setTimeout(() => { if (players[botId]) players[botId].speed = baseSpeed; }, 5000);
          break;
        case 'ammo': 
          bot.reserve = Math.min(bot.classConfig.maxReserve, bot.reserve + bot.classConfig.maxAmmo);
          break;
      }
      delete powerUps[powerUp.id];
      io.emit('powerUpCollected', powerUp.id);
    }
  });
}

function spawnBots() {
  for (let i = 0; i < MAX_BOTS; i++) {
    createBot();
  }
}

setTimeout(spawnBots, 3000);

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

  socket.on('selectClass', (data) => {
    const playerClass = data.class || data;
    const playerName = data.name || 'Player';
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
      speed: config.speed,
      ammo: config.maxAmmo,
      reserve: config.maxReserve,
      class: playerClass,
      classConfig: config,
      isReloading: false,
      name: playerName,
      isShooting: false
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
      players[socket.id].angle = data.angle;
    }
  });

  socket.on('reload', () => {
    const player = players[socket.id];
    if (!player || player.isReloading || player.ammo === player.classConfig.maxAmmo || player.reserve <= 0) return;

    player.isReloading = true;
    
    setTimeout(() => {
      if (players[socket.id]) {
        const needed = player.classConfig.maxAmmo - player.ammo;
        const toReload = Math.min(needed, player.reserve);
        player.ammo += toReload;
        player.reserve -= toReload;
        player.isReloading = false;
      }
    }, player.classConfig.reloadTime);
  });

  socket.on('clientHit', (data) => {
    const victim = players[data.victimId];
    if (!victim) return;
    
    const attacker = players[socket.id];
    if (!attacker) return;
    
    const config = attacker.classConfig;
    let damage = config.damage || 20;
    
    if (attacker.class === 'sniper') {
      damage = config.baseDamage;
    }
    
    victim.health -= damage;
    
    if (victim.health <= 0) {
      attacker.kills++;
      attacker.score += 100;
      
      if (victim.isBot) {
        delete players[data.victimId];
        setTimeout(() => {
          const botCount = Object.values(players).filter(p => p.isBot).length;
          if (botCount < MAX_BOTS) createBot();
        }, 5000);
      } else {
        io.to(data.victimId).emit('youDied', {
          killerId: socket.id,
          killerClass: attacker.class
        });
        delete players[data.victimId];
      }
      io.emit('playerKilled', { killerId: socket.id, victimId: data.victimId });
    }
  });

  socket.on('shootStart', () => {
    if (players[socket.id]) {
      players[socket.id].isShooting = true;
    }
  });

  socket.on('shootEnd', () => {
    if (players[socket.id]) {
      players[socket.id].isShooting = false;
    }
  });

  socket.on('pyroShot', () => {
    const player = players[socket.id];
    if (!player || player.ammo <= 0 || player.isReloading) return;
    player.ammo--;
  });

  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player || player.ammo <= 0 || player.isReloading) return;
    if (player.class === 'pyro') return;

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
      const damage = player.class === 'sniper' ? config.baseDamage : config.damage;

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
        damage: damage,
        class: player.class,
        startX: player.x,
        startY: player.y
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
        const baseSpeed = player.classConfig.speed;
        player.speed = baseSpeed * 1.3;
        setTimeout(() => { if (players[socket.id]) players[socket.id].speed = baseSpeed; }, 5000);
        break;
      case 'ammo': 
        player.reserve = Math.min(player.classConfig.maxReserve, player.reserve + player.classConfig.maxAmmo);
        break;
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
  Object.keys(players).forEach(pid => {
    if (players[pid].isBot) {
      updateBot(pid);
    }
  });

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
      const hitRadius = 400;
      
      if (dx * dx + dy * dy < hitRadius) {
        let damage = b.damage;
        
        if (b.class === 'sniper' && b.startX && b.startY) {
          const travelDist = Math.hypot(b.x - b.startX, b.y - b.startY);
          const distMultiplier = Math.min(travelDist / 500, 1);
          const config = CLASS_CONFIGS.sniper;
          damage = config.baseDamage + (config.maxDamage - config.baseDamage) * distMultiplier;
        }
        
        p.health -= damage;
        
        if (p.health <= 0) {
          if (players[b.ownerId]) {
            players[b.ownerId].kills++;
            players[b.ownerId].score += 100;
          }
          if (players[pid].isBot) {
            delete players[pid];
            setTimeout(() => {
              const botCount = Object.values(players).filter(p => p.isBot).length;
              if (botCount < MAX_BOTS) createBot();
            }, 5000);
          } else {
            io.to(pid).emit('youDied', {
              killerId: b.ownerId,
              killerClass: players[b.ownerId]?.class
            });
            delete players[pid];
          }
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

setInterval(() => {
  Object.keys(players).forEach(pid => {
    const p = players[pid];
    if (p) {
      io.to(pid).emit('serverUpdate', {
        x: p.x,
        y: p.y,
        health: p.health,
        ammo: p.ammo,
        reserve: p.reserve,
        timestamp: Date.now()
      });
    }
  });
}, 100);

server.listen(PORT, () => {
  console.log(`\n🎮 Server: http://localhost:${PORT}\n`);
});
