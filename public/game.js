const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
    shotgun: { fireRate: 600, icon: '🔫' },
    sniper: { fireRate: 800, icon: '🎯' },
    rifle: { fireRate: 100, icon: '💥' }
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

// Bullets
socket.on('bulletFired', (bullet) => {
    bullets[bullet.id] = bullet;
});

// Game state updates - client authoritative for self
socket.on('gameState', (data) => {
    Object.keys(data.players).forEach(id => {
        const serverPlayer = data.players[id];
        
        if (id === myPlayerId) {
            // Update ONLY non-position data from server
            if (players[id]) {
                players[id].health = serverPlayer.health;
                players[id].ammo = serverPlayer.ammo;
                players[id].kills = serverPlayer.kills;
                players[id].score = serverPlayer.score;
                players[id].speed = serverPlayer.speed;
                players[id].class = serverPlayer.class;
                players[id].color = serverPlayer.color;
                // DO NOT update x, y - client controls these
            } else {
                players[id] = { ...serverPlayer };
            }
        } else {
            // Other players - use server position with interpolation
            if (players[id]) {
                players[id].targetX = serverPlayer.x;
                players[id].targetY = serverPlayer.y;
                players[id].angle = serverPlayer.angle;
                players[id].health = serverPlayer.health;
                players[id].ammo = serverPlayer.ammo;
                players[id].kills = serverPlayer.kills;
                players[id].score = serverPlayer.score;
                players[id].class = serverPlayer.class;
                players[id].color = serverPlayer.color;
            } else {
                players[id] = { ...serverPlayer };
                players[id].targetX = serverPlayer.x;
                players[id].targetY = serverPlayer.y;
            }
        }
    });
    
    bullets = data.bullets || {};
    updateUI();
    updateLeaderboard();
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

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // Convert screen coordinates to world coordinates
    mouse.x = e.clientX - rect.left + camera.x;
    mouse.y = e.clientY - rect.top + camera.y;
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

// Update camera to follow player
function updateCamera() {
    const player = players[myPlayerId];
    if (!player) return;

    // Center camera on player
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;

    // Clamp camera to map bounds
    camera.x = Math.max(0, Math.min(mapWidth - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(mapHeight - canvas.height, camera.y));
}

// Game loop
function gameLoop() {
    handleMovement();
    updateCamera();
    draw();
    requestAnimationFrame(gameLoop);
}

const INTERPOLATION_SPEED = 0.3;

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

    // Update angle
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    player.angle = angle;

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
        
        // Send to server
        socket.emit('updatePosition', {
            x: player.x,
            y: player.y,
            angle: angle
        });
    } else if (player.angle !== angle) {
        // Just angle changed
        socket.emit('updatePosition', {
            x: player.x,
            y: player.y,
            angle: angle
        });
    }

    // Interpolate others
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
function shoot() {
    if (!classConfig) return;
    
    const now = Date.now();
    if (now - lastShot < classConfig.fireRate) return; // Fire rate limit based on class
    lastShot = now;

    const player = players[myPlayerId];
    if (!player || player.ammo <= 0) return;

    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    socket.emit('shoot', { angle });
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context and apply camera transform
    ctx.save();
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

        // Draw direction line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(
            player.x + Math.cos(player.angle) * 25,
            player.y + Math.sin(player.angle) * 25
        );
        ctx.stroke();

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

    // Draw minimap
    drawMinimap();
}

function drawMinimap() {
    const minimapSize = 150;
    const minimapX = canvas.width - minimapSize - 20;
    const minimapY = 20;
    const scale = minimapSize / Math.max(mapWidth, mapHeight);

    // Minimap background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

    // Draw walls on minimap
    ctx.fillStyle = '#555';
    walls.forEach(wall => {
        ctx.fillRect(
            minimapX + wall.x * scale,
            minimapY + wall.y * scale,
            wall.width * scale,
            wall.height * scale
        );
    });

    // Draw players on minimap
    Object.values(players).forEach(player => {
        const isMe = player.id === myPlayerId;
        ctx.fillStyle = isMe ? '#FFD700' : player.color;
        ctx.beginPath();
        ctx.arc(
            minimapX + player.x * scale,
            minimapY + player.y * scale,
            isMe ? 4 : 3,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });

    // Draw viewport rectangle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        minimapX + camera.x * scale,
        minimapY + camera.y * scale,
        canvas.width * scale,
        canvas.height * scale
    );
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

