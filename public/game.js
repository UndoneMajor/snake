const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const healthFill = document.getElementById('healthFill');
const healthText = document.getElementById('healthText');
const ammoElement = document.getElementById('ammo');
const killsElement = document.getElementById('kills');
const scoreElement = document.getElementById('score');
const leaderboardList = document.getElementById('leaderboardList');
const killFeed = document.getElementById('killFeed');
const classModal = document.getElementById('classModal');
const playerClassElement = document.getElementById('playerClass');
const pingElement = document.getElementById('ping');
const pingIndicator = document.getElementById('pingIndicator');
const reserveElement = document.getElementById('reserve');
const reloadIndicator = document.getElementById('reloadIndicator');
const reloadProgress = document.getElementById('reloadProgress');
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');

let playerName = localStorage.getItem('playerName') || '';

function submitName() {
    const name = nameInput.value.trim();
    if (name.length < 1) {
        alert('Please enter a name!');
        return;
    }
    playerName = name;
    localStorage.setItem('playerName', name);
    nameModal.classList.add('hidden');
    classModal.classList.remove('hidden');
}

window.addEventListener('load', () => {
    if (playerName) {
        nameInput.value = playerName;
    }
    nameModal.classList.remove('hidden');
});

let lastPingTime = 0;
let currentPing = 0;

setInterval(() => {
    lastPingTime = Date.now();
    socket.emit('ping');
}, 2000);

socket.on('pong', () => {
    currentPing = Date.now() - lastPingTime;
    pingElement.textContent = currentPing + 'ms';
    
    if (currentPing < 50) {
        pingIndicator.className = 'ping-indicator good';
    } else if (currentPing < 100) {
        pingIndicator.className = 'ping-indicator medium';
    } else {
        pingIndicator.className = 'ping-indicator bad';
    }
});

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

const CLASS_CONFIGS = {
    shotgun: { fireRate: 500, icon: '🔫', reloadTime: 2000 },
    sniper: { fireRate: 700, icon: '🎯', reloadTime: 2500 },
    rifle: { fireRate: 80, icon: '💥', reloadTime: 1500 }
};

let isReloading = false;
let reloadStartTime = 0;

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

function selectClass(className) {
    myClass = className;
    classConfig = CLASS_CONFIGS[className];
    playerClassElement.textContent = className.charAt(0).toUpperCase() + className.slice(1);
    classModal.classList.add('hidden');
    socket.emit('selectClass', { class: className, name: playerName });
}

socket.on('init', (data) => {
    myPlayerId = data.playerId;
    players = data.players;
    bullets = data.bullets;
    powerUps = data.powerUps;
    walls = data.walls;
    mapWidth = data.mapWidth;
    mapHeight = data.mapHeight;
});

socket.on('playerJoined', (player) => {
    players[player.id] = player;
});

socket.on('playerLeft', (playerId) => {
    delete players[playerId];
});

socket.on('bulletFired', (bullet) => {
    if (bullet.ownerId === myPlayerId) return;
    
    bullets[bullet.id] = {
        ...bullet,
        vx: bullet.velocityX || bullet.vx,
        vy: bullet.velocityY || bullet.vy
    };
});

socket.on('bulletHit', (bulletId) => {
    delete bullets[bulletId];
});

socket.on('update', (data) => {
    Object.keys(data.players).forEach(id => {
        if (id === myPlayerId) {
            if (players[id]) {
                players[id].health = data.players[id].health;
                players[id].ammo = data.players[id].ammo;
                players[id].reserve = data.players[id].reserve;
                players[id].isReloading = data.players[id].isReloading;
                players[id].kills = data.players[id].kills;
                players[id].score = data.players[id].score;
                players[id].speed = data.players[id].speed;
            }
        } else {
            if (!players[id]) {
                players[id] = { ...data.players[id] };
                players[id].targetX = data.players[id].x;
                players[id].targetY = data.players[id].y;
            } else {
                const dx = data.players[id].x - players[id].x;
                const dy = data.players[id].y - players[id].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > 200) {
                    players[id].x = data.players[id].x;
                    players[id].y = data.players[id].y;
                } else {
                    players[id].targetX = data.players[id].x;
                    players[id].targetY = data.players[id].y;
                }
            }
            players[id].health = data.players[id].health;
            players[id].ammo = data.players[id].ammo;
            players[id].color = data.players[id].color;
            players[id].class = data.players[id].class;
        }
    });
});

let uiUpdateCounter = 0;
socket.on('update', () => {
    if (++uiUpdateCounter % 3 === 0) {
        updateUI();
        updateLeaderboard();
    }
});

socket.on('powerUpSpawned', (powerUp) => {
    powerUps[powerUp.id] = powerUp;
});

socket.on('powerUpCollected', (powerUpId) => {
    delete powerUps[powerUpId];
});

socket.on('youDied', (data) => {
    const killer = players[data.killerId];
    const killerName = killer ? (killer.isBot ? `🤖 ${killer.name}` : killer.name) : 'Unknown';
    const killerClass = data.killerClass || '';
    addKillMessage('💀', `${killerName}`, 'eliminated you', killerClass);
    delete players[myPlayerId];
    
    setTimeout(() => {
        classModal.classList.remove('hidden');
        myPlayerId = null;
        myClass = null;
        classConfig = null;
    }, 2000);
});

socket.on('playerKilled', (data) => {
    const killer = players[data.killerId];
    const victim = players[data.victimId];
    
    if (data.victimId !== myPlayerId && killer && victim) {
        const killerName = killer.isBot ? `🤖 ${killer.name}` : (killer.name || 'Player');
        const victimName = victim.isBot ? `🤖 ${victim.name}` : (victim.name || 'Player');
        const weaponIcon = CLASS_CONFIGS[killer.class]?.icon || '💥';
        addKillMessage(killerName, weaponIcon, victimName, '');
    }
    
    delete players[data.victimId];
});

function addKillMessage(left, icon, right, extra) {
    const div = document.createElement('div');
    div.className = 'kill-message';
    div.innerHTML = `
        <span class="kill-left">${left}</span>
        <span class="kill-icon">${icon}</span>
        <span class="kill-right">${right}</span>
        ${extra ? `<span class="kill-extra">${extra}</span>` : ''}
    `;
    killFeed.appendChild(div);
    
    if (killFeed.children.length > 5) {
        killFeed.removeChild(killFeed.firstChild);
    }
    
    setTimeout(() => {
        div.remove();
    }, 5000);
}

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    if (e.key.toLowerCase() === 'r') {
        reload();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

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
    if (e.button === 0) {
        mouse.down = true;
        shoot();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        mouse.down = false;
    }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const ZOOM_LEVEL = 1.3;

function updateCamera() {
    const player = players[myPlayerId];
    if (!player) return;

    camera.x = player.x - (canvas.width / ZOOM_LEVEL) / 2;
    camera.y = player.y - (canvas.height / ZOOM_LEVEL) / 2;

    camera.x = Math.max(0, Math.min(mapWidth - canvas.width / ZOOM_LEVEL, camera.x));
    camera.y = Math.max(0, Math.min(mapHeight - canvas.height / ZOOM_LEVEL, camera.y));
}

function gameLoop() {
    updatePlayerAngle();
    handleMovement();
    updateCamera();
    draw();
    requestAnimationFrame(gameLoop);
}

function updatePlayerAngle() {
    const player = players[myPlayerId];
    if (!player) return;
    
    const worldMouseX = rawMouse.x + camera.x;
    const worldMouseY = rawMouse.y + camera.y;
    
    const angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);
    player.angle = angle;
}

const INTERPOLATION_SPEED = 0.15;

function handleMovement() {
    const player = players[myPlayerId];
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
    }

    const angle = player.angle;

    if (dx !== 0 || dy !== 0) {
        const speed = player.speed || 3;
        const newX = player.x + dx * speed;
        const newY = player.y + dy * speed;
        
        if (!collidesWithWall(newX, newY)) {
            player.x = newX;
            player.y = newY;
        } else {
            if (!collidesWithWall(newX, player.y)) player.x = newX;
            if (!collidesWithWall(player.x, newY)) player.y = newY;
        }
        
        player.x = Math.max(15, Math.min(mapWidth - 15, player.x));
        player.y = Math.max(15, Math.min(mapHeight - 15, player.y));
    }
    
    socket.emit('updatePosition', {
        x: player.x,
        y: player.y
    });

    Object.keys(bullets).forEach(bid => {
        const b = bullets[bid];
        if (!b || !b.vx || !b.vy) return;
        
        b.x += b.vx;
        b.y += b.vy;
        
        if (b.x < 0 || b.x > mapWidth || b.y < 0 || b.y > mapHeight || collidesWithWall(b.x, b.y, 10)) {
            delete bullets[bid];
            return;
        }
        
        let hit = false;
        Object.keys(players).forEach(pid => {
            if (pid === b.ownerId) return;
            const p = players[pid];
            if (!p) return;
            
            const dx = p.x - b.x;
            const dy = p.y - b.y;
            
            if (dx * dx + dy * dy < 225) {
                delete bullets[bid];
                hit = true;
            }
        });
    });

    Object.keys(players).forEach(id => {
        if (id === myPlayerId) return;
        const p = players[id];
        if (p.targetX !== undefined && p.targetY !== undefined) {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                p.x += dx * INTERPOLATION_SPEED;
                p.y += dy * INTERPOLATION_SPEED;
            } else {
                p.x = p.targetX;
                p.y = p.targetY;
            }
        }
    });

    Object.values(powerUps).forEach(powerUp => {
        if (!powerUp) return;
        const dx = player.x - powerUp.x;
        const dy = player.y - powerUp.y;
        const distSquared = dx * dx + dy * dy;
        
        if (distSquared < 900) {
            socket.emit('collectPowerUp', powerUp.id);
            delete powerUps[powerUp.id];
        }
    });
}

let lastShot = 0;
let localBulletId = 0;

function reload() {
    const player = players[myPlayerId];
    if (!player || !classConfig) return;
    if (isReloading) return;
    if (player.ammo >= player.classConfig?.maxAmmo || (player.reserve || 0) <= 0) return;

    isReloading = true;
    reloadStartTime = Date.now();
    reloadIndicator.style.display = 'block';
    socket.emit('reload');

    const interval = setInterval(() => {
        const elapsed = Date.now() - reloadStartTime;
        const progress = Math.min((elapsed / classConfig.reloadTime) * 100, 100);
        reloadProgress.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            isReloading = false;
            reloadIndicator.style.display = 'none';
            reloadProgress.style.width = '0%';
        }
    }, 50);
}

function shoot() {
    const player = players[myPlayerId];
    if (!classConfig || isReloading) return;
    if (!player || player.ammo <= 0) {
        if (player && player.reserve > 0 && !isReloading) {
            reload();
        }
        return;
    }
    
    const now = Date.now();
    if (now - lastShot < classConfig.fireRate) return;
    lastShot = now;

    const angle = player.angle;

    const serverConfig = {
        shotgun: { bulletSpeed: 25, bulletCount: 3, spread: 0.3, damage: 35 },
        sniper: { bulletSpeed: 50, bulletCount: 1, spread: 0, damage: 20 },
        rifle: { bulletSpeed: 30, bulletCount: 1, spread: 0.05, damage: 15 }
    };
    
    const bulletConfig = serverConfig[myClass];
    
    for (let i = 0; i < bulletConfig.bulletCount; i++) {
        let bulletAngle = angle;
        
        if (bulletConfig.bulletCount > 1) {
            bulletAngle += (i - (bulletConfig.bulletCount - 1) / 2) * bulletConfig.spread;
        } else if (bulletConfig.spread > 0) {
            bulletAngle += (Math.random() - 0.5) * bulletConfig.spread;
        }

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

    player.ammo--;

    socket.emit('shoot', { angle: angle });
}

function draw() {
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(ZOOM_LEVEL, ZOOM_LEVEL);
    ctx.translate(-camera.x, -camera.y);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    for (let x = startX; x < camera.x + canvas.width / ZOOM_LEVEL; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, camera.y);
        ctx.lineTo(x, camera.y + canvas.height / ZOOM_LEVEL);
        ctx.stroke();
    }
    for (let y = startY; y < camera.y + canvas.height / ZOOM_LEVEL; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(camera.x, y);
        ctx.lineTo(camera.x + canvas.width / ZOOM_LEVEL, y);
        ctx.stroke();
    }

    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 2;
    walls.forEach(wall => {
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });

    Object.values(powerUps).forEach(powerUp => {
        const colors = { health: '#ff4444', speed: '#44ff44', ammo: '#4444ff' };
        const icons = { health: '❤️', speed: '⚡', ammo: '📦' };

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

    Object.values(players).forEach(player => {
        const isMe = player.id === myPlayerId;

        if (isMe) {
            ctx.fillStyle = player.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        ctx.fill();

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

        const barWidth = 40;
        const barHeight = 5;
        const barX = player.x - barWidth / 2;
        const barY = player.y - 30;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = player.health > 50 ? '#4CAF50' : player.health > 25 ? '#FFC107' : '#F44336';
        ctx.fillRect(barX, barY, (barWidth * player.health) / 100, barHeight);

        if (isMe) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('YOU', player.x, player.y + 35);
        }
        
        if (player.class && CLASS_CONFIGS[player.class]) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(CLASS_CONFIGS[player.class].icon, player.x, player.y - 25);
        }
    });

    Object.values(bullets).forEach(bullet => {
        ctx.fillStyle = bullet.color;
        
        const bulletSize = bullet.class === 'sniper' ? 7 : bullet.class === 'shotgun' ? 4 : 5;
        const glowSize = bullet.class === 'sniper' ? 15 : 10;
        
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = bullet.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bulletSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    ctx.restore();
}

function updateUI() {
    const player = players[myPlayerId];
    if (!player) return;

    healthFill.style.width = player.health + '%';
    healthText.textContent = player.health;
    ammoElement.textContent = player.ammo;
    reserveElement.textContent = player.reserve || 0;
    killsElement.textContent = player.kills;
    scoreElement.textContent = player.score;
}

function updateLeaderboard() {
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    leaderboardList.innerHTML = sortedPlayers.map((player, index) => {
        const isMe = player.id === myPlayerId;
        const isBot = player.isBot;
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const name = isMe ? playerName || 'YOU' : isBot ? `🤖 ${player.name}` : (player.name || 'Player');
        
        return `
            <div class="leaderboard-item ${isMe ? 'me' : ''}" style="border-color: ${player.color}">
                <span>${medal} ${name}</span>
                <span>${player.kills} | ${player.score}</span>
            </div>
        `;
    }).join('');
}

gameLoop();
