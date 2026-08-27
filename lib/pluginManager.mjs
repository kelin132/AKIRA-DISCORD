import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { log } from "./logger.mjs";
import { getPermissions } from "./permissions.mjs";
import { ensureDb } from "./mongo.mjs";

const PLUGINS_DIR = path.resolve("plugins");

let plugins  = [];
let commands = [];

export async function loadPlugins(prefix = ".") {
  plugins  = [];
  commands = [];

  if (!existsSync(PLUGINS_DIR)) {
    log("warn", "No plugins/ directory found.");
    return { totalPlugins: 0, totalCommands: 0 };
  }

  const categories = readdirSync(PLUGINS_DIR).filter((f) =>
    statSync(path.join(PLUGINS_DIR, f)).isDirectory()
  );

  for (const cat of categories) {
    const catDir = path.join(PLUGINS_DIR, cat);
    const files  = readdirSync(catDir).filter((f) => f.endsWith(".js"));

    for (const file of files) {
      const filePath = path.join(catDir, file);
      try {
        const mod    = await import(`${filePath}?v=${Date.now()}`);
        const plugin = mod.default;
        if (!plugin?.name || typeof plugin.run !== "function") continue;
        plugins.push({ ...plugin, category: cat });
        commands.push(plugin.name, ...(plugin.aliases ?? []));
      } catch (err) {
        log("warn", `Failed to load plugin ${cat}/${file}: ${err.message}`);
      }
    }
  }

  log("info", `Loaded ${plugins.length} plugins from ${categories.length} categories`);
  return { totalPlugins: plugins.length, totalCommands: commands.length };
}

export async function routeDiscordMessage(client, message, prefix = ".", ownerId = "") {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const [rawCmd, ...rawArgs] = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd  = rawCmd.toLowerCase();
  const args = rawArgs;
  const text = rawArgs.join(" ");

  // Discord ID instead of JID
  const sender = message.author.id;
  const chatId = message.channel.id;

  await ensureDb();

  // Adapt getPermissions for Discord if needed, or pass IDs directly
  // For now, we'll pass the message object which contains author and guild info
  const perms = await getPermissions(sender, ownerId, { message, client });
  const { isOwner, isStaff, isMod, isPremium, isJailed, isBanned } = perms;

  if (isBanned && !isOwner) {
    await message.reply("🚫 You are *banned* from using this bot.");
    return;
  }

  const plugin = plugins.find(
    (p) => p.name === cmd || (p.aliases ?? []).includes(cmd)
  );

  if (!plugin) return;

  // Permission checks
  if (plugin.isOwner && !isOwner) {
    await message.reply("❌ Owner only command.");
    return;
  }
  
  // Mock 'sock' for plugins to use sendDiscordMessage style or direct discord.js
  const mockSock = {
    sendMessage: async (id, content, options) => {
      const channel = await client.channels.fetch(id);
      if (typeof content === "string") return await channel.send(content);
      if (content.text) return await channel.send(content.text);
      return await channel.send(content);
    }
  };

  try {
    await plugin.run({
      sock: mockSock, 
      msg: message, 
      args, 
      text, 
      cmd, 
      sender, 
      prefix,
      isOwner, 
      isStaff, 
      isMod, 
      isPremium, 
      isJailed,
      discord: { client, message }
    });
  } catch (err) {
    log("error", `Plugin ${plugin.name} error: ${err.message}`);
    await message.reply(`❌ Command failed: ${err.message}`);
  }
}

export function getPlugins()  { return plugins; }
export function getCommands() { return commands; }
