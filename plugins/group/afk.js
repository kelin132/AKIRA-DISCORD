/**
 * KELIN MD — .afk command (Anime Edition)
 *
 * Sets AFK status with an anime-styled message.
 * Auto-removal happens in bot.mjs when the user sends any message.
 * The user does NOT need to type .afk again to come back — it clears automatically.
 */
import { getUser, saveUser } from "../economy/database.js";
import { getAfkUser, setAfkUser } from "../../lib/pluginManager.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours} hour${hours === 1 ? "" : "s"}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default {
  name: "afk",
  aliases: ["away"],
  category: "group",
  cooldown: 6,
  description: "Go AFK — bot will notify others when they tag you.",
  usage: ".afk [reason]",

  async run({ sock, msg, sender, text: rawText, discord }) {
    const jid   = msg.key.remoteJid;
    const discordMessage = discord?.message;
    const discordId = discordMessage?.author?.id || "";
    const avatarUrl = discordMessage?.author?.displayAvatarURL?.({
      extension: "png",
      size: 128,
      forceStatic: true,
    });
    const user  = await getUser(sender);
    const reason = (rawText || "").trim() || "No reason given";
    const tag    = sender.split("@")[0].split(":")[0];
    const name =
      discordMessage?.member?.displayName ||
      discordMessage?.author?.globalName ||
      discordMessage?.author?.username ||
      user.name ||
      tag;
    const displayName = name;
    const discordMention = discordId ? `@${discordId}` : displayName;
    const mentions = discordId ? [`discord:${discordId}`] : [sender];
    const reply = (t, options = {}) => discordMessage
      ? sock.sendMessage(jid, {
          discordEmbed: {
            title: "💤 AFK",
            description: options.discordText || t,
            color: "#A970FF",
            ...(avatarUrl ? { thumbnail: avatarUrl } : {}),
          },
          mentions,
        }, { quoted: msg })
      : sock.sendMessage(jid, { text: t, ...options }, { quoted: msg });

    const existingAfk = user.afk?.active
      ? {
          reason: user.afk.message || user.afk.reason || "No reason given",
          time: user.afk.since || Date.now(),
        }
      : getAfkUser(sender);

    // ── Already AFK — update the reason and reset the timer ─────────────────
    if (existingAfk) {
      const since = Date.now();
      user.afk = { active: true, message: reason, since };
      await saveUser(sender, user);

      setAfkUser(sender, {
        reason,
        time:     since,
        username: name,
      });

      return reply(
`╭───〔 💤 𝗔𝗙𝗞 𝗨𝗣𝗗𝗔𝗧𝗘𝗗 〕───╮
│
│ 🌸 *@${tag}* is still away~
│
│ 📝 𝗥𝗲𝗮𝘀𝗼𝗻: ${reason}
│ ⏰ 𝗥𝗲𝘀𝗲𝘁: \`\`${formatTime(since)}\`\`
╰━━━━━━━━━━━━━━━━━━━━━━╯`,
        {
          discordText: `${discordMention} is still AFK\nReason : ${reason}\nSince : ${formatElapsed(Date.now() - since)}`,
        },
      );
    }

    // ── Set AFK ───────────────────────────────────────────────────────────────
    const since = Date.now();
    user.afk = { active: true, message: reason, since };
    await saveUser(sender, user);

    setAfkUser(sender, {
      reason,
      time:     since,
      username: name,
    });

    return reply(
`╭───〔 🌙 𝗔𝗙𝗞 𝗠𝗢𝗗𝗘 〕───╮
│
│ 🌸 *@${tag}* has gone away~
│
│ 📝 𝗥𝗲𝗮𝘀𝗼𝗻: ${reason}
│ 🕐 𝗦𝗶𝗻𝗰𝗲: \`\`${formatTime(since)}\`\`
╰━━━━━━━━━━━━━━━━━━━━━━╯`,
      {
        discordText: `${discordMention} has gone AFK\nReason : ${reason}\nSince : 0 seconds`,
      },
    );
  },
};
