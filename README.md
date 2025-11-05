# 🔫 Multiplayer Battle Royale Shooter

An ultra-smooth, real-time multiplayer top-down shooter with cyberpunk aesthetics and Team Fortress 2 inspired mechanics.

## 🎮 Features

### Classes
- 🔫 **Shotgunner** - 3-bullet spread, 35 dmg/pellet, 15% faster, close-range beast
- 🎯 **Sniper** - Distance-based damage (20-60), ultra-fast bullets, wider FOV
- 💥 **Rifleman** - Full-auto, 15 dmg/bullet, high ammo capacity
- 🔥 **Pyro** - Flamethrower with visual cone, area damage, short range

### Mechanics
- ⚡ **60 FPS** server tick rate
- 🎯 **Instant hit detection** with lag compensation
- 🔄 **Reload system** - Press R, class-specific times
- 💊 **Power-ups** - Health, Speed, Ammo
- 🤖 **5 AI bots** with randomized classes
- 👥 **Real-time multiplayer** via WebSockets

### UI/UX
- 💚 **TF2-style health cross** that drains
- 🎨 **Cyberpunk HUD** with neon glow effects
- 📡 **Live ping display** with color indicators
- 💀 **Kill feed** showing eliminations
- 💾 **Saved player names** (localStorage)
- 🌈 **Animated UI** with glass morphism

## 🚀 Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000`

## 🎮 Controls

- **WASD** - Move
- **Mouse** - Aim
- **Hold Click** - Shoot (auto-fire)
- **R** - Reload
- **Enter name** - Saved automatically

## ⚙️ Performance

- Client-side prediction for movement
- Optimized bullet physics
- Smart interpolation (20% blend)
- Pyro flames: 100% client-side
- Volatile emissions for low latency

## 🌐 Deployment

Deploy to **Railway** or **Fly.io** (supports WebSockets)

**NOT compatible with Vercel** (no WebSocket support)

## 🎯 Game Balance

| Class | Speed | Ammo | Damage | Range | Fire Rate |
|-------|-------|------|--------|-------|-----------|
| Shotgun | 3.45 | 4/36 | 35×3 | Medium | 500ms |
| Sniper | 3.00 | 5/20 | 20-60 | Long | 700ms |
| Rifle | 2.55 | 30/60 | 15 | Medium | 80ms |
| Pyro | 3.15 | 100/100 | 12 | Short | 80ms |

## 🏆 Made With

- Node.js + Express
- Socket.io (real-time)
- HTML5 Canvas
- Pure JavaScript (no frameworks!)

---

**Absolutely Cinema.** 🎬

Made with 🔥 and ⚡
