import { getPlugins } from "../../lib/pluginManager.mjs";
import { groupSettings } from "../../lib/groupSettings.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.mjs";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

const READMORE = "\u200B".repeat(4000);
const discordMenuSessions = new Map();

const categoryEmojis = {
  main: "🏡", economy: "💰", guild: "⚔️", naruto: "🪾", dragonball: "🐉",
  pokemon: "🎮", cards: "🃏", pets: "🐾", anime: "🍡", staff: "🛡️",
  company: "🏢", games: "🎲", fun: "🎀", ai: "🪄", search: "🔎",
  image: "🎨", utilities: "🔧", download: "📥", group: "🌸", admin: "⚜️",
  owner: "👑",
};

const categoryTitles = {
  main: "MAIN",
  economy: "ECONOMY",
  guild: "GUILD",
  pets: "PETS",
  cards: "CARDS",
  pokemon: "POKEMON",
  dragonball: "DRAGON BALL",
  games: "GAMES",
  fun: "FUN",
  ai: "AI",
  search: "SEARCH",
  image: "IMAGE",
  utilities: "UTILITIES",
  download: "DOWNLOAD",
  group: "GROUP",
  anime: "ANIME",
  staff: "STAFF",
  owner: "OWNER",
  company: "COMPANY",
  naruto: "NARUTO",
  media: "MEDIA",
  admin: "ADMIN",
};

const PUBLIC_CATS = new Set([
  "main", "economy", "company", "guild", "games", "fun", "ai", "search",
  "media", "utilities", "download", "group", "anime", "cards",
  "naruto", "pokemon", "pets", "image", "dragonball",
]);

function normalizeCategory(value = "") {
  const normalized = String(value).trim().toLowerCase().replace(/é/g, "e");
  return normalized === "poke" ? "pokemon" : normalized;
}

function formatUsage(usage, menuPrefix) {
  if (!usage) return "";
  return String(usage).replace(/\.(?=[a-z])/gi, menuPrefix);
}

function renderDetailedCommand(plugin, menuPrefix) {
  const command = `${menuPrefix}${plugin.name}`;
  const aliases = (plugin.aliases || [])
    .filter((alias) => alias && alias !== plugin.name)
    .map((alias) => `${menuPrefix}${alias}`);
  const aliasLine = aliases.length ? `\n│   ◇ Also: ${aliases.join("  ·  ")}` : "";
  const usage = formatUsage(plugin.usage, menuPrefix);
  const usageLine = usage ? `\n│   ↳ ${usage}` : "";
  const description = plugin.description || "Explore this command in your trainer journey.";

  return `│ ✦ *${command}*${aliasLine}\n│   ${description}${usageLine}`;
}

function renderCategory(emoji, title, disabledTag, plugins, menuPrefix, detailed = false) {
  const commandLines = plugins
    .map((plugin) => detailed
      ? renderDetailedCommand(plugin, menuPrefix)
      : `│ ꕥ *${menuPrefix}${plugin.name}*`)
    .join("\n");

  const heading = disabledTag ? `*${title}*${disabledTag}` : `*${title}*`;
  return `\n╭─${emoji} 「 ${heading} 」\n│\n${commandLines}\n╰━━━━━━━━━━━━━━━━━━━━`;
}

function chunkForDiscord(text, maxLength = 1900) {
  const chunks = [];
  let current = "";

  for (const line of String(text).split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let start = 0; start < line.length; start += maxLength) {
      const piece = line.slice(start, start + maxLength);
      if (piece.length === maxLength) chunks.push(piece);
      else current = piece;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

const MAX_CATEGORY_BUTTONS = 20;

function discordMenuPayload(token, session) {
  const { categories, categoryTexts, selectedCategory, categoryOffset, runtime } = session;
  const selectedText = selectedCategory
    ? categoryTexts.get(selectedCategory)
    : [
        `*Hello ${session.mention}, I am ${runtime.botName}* 👋`,
        "",
        "Choose a category below to view its Discord commands.",
        "",
        "Each button updates this message, so you can switch categories without filling the channel with menus.",
      ].join("\n");
  const visibleCategories = categories.slice(categoryOffset, categoryOffset + MAX_CATEGORY_BUTTONS);
  const rows = [];

  for (let start = 0; start < visibleCategories.length; start += 5) {
    const row = new ActionRowBuilder();
    for (const category of visibleCategories.slice(start, start + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`menu:${token}:cat:${category}`)
          .setLabel(categoryTitles[category] || category.toUpperCase())
          .setEmoji(categoryEmojis[category] || "📌")
          .setStyle(selectedCategory === category ? ButtonStyle.Primary : ButtonStyle.Secondary),
      );
    }
    rows.push(row);
  }

  const hasCategoryNavigation = categories.length > MAX_CATEGORY_BUTTONS;
  if (hasCategoryNavigation || selectedCategory) {
    const navigation = new ActionRowBuilder();
    if (hasCategoryNavigation) {
      navigation.addComponents(
        new ButtonBuilder()
          .setCustomId(`menu:${token}:nav:previous`)
          .setLabel("◀ More")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(categoryOffset === 0),
        new ButtonBuilder()
          .setCustomId(`menu:${token}:nav:next`)
          .setLabel("More ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(categoryOffset + MAX_CATEGORY_BUTTONS >= categories.length),
      );
    }
    if (selectedCategory) {
      navigation.addComponents(
        new ButtonBuilder()
          .setCustomId(`menu:${token}:home`)
          .setLabel("⌂ Categories")
          .setStyle(ButtonStyle.Success),
      );
    }
    rows.push(navigation);
  }

  const embed = new EmbedBuilder()
    .setColor("#9B87F5")
    .setTitle(`${runtime.botName} • COMMANDS`)
    .setDescription(selectedText)
    .setFooter({
      text: selectedCategory
        ? `${categoryTitles[selectedCategory] || selectedCategory} • Choose another category below`
        : "Choose a category below",
    });
  return { embeds: [embed], components: rows };
}

export default {
  name: "menu",
  description: "Display all available commands",
  category: "main",
  usage: ".menu [category]  — e.g. .menu pokemon",
  aliases: ["help", "cmds", "commands", "start"],
  cooldown: 10,

  async run({ sock, msg, prefix, isOwner, isStaff, isMod, sender, args, discord }) {
    const jid = msg.key.remoteJid;
    const allPlugins = getPlugins();
    const isGroup = jid?.endsWith("@g.us");
    const senderNum = sender.split("@")[0].split(":")[0];
    const gs = isGroup ? (groupSettings.get(jid) || {}) : {};
    const disabledCats = new Set(gs.disabledCategories || []);
    const runtime = getRuntimeSettings();
    const menuPrefix = runtime.prefix || prefix;
    const requestedCategory = normalizeCategory(args?.[0] || "");
    const isDiscord = Boolean(discord?.message);
    const mention = isDiscord
      ? `<@${discord.message.author.id}>`
      : `@${senderNum}`;

    const map = new Map();
    for (const plugin of allPlugins) {
      if (plugin.hidden) continue;
      const cat = plugin.category || "other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(plugin);
    }

    const showStaff = isOwner || isStaff || isMod;
    const order = [
      "main", "economy", "company", "guild", "pets", "cards", "naruto",
      "pokemon", "dragonball", "games", "fun", "ai", "search", "media",
      "image", "utilities", "download", "group", "admin", "anime",
      ...(showStaff ? ["staff"] : []),
      ...(showStaff ? ["owner"] : []),
    ];
    const sortedCats = [
      ...order.filter((cat) => map.has(cat)),
      ...[...map.keys()].filter((cat) => !order.includes(cat) && PUBLIC_CATS.has(cat)).sort(),
    ];

    if (requestedCategory && !sortedCats.includes(requestedCategory)) {
      return sock.sendMessage(jid, {
        text: `❌ That category is unavailable here.\n\nTry *.menu pokemon* to open the Pokémon command guide.`,
      }, { quoted: msg });
    }

    const visibleCats = requestedCategory ? [requestedCategory] : sortedCats;
    let text = requestedCategory
      ? `*MENU*\n${isDiscord ? "" : `\n${READMORE}\n`}`
      : `*Hello ${mention}, I am ${runtime.botName}* 👋
\n${isDiscord ? "" : `${READMORE}\n`}`;

    for (const cat of visibleCats) {
      const isCatDisabled = isGroup && disabledCats.has(cat) && !showStaff;
      if (isCatDisabled) continue;
      const emoji = categoryEmojis[cat] || "📌";
      const title = categoryTitles[cat] || cat.toUpperCase();
      const disabledTag = isGroup && disabledCats.has(cat) && showStaff ? " _(disabled)_" : "";
      const categoryPlugins = [...map.get(cat)].sort((a, b) => a.name.localeCompare(b.name));
      if (requestedCategory) {
        text += renderCategory(emoji, title, disabledTag, categoryPlugins, menuPrefix, true);
        text += `\n\n🌟 _Use *.menu* to return to the full command atlas._`;
      } else {
        text += renderCategory(emoji, title, disabledTag, categoryPlugins, menuPrefix);
      }
    }

    if (isGroup && !showStaff && disabledCats.size > 0) {
      text += `\n\n🔒 *Disabled in this group:* ${[...disabledCats].join(", ")}\n_Ask a staff member to enable them._`;
    }

    if (isDiscord) {
      const token = `${discord.message.author.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const categoryTexts = new Map();
      for (const cat of sortedCats) {
        const isCatDisabled = isGroup && disabledCats.has(cat) && !showStaff;
        if (isCatDisabled) continue;
        const emoji = categoryEmojis[cat] || "📌";
        const title = categoryTitles[cat] || cat.toUpperCase();
        const disabledTag = isGroup && disabledCats.has(cat) && showStaff ? " _(disabled)_" : "";
        const categoryPlugins = [...map.get(cat)].sort((a, b) => a.name.localeCompare(b.name));
        const categoryText = renderCategory(emoji, title, disabledTag, categoryPlugins, menuPrefix, true);
        categoryTexts.set(cat, chunkForDiscord(categoryText, 3800)[0]);
      }

      const session = {
        userId: discord.message.author.id,
        categories: [...categoryTexts.keys()],
        categoryTexts,
        selectedCategory: requestedCategory || null,
        categoryOffset: Math.max(
          0,
          Math.floor(Math.max(0, sortedCats.indexOf(requestedCategory)) / MAX_CATEGORY_BUTTONS) * MAX_CATEGORY_BUTTONS,
        ),
        runtime,
        mention,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      discordMenuSessions.set(token, session);
      setTimeout(() => discordMenuSessions.delete(token), 10 * 60 * 1000).unref?.();
      await discord.message.reply(discordMenuPayload(token, session));
      return;
    }

    return sock.sendMessage(jid, {
      image: { url: runtime.botImage },
      caption: text,
      mentions: [sender],
    }, { quoted: msg });
  },

  async onDiscordInteraction({ interaction }) {
    const parts = String(interaction.customId || "").split(":");
    if (parts.length < 3 || parts[0] !== "menu") return;

    const session = discordMenuSessions.get(parts[1]);
    if (!session || session.expiresAt <= Date.now()) {
      discordMenuSessions.delete(parts[1]);
      return interaction.reply({ content: "❌ This menu has expired. Send `.menu` again.", ephemeral: true });
    }
    if (interaction.user.id !== session.userId) {
      return interaction.reply({ content: "❌ This menu belongs to another user. Send `.menu` to open your own.", ephemeral: true });
    }

    if (parts[2] === "cat" && parts[3]) {
      if (!session.categories.includes(parts[3])) {
        return interaction.reply({ content: "❌ That category is no longer available.", ephemeral: true });
      }
      session.selectedCategory = parts[3];
      session.categoryOffset =
        Math.floor(session.categories.indexOf(parts[3]) / MAX_CATEGORY_BUTTONS) * MAX_CATEGORY_BUTTONS;
      return interaction.update(discordMenuPayload(parts[1], session));
    }

    if (parts[2] === "home") {
      session.selectedCategory = null;
      return interaction.update(discordMenuPayload(parts[1], session));
    }

    if (parts[2] === "nav") {
      const direction = parts[3] === "next" ? MAX_CATEGORY_BUTTONS : -MAX_CATEGORY_BUTTONS;
      session.categoryOffset = Math.max(
        0,
        Math.min(
          Math.floor((session.categories.length - 1) / MAX_CATEGORY_BUTTONS) * MAX_CATEGORY_BUTTONS,
          session.categoryOffset + direction,
        ),
      );
      return interaction.update(discordMenuPayload(parts[1], session));
    }
  },
};