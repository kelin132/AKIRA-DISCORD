import { resolveDiscordAccount } from "../../lib/accountLink.mjs";
import { parseAmount, formatShorthand } from "./parseAmount.js";
import { addHistory, getUser, isRegistered, saveUser } from "./database.js";

async function resolveTargetDiscordId(message) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned?.id) return String(mentioned.id);

  const referenceId = message?.reference?.messageId;
  if (!referenceId || !message.channel?.messages?.fetch) return null;

  const referenced = await message.channel.messages.fetch(referenceId).catch(() => null);
  return referenced?.author?.id ? String(referenced.author.id) : null;
}

export default {
  name: "pay",
  description: "Send coins to another user",
  category: "economy",
  usage: ".pay @user <amount>  OR  reply to someone's message then .pay <amount>",
  aliases: ["give", "send"],
  cooldown: 5,
  isOwner: false,
  isAdmin: false,
  isPremium: false,
  version: "1.3.0",

  async run({ args, sender, discord }) {
    const message = discord?.message;
    if (!message) return;

    const reply = (content) => message.reply({ content });
    if (String(sender).startsWith("discord:")) {
      return reply("❌ Link your Discord account first with `.connect CODE`.");
    }

    const targetDiscordId = await resolveTargetDiscordId(message);
    const rawAmount = args.at(-1);
    const giver = await getUser(sender);
    const amount = parseAmount(rawAmount, giver.money ?? 0);

    if (!targetDiscordId || !Number.isFinite(amount) || amount <= 0) {
      return reply(
        "Usage:\n" +
        "• `.give @user <amount>` — mention the person\n" +
        "• Reply to their message then `.give <amount>`\n\n" +
        "💡 Shortcuts: `1k` `5m` `1b` `1t` `all` `half`",
      );
    }

    const targetJid = await resolveDiscordAccount(targetDiscordId);
    if (!targetJid) {
      return reply("❌ That Discord user must link their WhatsApp account first with `.connect CODE`.");
    }
    if (targetJid === sender) {
      return reply("❌ You can't give money to yourself.");
    }
    if (!(await isRegistered(sender)) || !(await isRegistered(targetJid))) {
      return reply("❌ Both players must be registered in the economy system.");
    }
    if ((giver.money ?? 0) < amount) {
      return reply(`❌ Insufficient cash. You have $${formatShorthand(giver.money ?? 0)}.`);
    }

    const receiver = await getUser(targetJid);
    giver.money -= amount;
    receiver.money = (receiver.money ?? 0) + amount;

    await saveUser(sender, giver);
    await saveUser(targetJid, receiver);
    await addHistory(sender, "donate_out", -amount, `Gave $${amount.toLocaleString()} to ${receiver.name}`);
    await addHistory(targetJid, "donate_in", amount, `Received $${amount.toLocaleString()} from ${giver.name}`);

    return message.reply({
      content:
        `✅ Sent $${formatShorthand(amount)} to <@${targetDiscordId}>\n` +
        `💰 Your balance: $${formatShorthand(giver.money)}`,
      allowedMentions: { users: [targetDiscordId] },
    });
  },
};