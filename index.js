// Run this before importing any bot module.
import "./scripts/auto-update.mjs";
import "dotenv/config";

import { connectDiscord } from "./lib/discord.mjs";
import { loadPlugins, routeDiscordMessage, routeDiscordInteraction } from "./lib/pluginManager.mjs";
import { initGroupSettings } from "./lib/groupSettings.js";
import {
  handleDiscordAntiLink,
  handleDiscordMemberJoin,
  handleDiscordMemberLeave,
} from "./lib/discordGroupEvents.mjs";
import { startDiscordSpawners } from "./lib/discordSpawners.mjs";
import {
  handleDisboardConfirmation,
  startDiscordBumpScheduler,
} from "./lib/discordBump.mjs";
import { startDiscordGiveawayService } from "./lib/discordGiveaway.mjs";
import { log } from "./lib/logger.mjs";
import { closeDb, connectDb } from "./lib/mongo.mjs";
import { startHealthServer } from "./lib/health.mjs";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || ".";
const OWNER_ID = process.env.DISCORD_OWNER_ID || "";

// Keep the Node.js event loop active so host panels like Katabump don't see an early exit (Code 0)
const processKeepAlive = setInterval(() => {}, 2147483647);

// Global safety net for unhandled errors
process.on("uncaughtException", (error) => {
  log("error", `Uncaught Exception: ${error?.stack || error?.message || error}`);
});

process.on("unhandledRejection", (reason) => {
  log("error", `Unhandled Rejection: ${reason?.stack || reason?.message || reason}`);
});

if (!DISCORD_TOKEN) {
  log("error", "DISCORD_TOKEN is missing. Add it to the hosting provider's secret settings.");
  clearInterval(processKeepAlive);
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
    log("info", "Connected to the database");
    await initGroupSettings();

    const { totalPlugins, totalCommands } = await loadPlugins(PREFIX);
    log("info", `Plugins loaded: ${totalPlugins} plugins, ${totalCommands} commands`);

    const client = await connectDiscord(DISCORD_TOKEN);

    // Safeguard background services
    await startDiscordGiveawayService(client).catch((err) => log("error", `Giveaway service error: ${err.message}`));
    try { startDiscordSpawners(client); } catch (err) { log("error", `Spawners error: ${err.message}`); }
    await startDiscordBumpScheduler(client).catch((err) => log("error", `Bump scheduler error: ${err.message}`));

    client.on("messageCreate", async (message) => {
      try {
        const isDisboard = await handleDisboardConfirmation(message).catch((error) => {
          log("error", `DISBOARD confirmation handler failed: ${error.stack || error}`);
          return false;
        });

        if (isDisboard) return;

        const isBlocked = await handleDiscordAntiLink(message).catch((error) => {
          log("error", `Anti-link handler failed: ${error.stack || error}`);
          return false;
        });

        if (!isBlocked) {
          await routeDiscordMessage(client, message, PREFIX, OWNER_ID);
        }
      } catch (error) {
        log("error", `Unhandled message error: ${error.stack || error.message}`);
      }
    });

    client.on("guildMemberAdd", async (member) => {
      try {
        await handleDiscordMemberJoin(member);
      } catch (error) {
        log("error", `Welcome handler failed: ${error.stack || error.message}`);
      }
    });

    client.on("guildMemberRemove", async (member) => {
      try {
        await handleDiscordMemberLeave(member);
      } catch (error) {
        log("error", `Goodbye handler failed: ${error.stack || error.message}`);
      }
    });

    client.on("interactionCreate", async (interaction) => {
      try {
        await routeDiscordInteraction(client, interaction, PREFIX, OWNER_ID);
      } catch (error) {
        log("error", `Unhandled interaction error: ${error.stack || error.message}`);
      }
    });

    const shutdown = async (signal) => {
      log("info", `${signal} received; shutting down gracefully`);
      clearInterval(processKeepAlive);
      healthServer?.close();
      client.destroy();
      await closeDb();
      process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    log("info", "AKIRA-DISCORD is now running");
  } catch (error) {
    clearInterval(processKeepAlive);
    healthServer?.close();
    log("error", `Startup failed: ${error.stack || error.message}`);
    await closeDb().catch(() => {});
    process.exit(1);
  }
}

start();
