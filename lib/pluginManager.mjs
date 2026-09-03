import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { log } from "./logger.mjs";
import { getPermissions } from "./permissions.mjs";
import { ensureDb } from "./mongo.mjs";
import { discordAccountKey } from "./identity.mjs";
import { resolveDiscordAccount } from "./accountLink.mjs";
import { isDiscordSupported } from "./discordSupport.mjs";
import { akiraHandler } from "./akiraHandler.mjs";
import { toDiscordPayload } from "./discordPayload.mjs";
import {
  AIDORU_FOOTER,
  discordAccentColor,
} from "./discordTheme.mjs";

const PLUGINS_DIR = path.resolve("plugins");
const SUPPORT_FILE_RE = /^(?:_.*|database|db|parseAmount|balanceFormat|bettingLimits|walletMessage|autoSpawn|pokeautospawn|dbzautospawn|.*Handler)\.js$/i;
let plugins = [];
let commands = [];
const afkUsers = new Map();

// Compatibility exports for the reused WhatsApp support modules that can be
// imported while the Discord plugin directory is scanned. Discord itself
// does not use the WhatsApp router, but keeping this small contract prevents
// those shared modules from failing at import time.
export function getAfkUser(jid) {
  return afkUsers.get(jid) || null;
}

export function setAfkUser(jid, data) {
  afkUsers.set(jid, data);
}

export function deleteAfkUser(jid) {
  afkUsers.delete(jid);
}

export async function routeMessage() {
  return false;
}

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
      .filter((file) => !SUPPORT_FILE_RE.test(file))
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
        if (!isDiscordSupported(plugin)) continue;

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
  const linkedAccount = await resolveDiscordAccount(rawSender).catch(() => null);
  const sender = linkedAccount || discordAccountKey(rawSender);

  try {
    await ensureDb();
    const permissions = await getPermissions(sender, ownerId, {
      discordId: rawSender,
      linkedAccount: Boolean(linkedAccount),
    });
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
    const discordServerAdmin =
      message.guild &&
      plugin.discordAdmin &&
      (message.member?.permissions?.has?.("ManageGuild") ||
        message.member?.permissions?.has?.("Administrator"));
    if (plugin.isMod && !isMod && !isOwner && !discordServerAdmin) {
      await message.reply("❌ Moderator only command.");
      return;
    }
    if (
      plugin.isAdmin &&
      !isOwner &&
      !message.member?.permissions?.has?.("ManageGuild") &&
      !message.member?.permissions?.has?.("Administrator")
    ) {
      await message.reply("❌ Server administrators only.");
      return;
    }

    const mockSock = {
      sendMessage: async (id, content, options = {}) => {
        const channel = await resolveChannel(client, id, message.channel);
        const payload = toDiscordPayload(content, {
          accentColor: discordAccentColor(plugin),
          title: plugin.discordTitle,
          command: plugin.name,
          footer: AIDORU_FOOTER,
          embedMedia: true,
        });
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

export async function routeDiscordInteraction(client, interaction, prefix = ".", ownerId = "") {
  if (!interaction?.isButton?.()) return;

  const handler = plugins.find((plugin) =>
    typeof plugin.onDiscordInteraction === "function" &&
    String(interaction.customId || "").startsWith(`${plugin.name}:`),
  );
  if (!handler) return;

  try {
    await handler.onDiscordInteraction({
      client,
      interaction,
      prefix,
      ownerId,
    });
  } catch (error) {
    log("error", `Discord interaction failed: ${error.stack || error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ That control could not be used.", ephemeral: true }).catch(() => {});
    }
  }
}

export function getPlugins() {
  return plugins;
}

export function getCommands() {
  return commands;
}
