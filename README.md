# AKIRA-DISCORD

AKIRA-DISCORD is the Discord version of the Kelin-MD2 WhatsApp bot. It shares the same economy, XP, and card database, allowing users to progress across both platforms.

## Features

- **Shared Economy**: Your balance, level, and XP are synced with the WhatsApp bot.
- **Anime Aesthetic**: Clean Discord embeds and layouts inspired by anime.
- **Plugin System**: Easily extensible command structure adapted from Kelin-MD2.

## Setup

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd AKIRA-DISCORD
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Copy `.env.example` to `.env` and fill in your credentials.
   ```bash
   cp .env.example .env
   ```

4. **Start the bot**:
   ```bash
   npm start
   ```

## Deployment

This bot is designed for persistent hosting. You can deploy it using PM2, Docker, or any Node.js hosting provider.

### PM2 Example
```bash
pm2 start index.js --name "akira-discord"
```

## Credits

- **Owner**: Kelin
- **Developer**: Manus AI
- **Original Bot**: Kelin-MD2
