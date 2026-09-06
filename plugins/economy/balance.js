import { getUser, requireRegistration } from "./database.js";
import { formatAccountBalance } from "./balanceFormat.js";

export default {
  name: "balance",
  description: "Check your wallet and bank balance",
  category: "economy",
  usage: ".balance",
  aliases: ["bal", "money", "wallet"],
  cooldown: 6,
  discordTitle: "💰 Balance",
  discordAccentColor: "#2ECC71",

  async run({ sock, msg, sender, rawSender, discord }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const user = await getUser(sender);
    const jid  = msg.key.remoteJid;
    if (discord?.message) {
      return sock.sendMessage(jid, {
        discordEmbed: {
          title: "💰 Balance",
          description: "Your current economy summary.",
          color: "#2ECC71",
          fields: [
            { name: "Wallet", value: `$${Number(user.money || 0).toLocaleString()}`, inline: true },
            { name: "Bank", value: `$${Number(user.bank || 0).toLocaleString()}`, inline: true },
            { name: "Gems", value: Number(user.diamonds || 0).toLocaleString(), inline: true },
            { name: "Net worth", value: `$${(Number(user.money || 0) + Number(user.bank || 0)).toLocaleString()}`, inline: false },
          ],
        },
        mentions: rawSender ? [rawSender] : [],
      }, { quoted: msg });
    }
    const text = formatAccountBalance({
      wallet: user.money,
      bank: user.bank,
      gems: user.diamonds,
      footerLines: ["Use .ebal", "for account breakdown"],
    });

    await sock.sendMessage(jid, { text, mentions: [sender] }, { quoted: msg });
  },
};
