const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const playerCountElement = document.getElementById('playerCount');
const gameOverElement = document.getElementById('gameOver');
const finalScoreElement = document.getElementById('finalScore');
const leaderboardList = document.getElementById('leaderboardList');

const GRID_SIZE = 20;
let myPlayerId = null;
let players = {};
let food = { x: 0, y: 0 };

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
    players = data.players;
    food = data.food;
    draw();
    updateLeaderboard();
    updatePlayerCount();
});

// Handle food eaten
socket.on('foodEaten', (data) => {
    food = data.food;
    if (data.playerId === myPlayerId) {
        scoreElement.textContent = data.score;
    }
});

// Handle player death
socket.on('playerDied', (playerId) => {
    if (playerId === myPlayerId) {
        const myPlayer = players[myPlayerId];
        finalScoreElement.textContent = myPlayer ? myPlayer.score : 0;
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
        
        // Draw segment
        ctx.fillStyle = player.color;
        if (isMe) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = player.color;
        }
        
        ctx.fillRect(
            segment.x + 1,
            segment.y + 1,
            GRID_SIZE - 2,
            GRID_SIZE - 2
        );
        
        ctx.shadowBlur = 0;
        
        // Draw eyes on head
        if (isHead) {
            ctx.fillStyle = '#fff';
            const eyeSize = 3;
            const eyeOffset = 5;
            
            if (player.direction === 'RIGHT') {
                ctx.fillRect(segment.x + GRID_SIZE - eyeOffset, segment.y + 4, eyeSize, eyeSize);
                ctx.fillRect(segment.x + GRID_SIZE - eyeOffset, segment.y + GRID_SIZE - 7, eyeSize, eyeSize);
            } else if (player.direction === 'LEFT') {
                ctx.fillRect(segment.x + eyeOffset - eyeSize, segment.y + 4, eyeSize, eyeSize);
                ctx.fillRect(segment.x + eyeOffset - eyeSize, segment.y + GRID_SIZE - 7, eyeSize, eyeSize);
            } else if (player.direction === 'UP') {
                ctx.fillRect(segment.x + 4, segment.y + eyeOffset - eyeSize, eyeSize, eyeSize);
                ctx.fillRect(segment.x + GRID_SIZE - 7, segment.y + eyeOffset - eyeSize, eyeSize, eyeSize);
            } else {
                ctx.fillRect(segment.x + 4, segment.y + GRID_SIZE - eyeOffset, eyeSize, eyeSize);
                ctx.fillRect(segment.x + GRID_SIZE - 7, segment.y + GRID_SIZE - eyeOffset, eyeSize, eyeSize);
            }
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
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        return `
            <div class="leaderboard-item ${!player.alive ? 'dead' : ''}" style="border-color: ${player.color}">
                <span>${medal} ${isMe ? 'YOU' : 'Player'}</span>
                <span>${player.score} pts</span>
            </div>
        `;
    }).join('');
}

// Initial draw
draw();

