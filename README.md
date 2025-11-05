# 🔫 Multiplayer Shooter Game

A real-time multiplayer top-down shooter built with Node.js, Express, and Socket.io!

## Features

- 🎮 **Real-time Multiplayer** - Play with friends simultaneously
- 🔫 **Shooting Mechanics** - Aim with mouse, shoot with click
- ❤️ **Health System** - Take damage and respawn
- 📊 **Live Leaderboard** - See top players in real-time
- 🎁 **Power-ups** - Health, Speed, and Ammo boosts
- 💀 **Kill Feed** - See who eliminated who
- 🏆 **Score System** - Earn points for kills

## How to Play

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open browser to `http://localhost:3000`

4. **Play with friends** - Open multiple tabs or share your local IP!

### Controls

- **WASD** or **Arrow Keys** - Move your player
- **Mouse** - Aim your weapon
- **Left Click** - Shoot
- **Collect Power-ups** - Walk over them to collect

### Game Mechanics

- **Health**: Start with 100 HP, take 20 damage per bullet hit
- **Ammo**: Start with 30 bullets, collect ammo power-ups
- **Respawn**: Automatically respawn when eliminated
- **Scoring**: +100 points per kill

### Power-ups

- ❤️ **Health** - Restore 30 HP
- ⚡ **Speed** - Move faster for 5 seconds
- 📦 **Ammo** - Get 10 extra bullets

## Deployment

Deploy to Railway, Render, or Fly.io (supports WebSockets)

**Not compatible with Vercel** (no WebSocket support)

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5 Canvas, Vanilla JavaScript
- **Real-time**: WebSockets for multiplayer sync

## License

MIT

---

**Lock and load! 🎯**

