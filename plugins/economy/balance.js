import { getUser, requireRegistration } from "./database.js";
import { formatAccountBalance } from "./balanceFormat.js";

export default {
  name: "balance",
  description: "Check your wallet and bank balance",
  category: "economy",
  usage: ".balance",
  aliases: ["bal", "money", "wallet"],
  cooldown: 6,

  async run({ discord, sender }) {
    if (!await requireRegistration(discord, sender)) return;

    const user = await getUser(sender, true);
    const text = formatAccountBalance({
      wallet: user.money,
      bank: user.bank,
      gems: user.diamonds,
    });

    await discord.message.reply(`\`\`\`\n${text}\n\`\`\``);
  },
};
