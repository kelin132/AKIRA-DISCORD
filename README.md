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
| `MONGO_URI` | Connection string for the shared Kelin-MD2 database |
| `DISCORD_OWNER_ID` | Your Discord User ID for admin permissions |
| `PREFIX` | Command prefix (default: `.`) |
| `DISCORD_ENABLE_GUILD_MEMBERS` | Set `true` only after enabling Server Members Intent in the Discord Developer Portal |
| `PORT` | Port for the health check endpoint (default: `8080`) |
| `AUTO_UPDATE` | Pull fast-forward updates from the current Git branch before each restart (default: `true`) |
| `AUTO_UPDATE_BRANCH` | Optional branch override; otherwise the checked-out branch is used |
| `AUTO_UPDATE_REPOSITORY` | GitHub `owner/repository` used by panels that deploy without a `.git` directory |
| `AUTO_INSTALL_DEPENDENCIES` | Restore missing or changed npm dependencies during startup (default: `true`) |

### 4. Running
```bash
# Start the bot
npm start

# Run syntax and integrity checks
npm run check

# Run identity compatibility tests
npm test
```

### Automatic updates on restart

`npm start` checks the configured `origin` remote before launching the bot. If the
remote branch has newer commits, it fast-forwards the local checkout and starts
the new version. If `package.json`, `package-lock.json`, or `pnpm-lock.yaml`
changed, production dependencies are installed with `npm ci --omit=dev`.
The same bootstrap also runs when the panel command is `node index.js` directly.
If the panel does not include `.git`, it checks GitHub and downloads the latest
branch archive instead. It preserves `.env`, runtime data, and `node_modules`.
The npm lockfile is intentionally not committed because Replit-generated
lockfiles can contain internal mirror URLs that are unreachable from external
panels; startup installs use the public npm registry.

The updater never overwrites uncommitted local changes and skips updates when
the local and remote branches have diverged. Set `AUTO_UPDATE=false` to disable
the check. The Docker image uses `npm start`, so the same behavior applies when
the container is restarted.

## 🔄 Synchronization with Kelin-MD2

AKIRA-DISCORD uses a namespaced identity system to coexist with Kelin-MD2 in the same MongoDB collections:
- **WhatsApp Users**: Identified by their JID (e.g., `12345@s.whatsapp.net`).
- **Discord Users**: Identified by a namespaced key (e.g., `discord:1234567890`).

To connect an individual user's accounts:
1. On WhatsApp, send `.discordlink`.
2. On Discord, send `.connect CODE` using the one-time code WhatsApp returns.
3. Use `.connect status` to check the connection or `.connect remove` to disconnect it.

After linking, Discord resolves that user's commands to their WhatsApp JID, so their
existing economy, card, Pokémon, guild, and profile progress is used directly. The
code expires after 10 minutes, is stored hashed, and can only be used once. Both
bots must use the same `MONGO_URI`. The existing `.link` command remains reserved
for the Discord server invite.

## 🛠 Deployment

This repository includes a production-ready `Dockerfile` optimized for `node-canvas` rendering.

### Deploying to Manus Reserved Hosting
1. Create a new **Reserved Hosting** instance in the Manus Management UI.
2. Bind this repository to the instance.
3. Add your `.env` variables to the **Secrets** panel.
4. The bot will automatically start and expose a health endpoint on the configured `PORT`.

## 📜 License
MIT
