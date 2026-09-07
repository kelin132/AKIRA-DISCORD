import { getUser, requireRegistration } from "./database.js";
import { formatAccountBalance } from "./balanceFormat.js";

export default {
  name: "balance",
  description: "Check your wallet and bank balance",
  category: "economy",
  usage: ".balance",
  aliases: ["bal", "money", "wallet"],
  cooldown: 6,

  async run({ sock, msg, sender, discord }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const user = await getUser(sender);
    const jid  = msg.key.remoteJid;
    const text = formatAccountBalance({
      wallet: user.money,
      bank: user.bank,
      gems: user.diamonds,
      footerLines: ["Use .ebal", "for account breakdown"],
    });

    if (discord?.message) {
      const displayName = discord.message.member?.displayName
        || discord.message.author?.globalName
        || discord.message.author?.username
        || "Your";
      return sock.sendMessage(jid, {
        discordEmbed: {
          title: `${displayName}'s Balance 🌸`,
          description: "Here are your current funds:",
          color: "#6875F5",
          fields: [
            {
              name: "🪙 Wallet",
              value: `$${Number(user.money || 0).toLocaleString("en-US")}`,
              inline: false,
            },
            {
              name: "🏦 Bank",
              value: `$${Number(user.bank || 0).toLocaleString("en-US")}`,
              inline: false,
            },
          ],
        },
        mentions: [sender],
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text, mentions: [sender] }, { quoted: msg });
  },
};
