import { getUser, saveUser, requireRegistration, checkLevelUp } from "./database.js";
import { sendEconomyReply } from "../../lib/discordEconomyReply.mjs";
import { ECONOMY_THUMBNAILS } from "../../lib/economyEmbed.mjs";

function fmt(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export default {
  name: "daily",
  description: "Claim your daily reward",
  category: "economy",
  usage: ".daily",
  aliases: ["dailyclaim"],

  async run({ sock, msg, sender }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const user     = await getUser(sender);
    const now      = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const jid      = msg.key.remoteJid;

    if (now - (user.lastDaily || 0) < cooldown) {
      const remaining = cooldown - (now - user.lastDaily);
      const hours     = Math.floor(remaining / (60 * 60 * 1000));
      const minutes   = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      return sendEconomyReply({
        sock,
        jid,
        msg,
        sender,
        title: "🎁 Daily Reward",
        color: "#F1C40F",
        thumbnail: ECONOMY_THUMBNAILS.daily,
        text: `You already claimed your daily reward.\nNext claim: ${hours}h ${minutes}m.`,
        discordText: `🎁 You already claimed your daily reward. Try again in ${hours}h ${minutes}m.`,
      });
    }

    const reward   = 50000 + Math.floor(Math.random() * 50000);
    const xpBonus  = 200;
    user.money    += reward;
    user.lastDaily = now;
    user.xp        = (user.xp || 0) + xpBonus;

    const { leveled, newLevel } = checkLevelUp(user);

    await saveUser(sender, user);

    const caption =
`You claimed your daily reward of ${fmt(reward)} coins.
Streak bonus: +${xpBonus} XP.
Wallet: ${fmt(user.money)} coins.${leveled ? `\nLevel up: ${newLevel}.` : ""}`;

    await sendEconomyReply({
      sock,
      jid,
      msg,
      sender,
      title: "🎁 Daily Reward",
      color: "#F1C40F",
      thumbnail: ECONOMY_THUMBNAILS.daily,
      text: caption,
      discordText: `🎁 You claimed your daily reward of ${fmt(reward)} coins. +${xpBonus} XP. Wallet: ${fmt(user.money)}${leveled ? ` Level up: ${newLevel}.` : ""}`,
    });
  },
};
