# Deployment Guide

Since this is a real-time multiplayer game using WebSockets (Socket.io), it **cannot** be deployed to Vercel. Vercel doesn't support persistent WebSocket connections.

## Recommended: Deploy to Railway (FREE)

Railway supports WebSockets and is perfect for this game!

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Deploy

1. **Push your code to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

2. **On Railway:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will auto-detect Node.js and deploy!

3. **Your game will be live!** Railway gives you a URL like:
   ```
   https://your-game.railway.app
   ```

### Step 3: Environment Variables (Optional)

Railway automatically sets `PORT` for you. No configuration needed!

---

## Alternative: Deploy to Render (FREE)

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New Web Service"
4. Connect your GitHub repo
5. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Click "Create Web Service"

---

## Alternative: Deploy to Fly.io (FREE)

1. Install Fly CLI:
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Mac/Linux
curl -L https://fly.io/install.sh | sh
```

2. Login:
```bash
fly auth login
```

3. Launch:
```bash
fly launch
```

4. Deploy:
```bash
fly deploy
```

---

## Why Not Vercel?

Vercel is serverless and doesn't support:
- ❌ WebSockets (required for Socket.io)
- ❌ Long-running connections
- ❌ Persistent server state

**Vercel is great for:** Static sites, Next.js apps, API routes
**Not for:** Real-time games, chat apps, WebSocket servers

---

## Quick Comparison

| Platform | Free Tier | WebSockets | Easy Deploy |
|----------|-----------|------------|-------------|
| Railway  | ✅ 500hrs | ✅ Yes     | ✅ Easiest  |
| Render   | ✅ Yes    | ✅ Yes     | ✅ Easy     |
| Fly.io   | ✅ Yes    | ✅ Yes     | ⚠️ Medium   |
| Vercel   | ✅ Yes    | ❌ No      | ✅ Easiest  |

**Recommendation: Use Railway** - It's the easiest and perfect for this game!

---

## Playing After Deployment

Once deployed, just share your Railway/Render/Fly.io URL with friends and play together from anywhere in the world! 🌍🎮

