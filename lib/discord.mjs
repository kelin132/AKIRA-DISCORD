import { Client, GatewayIntentBits, Partials, EmbedBuilder } from "discord.js";
import { log } from "./logger.mjs";

let client = null;

export async function connectDiscord(token) {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
  });

  client.once("ready", () => {
    log("info", `Logged in as Discord bot: ${client.user.tag}`);
  });

  await client.login(token);
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
