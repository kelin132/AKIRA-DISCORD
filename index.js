import "dotenv/config";
import { connectDiscord } from "./lib/discord.mjs";
import { loadPlugins, routeDiscordMessage } from "./lib/pluginManager.mjs";
import { log } from "./lib/logger.mjs";
import { connectDb } from "./lib/mongo.mjs";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || ".";
const OWNER_ID = process.env.DISCORD_OWNER_ID;

if (!DISCORD_TOKEN) {
  log("error", "DISCORD_TOKEN is missing in .env");
  process.exit(1);
}

async function start() {
  console.log("\n" + "═".repeat(50));
  console.log(`  AKIRA-DISCORD — Starting`);
  console.log("═".repeat(50));
  console.log(`  Prefix  : ${PREFIX}`);
  console.log("═".repeat(50) + "\n");

  try {
    // 1. Connect to MongoDB (Shared with Kelin-MD2)
    await connectDb();
    log("info", "Connected to shared MongoDB database");

    // 2. Load Plugins
    const { totalPlugins, totalCommands } = await loadPlugins(PREFIX);
    log("info", `Plugins loaded: ${totalPlugins} plugins, ${totalCommands} commands`);

    // 3. Connect to Discord
    const client = await connectDiscord(DISCORD_TOKEN);

    // 4. Handle Messages
    client.on("messageCreate", async (message) => {
      await routeDiscordMessage(client, message, PREFIX, OWNER_ID);
    });

    log("info", "AKIRA-DISCORD is now running!");
  } catch (err) {
    log("error", `Startup failed: ${err.message}`);
    process.exit(1);
  }
}

start();
