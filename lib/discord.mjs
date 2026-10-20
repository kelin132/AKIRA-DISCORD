import { Client, GatewayIntentBits, Partials, EmbedBuilder } from "discord.js";
import { log } from "./logger.mjs";
import {
  heartbeatDiscordBot,
  markDiscordBotOffline,
  markDiscordBotOnline,
} from "./botRegistry.mjs";

let client = null;
let presenceTimer = null;
const processStartedAt = new Date();

export async function connectDiscord(token) {
  // Message Content is required for prefix commands. Guild Members is a
  // privileged intent and is opt-in because Discord rejects the whole gateway
  // connection when it has not been enabled in the Developer Portal.
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ];
  if (process.env.DISCORD_ENABLE_GUILD_MEMBERS === "true") {
    intents.push(GatewayIntentBits.GuildMembers);
  }

  client = new Client({
    intents,
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction],
  });

  client.once("clientReady", () => {
    log("info", `Logged in as Discord bot: ${client.user.tag}`);
    const publishPresence = () => {
      if (!client?.user?.id) return;
      const update = client.isReady()
        ? markDiscordBotOnline({
            botId: client.user.id,
            botName: process.env.DISCORD_BOT_NAME || client.user.username,
            startedAt: processStartedAt,
          })
        : markDiscordBotOffline(client.user.id);
      void update.catch((error) => log("warn", `Discord bot registry update failed: ${error.message}`));
    };
    publishPresence();
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = setInterval(() => {
      if (!client?.user?.id) return;
      const update = client.isReady()
        ? heartbeatDiscordBot(client.user.id)
        : markDiscordBotOffline(client.user.id);
      void update.catch((error) => log("warn", `Discord bot heartbeat failed: ${error.message}`));
    }, 20_000);
    presenceTimer.unref?.();
  });
  client.on("shardDisconnect", () => {
    if (client?.user?.id) {
      void markDiscordBotOffline(client.user.id).catch((error) =>
        log("warn", `Discord bot offline update failed: ${error.message}`),
      );
    }
  });
  client.on("shardReady", () => {
    if (client?.user?.id) {
      void markDiscordBotOnline({
        botId: client.user.id,
        botName: process.env.DISCORD_BOT_NAME || client.user.username,
        startedAt: processStartedAt,
      }).catch((error) => log("warn", `Discord bot reconnect update failed: ${error.message}`));
    }
  });

  await client.login(token);
  if (process.env.DISCORD_ENABLE_GUILD_MEMBERS !== "true") {
    log(
      "warn",
      "Guild Members intent is disabled; Discord welcome/goodbye events will not fire. " +
      "Enable it in the Developer Portal and set DISCORD_ENABLE_GUILD_MEMBERS=true.",
    );
  }
  return client;
}

export function getDiscordClient() {
  return client;
}

/**
 * Helper to translate WhatsApp-style message sending to Discord
 * This allows some reuse of Kelin-MD2 plugin logic.
 */
export async function sendDiscordMessage(channel, content, options = {}) {
  if (typeof content === "string") {
    return await channel.send(content);
  }

  if (content.text) {
    const embed = new EmbedBuilder()
      .setDescription(content.text);
    
    if (content.linkPreview) {
      embed.setTitle(content.linkPreview.title || "Link Preview")
           .setURL(content.linkPreview["canonical-url"])
           .setThumbnail(content.linkPreview.jpegThumbnail ? "attachment://thumbnail.jpg" : null);
    }

    const messagePayload = { embeds: [embed] };
    if (options.quoted) {
      // Discord doesn't have "quoted" in the same way, but we can reply
      return await options.quoted.reply(messagePayload);
    }
    return await channel.send(messagePayload);
  }

  return await channel.send(content);
}
