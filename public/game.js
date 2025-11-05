const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Make canvas fullscreen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// UI Elements
const healthFill = document.getElementById('healthFill');
const healthText = document.getElementById('healthText');
const ammoElement = document.getElementById('ammo');
const killsElement = document.getElementById('kills');
const scoreElement = document.getElementById('score');
const leaderboardList = document.getElementById('leaderboardList');
const killFeed = document.getElementById('killFeed');
const classModal = document.getElementById('classModal');
const playerClassElement = document.getElementById('playerClass');

// Game state
let myPlayerId = null;
let players = {};
let bullets = {};
let powerUps = {};
let walls = [];
let mapWidth = 800;
let mapHeight = 600;
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let camera = { x: 0, y: 0 };
let myClass = null;
let classConfig = null;

// Class configurations (must match server)
const CLASS_CONFIGS = {
    shotgun: { fireRate: 500, icon: '🔫' },
    sniper: { fireRate: 700, icon: '🎯' },
    rifle: { fireRate: 80, icon: '💥' }
};

// Client-side collision detection
function collidesWithWall(x, y, size = 30) {
    const halfSize = size / 2;
    const left = x - halfSize;
    const right = x + halfSize;
    const top = y - halfSize;
    const bottom = y + halfSize;
    
    for (let wall of walls) {
        if (right > wall.x && 
            left < wall.x + wall.width && 
            bottom > wall.y && 
            top < wall.y + wall.height) {
            return true;
        }
    }
    return false;
}

// Show class selection on load
window.addEventListener('load', () => {
    classModal.classList.remove('hidden');
});

// Class selection
function selectClass(className) {
    myClass = className;
    classConfig = CLASS_CONFIGS[className];
    playerClassElement.textContent = className.charAt(0).toUpperCase() + className.slice(1);
    classModal.classList.add('hidden');
    socket.emit('selectClass', className);
}

// Initialize
socket.on('init', (data) => {
    myPlayerId = data.playerId;
    players = data.players;
    bullets = data.bullets;
    powerUps = data.powerUps;
    walls = data.walls;
    mapWidth = data.mapWidth;
    mapHeight = data.mapHeight;
    console.log('🎮 Connected! Player ID:', myPlayerId);
    console.log(`🗺️ Map size: ${mapWidth}x${mapHeight}`);
});

// Players
socket.on('playerJoined', (player) => {
    players[player.id] = player;
});

socket.on('playerLeft', (playerId) => {
    delete players[playerId];
});

// Bullets from server - merge with local bullets
socket.on('bulletFired', (bullet) => {
    // Don't override if we already have this bullet locally
    if (!bullets[bullet.id]) {
        bullets[bullet.id] = bullet;
    }
});

// FAST update handler - 60 FPS
socket.on('update', (data) => {
    // Update other players only
    Object.keys(data.players).forEach(id => {
        if (id === myPlayerId) {
            // Only update stats, NEVER position/angle
            if (players[id]) {
                players[id].health = data.players[id].health;
                players[id].ammo = data.players[id].ammo;
                players[id].kills = data.players[id].kills;
                players[id].score = data.players[id].score;
                players[id].speed = data.players[id].speed;
            }
        } else {
            // Other players
            if (!players[id]) {
                players[id] = { ...data.players[id] };
            }
            players[id].targetX = data.players[id].x;
            players[id].targetY = data.players[id].y;
            players[id].health = data.players[id].health;
            players[id].ammo = data.players[id].ammo;
            players[id].color = data.players[id].color;
            players[id].class = data.players[id].class;
        }
    });
    
    // Merge server bullets with local bullets (server is authoritative for hits)
    // Keep local bullets for instant feedback, server bullets for accuracy
    Object.keys(data.bullets || {}).forEach(bid => {
        if (!bid.startsWith('local_')) {
            bullets[bid] = data.bullets[bid];
        }
    });
});

// Update UI less frequently
let uiUpdateCounter = 0;
socket.on('update', () => {
    if (++uiUpdateCounter % 3 === 0) { // Every 3rd update
        updateUI();
        updateLeaderboard();
    }
});

// Power-ups
socket.on('powerUpSpawned', (powerUp) => {
    powerUps[powerUp.id] = powerUp;
});

socket.on('powerUpCollected', (powerUpId) => {
    delete powerUps[powerUpId];
});

// You died - back to class selection
socket.on('youDied', (data) => {
    const killer = players[data.killerId];
    const killerClassName = data.killerClass ? data.killerClass.charAt(0).toUpperCase() + data.killerClass.slice(1) : 'Unknown';
    
    addKillMessage(`💀 You were eliminated by ${killerClassName}!`);
    
    // Remove yourself from local players immediately
    delete players[myPlayerId];
    
    // Show class selection after short delay
    setTimeout(() => {
        classModal.classList.remove('hidden');
        myPlayerId = null;
        myClass = null;
        classConfig = null;
    }, 2000);
});

// Kill feed
socket.on('playerKilled', (data) => {
    // Remove dead player from local game
    delete players[data.victimId];
    
    if (data.victimId !== myPlayerId) {
        addKillMessage(`Player eliminated!`);
    }
});

function addKillMessage(message) {
    const div = document.createElement('div');
    div.className = 'kill-message';
    div.textContent = message;
    killFeed.appendChild(div);
    
    setTimeout(() => {
        div.remove();
    }, 3000);
}

// Input handling
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Track raw mouse position
let rawMouse = { x: 0, y: 0 };

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    rawMouse.x = (e.clientX - rect.left) / ZOOM_LEVEL;
    rawMouse.y = (e.clientY - rect.top) / ZOOM_LEVEL;
});

canvas.addEventListener('mouseenter', (e) => {
    const rect = canvas.getBoundingClientRect();
    rawMouse.x = (e.clientX - rect.left) / ZOOM_LEVEL;
    rawMouse.y = (e.clientY - rect.top) / ZOOM_LEVEL;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        mouse.down = true;
        shoot();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        mouse.down = false;
    }
});

// Prevent context menu
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Update camera to follow player with zoom (reduced FOV)
const ZOOM_LEVEL = 1.3; // 1.3 = 30% zoom in (reduced FOV)

function updateCamera() {
    const player = players[myPlayerId];
    if (!player) return;

    // Center camera on player with zoom
    camera.x = player.x - (canvas.width / ZOOM_LEVEL) / 2;
    camera.y = player.y - (canvas.height / ZOOM_LEVEL) / 2;

    // Clamp camera to map bounds
    camera.x = Math.max(0, Math.min(mapWidth - canvas.width / ZOOM_LEVEL, camera.x));
    camera.y = Math.max(0, Math.min(mapHeight - canvas.height / ZOOM_LEVEL, camera.y));
}

// Game loop
function gameLoop() {
    updatePlayerAngle(); // Update angle every frame
    handleMovement();
    updateCamera();
    draw();
    requestAnimationFrame(gameLoop);
}

// ALWAYS update angle to mouse - with LIVE world coordinates
function updatePlayerAngle() {
    const player = players[myPlayerId];
    if (!player) return;
    
    // Convert raw mouse to world coordinates LIVE (not cached)
    const worldMouseX = rawMouse.x + camera.x;
    const worldMouseY = rawMouse.y + camera.y;
    
    // Calculate angle from player to mouse in world space
    const angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);
    player.angle = angle;
}

const INTERPOLATION_SPEED = 0.5; // Faster interpolation
let lastMoveUpdate = 0;
let lastMinimapUpdate = 0;

function handleMovement() {
    const player = players[myPlayerId];
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
    }

    // Get current angle (already updated in updatePlayerAngle)
    const angle = player.angle;

    // Move locally
    if (dx !== 0 || dy !== 0) {
        const speed = player.speed || 3;
        const newX = player.x + dx * speed;
        const newY = player.y + dy * speed;
        
        // Wall collision
        if (!collidesWithWall(newX, newY)) {
            player.x = newX;
            player.y = newY;
        } else {
            if (!collidesWithWall(newX, player.y)) player.x = newX;
            if (!collidesWithWall(player.x, newY)) player.y = newY;
        }
        
        // Clamp
        player.x = Math.max(15, Math.min(mapWidth - 15, player.x));
        player.y = Math.max(15, Math.min(mapHeight - 15, player.y));
    }
    
    // Send position (no angle - saves 33% bandwidth!)
    socket.emit('updatePosition', {
        x: player.x,
        y: player.y
    });

    // Update local bullets client-side for smooth movement
    Object.keys(bullets).forEach(bid => {
        const b = bullets[bid];
        if (b && b.vx && b.vy) {
            b.x += b.vx;
            b.y += b.vy;
            
            // Remove if out of bounds
            if (b.x < 0 || b.x > mapWidth || b.y < 0 || b.y > mapHeight) {
                delete bullets[bid];
            }
        }
    });

    // Interpolate other players
    Object.keys(players).forEach(id => {
        if (id === myPlayerId) return;
        const p = players[id];
        if (p.targetX !== undefined) {
            p.x += (p.targetX - p.x) * INTERPOLATION_SPEED;
            p.y += (p.targetY - p.y) * INTERPOLATION_SPEED;
        }
    });

    // Check power-up collection
    Object.values(powerUps).forEach(powerUp => {
        if (!powerUp) return;
        const dx = player.x - powerUp.x;
        const dy = player.y - powerUp.y;
        const distSquared = dx * dx + dy * dy;
        
        if (distSquared < 900) { // 30 * 30
            socket.emit('collectPowerUp', powerUp.id);
            delete powerUps[powerUp.id]; // Remove locally immediately
        }
    });
}

let lastShot = 0;
let localBulletId = 0;

function shoot() {
    if (!classConfig) return;
    
    const now = Date.now();
    if (now - lastShot < classConfig.fireRate) return;
    lastShot = now;

    const player = players[myPlayerId];
    if (!player || player.ammo <= 0) return;

    const angle = player.angle;

    // Instant client-side bullet prediction
    const config = CLASS_CONFIGS[myClass];
    const serverConfig = {
        shotgun: { bulletSpeed: 25, bulletCount: 3, spread: 0.3 },
        sniper: { bulletSpeed: 50, bulletCount: 1, spread: 0 },
        rifle: { bulletSpeed: 30, bulletCount: 1, spread: 0.05 }
    };
    
    const bulletConfig = serverConfig[myClass];
    
    for (let i = 0; i < bulletConfig.bulletCount; i++) {
        let bulletAngle = angle;
        
        if (bulletConfig.bulletCount > 1) {
            bulletAngle += (i - (bulletConfig.bulletCount - 1) / 2) * bulletConfig.spread;
        } else if (bulletConfig.spread > 0) {
            bulletAngle += (Math.random() - 0.5) * bulletConfig.spread;
        }

        // Create local bullet instantly
        const localBullet = {
            id: `local_${localBulletId++}`,
            x: player.x,
            y: player.y,
            vx: Math.cos(bulletAngle) * bulletConfig.bulletSpeed,
            vy: Math.sin(bulletAngle) * bulletConfig.bulletSpeed,
            color: player.color,
            class: myClass
        };
        
        bullets[localBullet.id] = localBullet;
    }

    // Update ammo locally
    player.ammo--;

    // Send to server
    socket.emit('shoot', { angle: angle });
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context and apply camera transform with zoom
    ctx.save();
    ctx.scale(ZOOM_LEVEL, ZOOM_LEVEL);
    ctx.translate(-camera.x, -camera.y);

    // Draw grid (world coordinates)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    for (let x = startX; x < camera.x + canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, camera.y);
        ctx.lineTo(x, camera.y + canvas.height);
        ctx.stroke();
    }
    for (let y = startY; y < camera.y + canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(camera.x, y);
        ctx.lineTo(camera.x + canvas.width, y);
        ctx.stroke();
    }

    // Draw walls
    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 2;
    walls.forEach(wall => {
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });

    // Draw power-ups
    Object.values(powerUps).forEach(powerUp => {
        const colors = {
            health: '#ff4444',
            speed: '#44ff44',
            ammo: '#4444ff'
        };
        const icons = {
            health: '❤️',
            speed: '⚡',
            ammo: '📦'
        };

        ctx.fillStyle = colors[powerUp.type];
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(powerUp.x, powerUp.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icons[powerUp.type], powerUp.x, powerUp.y);
    });

    // Draw players
    Object.values(players).forEach(player => {
        const isMe = player.id === myPlayerId;

        // Shadow for own player
        if (isMe) {
            ctx.fillStyle = player.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Draw player circle
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        ctx.fill();

        // ONLY draw direction line for YOUR player
        if (isMe) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(
                player.x + Math.cos(player.angle) * 25,
                player.y + Math.sin(player.angle) * 25
            );
            ctx.stroke();
        }

        // Health bar
        const barWidth = 40;
        const barHeight = 5;
        const barX = player.x - barWidth / 2;
        const barY = player.y - 30;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = player.health > 50 ? '#4CAF50' : player.health > 25 ? '#FFC107' : '#F44336';
        ctx.fillRect(barX, barY, (barWidth * player.health) / 100, barHeight);

        // Player label and class icon
        if (isMe) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('YOU', player.x, player.y + 35);
        }
        
        // Show class icon above player
        if (player.class && CLASS_CONFIGS[player.class]) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(CLASS_CONFIGS[player.class].icon, player.x, player.y - 25);
        }
    });

    // Draw bullets
    Object.values(bullets).forEach(bullet => {
        ctx.fillStyle = bullet.color;
        
        // Different bullet sizes based on class
        const bulletSize = bullet.class === 'sniper' ? 7 : bullet.class === 'shotgun' ? 4 : 5;
        const glowSize = bullet.class === 'sniper' ? 15 : 10;
        
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = bullet.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bulletSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Restore context
    ctx.restore();
}

function updateUI() {
    const player = players[myPlayerId];
    if (!player) return;

    healthFill.style.width = player.health + '%';
    healthText.textContent = `${player.health}/100`;
    ammoElement.textContent = player.ammo;
    killsElement.textContent = player.kills;
    scoreElement.textContent = player.score;
}

function updateLeaderboard() {
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    leaderboardList.innerHTML = sortedPlayers.map((player, index) => {
        const isMe = player.id === myPlayerId;
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        
        return `
            <div class="leaderboard-item ${isMe ? 'me' : ''}" style="border-color: ${player.color}">
                <span>${medal} ${isMe ? 'YOU' : 'Player'}</span>
                <span>${player.kills} kills | ${player.score} pts</span>
            </div>
        `;
    }).join('');
}

// Start game loop
gameLoop();

