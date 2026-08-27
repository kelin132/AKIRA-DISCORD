import "dotenv/config";
import { connectDiscord } from "./lib/discord.mjs";
import { loadPlugins, routeDiscordMessage } from "./lib/pluginManager.mjs";
import { log } from "./lib/logger.mjs";
import { closeDb, connectDb } from "./lib/mongo.mjs";
import { startHealthServer } from "./lib/health.mjs";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || ".";
const OWNER_ID = process.env.DISCORD_OWNER_ID || "";

if (!DISCORD_TOKEN) {
  log("error", "DISCORD_TOKEN is missing. Add it to the hosting provider's secret settings.");
  process.exit(1);
}

async function start() {
  console.log("\n" + "═".repeat(50));
  console.log("  AKIRA-DISCORD — Starting");
  console.log("═".repeat(50));
  console.log(`  Prefix  : ${PREFIX}`);
  console.log("═".repeat(50) + "\n");

  const healthServer = process.env.DISABLE_HEALTH_SERVER === "true"
    ? null
    : startHealthServer({ port: process.env.PORT || 8080 });

  try {
    await connectDb();
    log("info", "Connected to the shared Kelin-MD2 MongoDB database");

    const { totalPlugins, totalCommands } = await loadPlugins(PREFIX);
    log("info", `Plugins loaded: ${totalPlugins} plugins, ${totalCommands} commands`);

    const client = await connectDiscord(DISCORD_TOKEN);
    client.on("messageCreate", (message) => {
      routeDiscordMessage(client, message, PREFIX, OWNER_ID).catch((error) => {
        log("error", `Unhandled message error: ${error.stack || error.message}`);
      });
    });

    const shutdown = async (signal) => {
      log("info", `${signal} received; shutting down gracefully`);
      healthServer?.close();
      client.destroy();
      await closeDb();
      process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    log("info", "AKIRA-DISCORD is now running");
  } catch (error) {
    healthServer?.close();
    log("error", `Startup failed: ${error.stack || error.message}`);
    await closeDb().catch(() => {});
    process.exit(1);
  }
}

start();
