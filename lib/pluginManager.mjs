import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { log } from "./logger.mjs";
import { getPermissions } from "./permissions.mjs";
import { ensureDb } from "./mongo.mjs";
import { discordAccountKey } from "./identity.mjs";
import { akiraHandler } from "./akiraHandler.mjs";

const PLUGINS_DIR = path.resolve("plugins");
let plugins = [];
let commands = [];

export async function loadPlugins(prefix = ".") {
  plugins = [];
  commands = [];

  if (!existsSync(PLUGINS_DIR)) {
    log("warn", "No plugins/ directory found.");
    return { totalPlugins: 0, totalCommands: 0 };
  }

  const categories = readdirSync(PLUGINS_DIR)
    .filter((entry) => statSync(path.join(PLUGINS_DIR, entry)).isDirectory())
    .sort();

  for (const category of categories) {
    const categoryDir = path.join(PLUGINS_DIR, category);
    const files = readdirSync(categoryDir)
      .filter((file) => file.endsWith(".js"))
      .sort();

    for (const file of files) {
      try {
        const modulePath = path.join(categoryDir, file);
        const imported = await import(`${modulePath}?v=${Date.now()}`);
        const plugin = imported.default;
        if (!plugin?.name || typeof plugin.run !== "function") {
          log("warn", `Skipping invalid plugin ${category}/${file}`);
          continue;
        }

        const normalized = {
          ...plugin,
          name: String(plugin.name).toLowerCase(),
          aliases: (plugin.aliases ?? []).map((alias) => String(alias).toLowerCase()),
          category,
          prefix,
        };
        plugins.push(normalized);
        commands.push(normalized.name, ...normalized.aliases);
      } catch (error) {
        log("warn", `Failed to load plugin ${category}/${file}: ${error.message}`);
      }
    }
  }

  log("info", `Loaded ${plugins.length} plugins from ${categories.length} categories`);
  return { totalPlugins: plugins.length, totalCommands: commands.length };
}

function isMediaContent(content) {
  return content && ["document", "image", "video", "audio"].some((key) => content[key] !== undefined);
}

function toAttachment(value, fileName) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { attachment: Buffer.from(value), name: fileName };
  }
  return { attachment: value, name: fileName };
}

function toDiscordPayload(content) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return content;

  if (content.text && !isMediaContent(content)) return { content: content.text };

  const payload = {};
  if (content.text) payload.content = content.text;
  if (content.caption) payload.content = content.caption;

  if (content.document !== undefined) {
    payload.files = [toAttachment(content.document, content.fileName || "file.bin")];
  } else if (content.image !== undefined) {
    payload.files = [toAttachment(content.image, content.fileName || "image.jpg")];
  } else if (content.video !== undefined) {
    payload.files = [toAttachment(content.video, content.fileName || "video.mp4")];
  } else if (content.audio !== undefined) {
    payload.files = [toAttachment(content.audio, content.fileName || "audio.mp3")];
  }

  return Object.keys(payload).length ? payload : content;
}

async function resolveChannel(client, id, fallbackChannel) {
  if (!id || id === fallbackChannel?.id) return fallbackChannel;

  const rawId = String(id);
  const discordId = rawId.startsWith("discord:") ? rawId.slice("discord:".length) : rawId;

  try {
    return await client.channels.fetch(discordId);
  } catch {
    try {
      const user = await client.users.fetch(discordId);
      return await user.createDM();
    } catch {
      return fallbackChannel;
    }
  }
}

function compatibilityMessage(message) {
  return Object.assign(message, {
    pushName: message.member?.displayName || message.author?.globalName || message.author?.username,
    key: {
      ...(message.key || {}),
      remoteJid: message.channelId,
      participant: message.author?.id,
    },
  });
}

export async function routeDiscordMessage(client, message, prefix = ".", ownerId = "") {
  if (!message || message.author?.bot) return;

  if (!message.content?.startsWith(prefix)) {
    // Check if Akira should respond to this non-command message
    return await akiraHandler({ client, message, prefix });
  }

  const body = message.content.slice(prefix.length).trim();
  if (!body) return;

  const [rawCommand, ...rawArgs] = body.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const args = rawArgs;
  const text = rawArgs.join(" ");
  const rawSender = String(message.author.id);
  const sender = discordAccountKey(rawSender);

  try {
    await ensureDb();
    const permissions = await getPermissions(sender, ownerId);
    const { isOwner, isStaff, isMod, isPremium, isJailed, isBanned } = permissions;

    if (isBanned && !isOwner) {
      await message.reply("🚫 You are banned from using this bot.");
      return;
    }

    const plugin = plugins.find(
      (entry) => entry.name === command || entry.aliases.includes(command),
    );
    if (!plugin) return;

    if (plugin.isOwner && !isOwner) {
      await message.reply("❌ Owner only command.");
      return;
    }
    if (plugin.isStaff && !isStaff && !isOwner) {
      await message.reply("❌ Staff only command.");
      return;
    }
    if (plugin.isMod && !isMod && !isOwner) {
      await message.reply("❌ Moderator only command.");
      return;
    }

    const mockSock = {
      sendMessage: async (id, content, options = {}) => {
        const channel = await resolveChannel(client, id, message.channel);
        const payload = toDiscordPayload(content);
        if (options.quoted && typeof options.quoted.reply === "function") {
          return options.quoted.reply(payload);
        }
        return channel.send(payload);
      },
    };

    await plugin.run({
      sock: mockSock,
      msg: compatibilityMessage(message),
      args,
      text,
      cmd: command,
      sender,
      rawSender,
      prefix,
      isOwner,
      isStaff,
      isMod,
      isPremium,
      isJailed,
      discord: { client, message },
    });
  } catch (error) {
    log("error", `Command ${command} failed: ${error.stack || error.message}`);
    try {
      await message.reply("❌ Command failed. Please try again later.");
    } catch {
      // The channel may have disappeared; the original error is already logged.
    }
  }
}

export function getPlugins() {
  return plugins;
}

export function getCommands() {
  return commands;
}
