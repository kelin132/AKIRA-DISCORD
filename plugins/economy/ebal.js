import { getUser, requireRegistration } from "./database.js";
import { formatAccountBalance } from "./balanceFormat.js";

export default {
  name: "ebal",
  aliases: ["extbal", "fullbal", "mybal"],
  category: "economy",
  cooldown: 6,
  description: "Extended balance — cash, bank, vault, orbs and net worth",
  usage: ".ebal",

  async run({ sock, msg, sender, discord }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const user  = await getUser(sender);
    const cash  = user.money  ?? 0;
    const bank  = user.bank   ?? 0;
    const vault = user.vault  ?? 0;
    const orbs  = user.orbs   ?? 0;
  const diamonds = user.diamonds ?? 0;
    const net   = cash + bank + vault;
    const loan  = user.loan?.active ? user.loan.amount : 0;

    const extraRows = [
      `⭐ 𝗟𝗲𝘃𝗲𝗹   ୨୧ ${user.level ?? 1}`,
      `🔮 𝗫𝗣      ୨୧ ${(user.xp ?? 0).toLocaleString()}`,
      `🎒 𝗜𝘁𝗲𝗺𝘀   ୨୧ ${(user.inventory ?? []).length}`,
    ];

    if (loan > 0) extraRows.push(`⚠️ 𝗟𝗼𝗮𝗻    ୨୧ $${loan.toLocaleString()}`);

    if (discord?.message) {
      const displayName = discord.message.member?.displayName
        || discord.message.author?.globalName
        || discord.message.author?.username
        || "Your";
      const fields = [
        { name: "🪙 Wallet", value: `$${Number(cash).toLocaleString("en-US")}`, inline: false },
        { name: "🏦 Bank", value: `$${Number(bank).toLocaleString("en-US")}`, inline: false },
        { name: "💎 Gems", value: Number(diamonds).toLocaleString("en-US"), inline: false },
        { name: "🔒 Vault", value: `$${Number(vault).toLocaleString("en-US")}`, inline: false },
        { name: "🔮 Orbs", value: Number(orbs).toLocaleString("en-US"), inline: false },
        { name: "🌌 Net worth", value: `$${Number(net).toLocaleString("en-US")}`, inline: false },
        { name: "⭐ Level", value: String(user.level ?? 1), inline: true },
        { name: "🔮 XP", value: Number(user.xp ?? 0).toLocaleString("en-US"), inline: true },
        { name: "🎒 Items", value: String((user.inventory ?? []).length), inline: true },
      ];
      if (loan > 0) fields.push({ name: "⚠️ Loan", value: `$${Number(loan).toLocaleString("en-US")}`, inline: false });

      return sock.sendMessage(msg.key.remoteJid, {
        discordEmbed: {
          title: `${displayName}'s Balance 🌸`,
          description: "Here are your full account details:",
          color: "#6875F5",
          fields,
        },
        mentions: [sender],
      }, { quoted: msg });
    }

    await sock.sendMessage(msg.key.remoteJid, {
      text: formatAccountBalance({
        wallet: cash,
        bank,
        gems: diamonds,
        vault,
        orbs,
        netWorth: net,
        extraRows,
      }),
      mentions: [sender],
    }, { quoted: msg });
  },
};
