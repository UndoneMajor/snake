const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const playerCountElement = document.getElementById('playerCount');
const gameOverElement = document.getElementById('gameOver');
const finalScoreElement = document.getElementById('finalScore');
const leaderboardList = document.getElementById('leaderboardList');
const numberModal = document.getElementById('numberModal');
const numberGrid = document.getElementById('numberGrid');
const playerNumberElement = document.getElementById('playerNumber');

const GRID_SIZE = 20;
let myPlayerId = null;
let myPlayerNumber = null;
let players = {};
let food = { x: 0, y: 0 };
let lastUpdateTime = Date.now();
let interpolationFactor = 0;

// Show number selection modal on load
window.addEventListener('load', () => {
    showNumberSelection();
});

function showNumberSelection() {
    // Generate number buttons (1-20)
    numberGrid.innerHTML = '';
    for (let i = 1; i <= 20; i++) {
        const btn = document.createElement('button');
        btn.className = 'number-btn';
        btn.textContent = i;
        btn.onclick = () => selectNumber(i);
        btn.id = `num-${i}`;
        numberGrid.appendChild(btn);
    }
    numberModal.classList.remove('hidden');
}

function selectNumber(num) {
    myPlayerNumber = num;
    playerNumberElement.textContent = num;
    socket.emit('chooseNumber', num);
    numberModal.classList.add('hidden');
}

// Handle number taken
socket.on('numberTaken', (num) => {
    const btn = document.getElementById(`num-${num}`);
    if (btn) {
        btn.classList.add('taken');
    }
    alert(`Number ${num} is already taken! Please choose another.`);
    showNumberSelection();
});

// Initialize game
socket.on('init', (data) => {
    myPlayerId = data.playerId;
    players = data.players;
    food = data.food;
    console.log('🎮 Connected! Your ID:', myPlayerId);
});

// Handle new player joined
socket.on('playerJoined', (player) => {
    players[player.id] = player;
    updatePlayerCount();
});

// Handle player left
socket.on('playerLeft', (playerId) => {
    delete players[playerId];
    updatePlayerCount();
});

// Handle game state updates
socket.on('gameState', (data) => {
    lastUpdateTime = Date.now();
    players = data.players;
    food = data.food;
    updateLeaderboard();
    updatePlayerCount();
});

// Smooth animation loop
function animate() {
    draw();
    requestAnimationFrame(animate);
}

animate();

// Handle food eaten
socket.on('foodEaten', (data) => {
    food = data.food;
    if (data.playerId === myPlayerId) {
        scoreElement.textContent = data.score;
    }
});

// Handle player death
socket.on('playerDied', (data) => {
    const playerId = typeof data === 'string' ? data : data.playerId;
    
    if (playerId === myPlayerId) {
        const myPlayer = players[myPlayerId];
        finalScoreElement.textContent = myPlayer ? myPlayer.score : 0;
        
        // Show death message
        const deathMsg = document.createElement('p');
        deathMsg.style.fontSize = '1.2rem';
        deathMsg.style.marginTop = '1rem';
        
        if (data.type === 'collision' && data.killer) {
            deathMsg.textContent = '💥 Crashed into another player!';
            deathMsg.style.color = '#ff6b6b';
        } else if (data.type === 'self') {
            deathMsg.textContent = '🔄 You ran into yourself!';
            deathMsg.style.color = '#ffa500';
        } else {
            deathMsg.textContent = '🧱 Hit the wall!';
            deathMsg.style.color = '#888';
        }
        
        const existingMsg = gameOverElement.querySelector('p:last-of-type');
        if (existingMsg.textContent.includes('Final Score')) {
            existingMsg.insertAdjacentElement('afterend', deathMsg);
        }
        
        gameOverElement.classList.remove('hidden');
    }
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
    let direction = null;
    
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            direction = 'UP';
            e.preventDefault();
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            direction = 'DOWN';
            e.preventDefault();
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            direction = 'LEFT';
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            direction = 'RIGHT';
            e.preventDefault();
            break;
    }
    
    if (direction) {
        socket.emit('changeDirection', direction);
    }
});

// Drawing functions
function draw() {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid();

    // Draw food
    drawFood();

    // Draw all players
    Object.values(players).forEach(player => {
        if (player.alive) {
            drawSnake(player);
        }
    });
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= canvas.width; i += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    
    for (let i = 0; i <= canvas.height; i += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
}

function drawFood() {
    ctx.fillStyle = '#FFD700';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FFD700';
    ctx.beginPath();
    ctx.arc(food.x + GRID_SIZE / 2, food.y + GRID_SIZE / 2, GRID_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawSnake(player) {
    player.snake.forEach((segment, index) => {
        const isHead = index === 0;
        const isMe = player.id === myPlayerId;
        
        // Smooth interpolation for movement
        const now = Date.now();
        const timeSinceUpdate = now - lastUpdateTime;
        const smoothFactor = Math.min(timeSinceUpdate / 100, 1); // 100ms = one game tick
        
        let drawX = segment.x;
        let drawY = segment.y;
        
        // Smooth segment with slight lag effect
        if (index > 0 && player.snake[index - 1]) {
            const prev = player.snake[index - 1];
            const dx = prev.x - segment.x;
            const dy = prev.y - segment.y;
            
            drawX = segment.x + dx * smoothFactor * 0.3;
            drawY = segment.y + dy * smoothFactor * 0.3;
        }
        
        // Draw segment with rounded corners
        ctx.fillStyle = player.color;
        if (isMe) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = player.color;
        }
        
        // Rounded rectangle
        const radius = 4;
        ctx.beginPath();
        ctx.roundRect(drawX + 1, drawY + 1, GRID_SIZE - 2, GRID_SIZE - 2, radius);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        
        // Draw number on head
        if (isHead && player.number) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(player.number, drawX + GRID_SIZE / 2, drawY + GRID_SIZE / 2);
        }
        
        // Draw bot name on head
        if (isHead && player.isBot) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🤖', drawX + GRID_SIZE / 2, drawY + GRID_SIZE / 2);
        }
    });
}

function updatePlayerCount() {
    playerCountElement.textContent = Object.keys(players).length;
}

function updateLeaderboard() {
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    
    leaderboardList.innerHTML = sortedPlayers.map((player, index) => {
        const isMe = player.id === myPlayerId;
        const isBot = player.isBot;
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const displayName = isMe ? 'YOU' : isBot ? player.name : 'Player';
        const icon = isBot ? '🤖 ' : '';
        
        return `
            <div class="leaderboard-item ${!player.alive ? 'dead' : ''}" style="border-color: ${player.color}">
                <span>${medal} ${icon}${displayName}</span>
                <span>${player.score} pts</span>
            </div>
        `;
    }).join('');
}

// Add roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
    };
}

