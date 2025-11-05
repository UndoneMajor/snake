# 🐍 Multiplayer Snake Game

A real-time multiplayer snake game built with Node.js, Express, and Socket.io!

## Features

- 🎮 **Real-time Multiplayer** - Play with friends in the same game
- 🌈 **Colorful Snakes** - Each player gets a unique color
- 🏆 **Live Leaderboard** - See who's winning in real-time
- 📱 **Responsive Design** - Works on desktop and mobile
- ⚡ **Fast-paced** - Smooth 60 FPS gameplay
- 👀 **Spectate** - Watch other players even after you die

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

3. Open your browser to:
```
http://localhost:3000
```

4. **Open multiple tabs/windows** to play with yourself, or share the URL with friends on the same network!

### Controls

- **Arrow Keys**: ↑ ↓ ← →
- **WASD**: W A S D

### Rules

1. Control your snake to eat the golden food
2. Each food gives you 10 points and makes your snake longer
3. Avoid hitting walls
4. Avoid hitting your own snake
5. Compete with other players for the highest score!

## Game Mechanics

- **Starting**: Each player spawns at a random position
- **Movement**: Snake moves continuously in the current direction
- **Growing**: Eating food makes your snake grow by 1 segment
- **Death**: Hitting walls or yourself ends your game
- **Scoring**: +10 points per food eaten

## Technical Details

### Backend
- **Node.js** with Express server
- **Socket.io** for real-time communication
- Game loop runs at 10 ticks per second
- Handles collision detection and game state

### Frontend
- **HTML5 Canvas** for rendering
- **Socket.io client** for real-time updates
- Smooth animations and visual effects
- Responsive design with CSS Grid/Flexbox

## Project Structure

```
multiplayer-game/
├── server.js           # Game server and Socket.io logic
├── package.json        # Dependencies
├── public/
│   ├── index.html     # Game UI
│   ├── style.css      # Styles and animations
│   └── game.js        # Client-side game logic
└── README.md
```

## Playing with Friends

### On the Same Network:

1. Find your local IP address:
   - **Windows**: `ipconfig`
   - **Mac/Linux**: `ifconfig`

2. Share your IP with friends:
   ```
   http://YOUR_IP_ADDRESS:3000
   ```

### Over the Internet:

Deploy to a hosting service like:
- Heroku
- Railway
- Render
- DigitalOcean

## Tips & Strategies

1. **Stay Small** - Longer snakes are harder to maneuver
2. **Control the Center** - Food spawns anywhere on the grid
3. **Plan Ahead** - Think about where you're going, not just where you are
4. **Watch Others** - Learn from other players' mistakes

## Customization

You can easily customize:
- Grid size (change `GRID_SIZE` constant)
- Canvas size (change `CANVAS_SIZE` constant)
- Game speed (change interval in game loop)
- Colors (modify color array in server.js)
- Snake starting length

## License

MIT

---

**Have fun and happy gaming! 🎮🐍**

