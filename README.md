# AKIRA-DISCORD

AKIRA-DISCORD is a high-performance Discord bot adapted from the **Kelin-MD2** WhatsApp bot. It shares the same MongoDB economy, cards, and Pokémon database, allowing users to maintain their progress across both platforms.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 22+
- MongoDB instance (shared with Kelin-MD2)
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### 2. Installation
```bash
git clone https://github.com/kelin132/AKIRA-DISCORD.git
cd AKIRA-DISCORD
npm install
```

### 3. Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your Discord bot token |
| `MONGODB_URI` | Connection string for the shared Kelin-MD2 database |
| `OWNER_ID` | Your Discord User ID for admin permissions |
| `PREFIX` | Command prefix (default: `.`) |
| `PORT` | Port for the health check endpoint (default: `8080`) |

### 4. Running
```bash
# Start the bot
npm start

# Run syntax and integrity checks
npm run check

# Run identity compatibility tests
npm test
```

## 🔄 Synchronization with Kelin-MD2

AKIRA-DISCORD uses a namespaced identity system to coexist with Kelin-MD2 in the same MongoDB collections:
- **WhatsApp Users**: Identified by their JID (e.g., `12345@s.whatsapp.net`).
- **Discord Users**: Identified by a namespaced key (e.g., `discord:1234567890`).

All economy, card, and Pokémon commands automatically resolve the correct identity based on the platform, ensuring XP, balances, and inventories stay synced.

## 🛠 Deployment

This repository includes a production-ready `Dockerfile` optimized for `node-canvas` rendering.

### Deploying to Manus Reserved Hosting
1. Create a new **Reserved Hosting** instance in the Manus Management UI.
2. Bind this repository to the instance.
3. Add your `.env` variables to the **Secrets** panel.
4. The bot will automatically start and expose a health endpoint on the configured `PORT`.

## 📜 License
MIT
