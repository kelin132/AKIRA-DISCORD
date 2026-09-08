import {
  createDiscordGiveaway,
  formatDiscordGiveawayDuration,
  parseDiscordGiveawayDuration,
} from "../../lib/discordGiveaway.mjs";

export default {
  name: "gws",
  aliases: ["giveaway"],
  description: "Create a timed reaction giveaway",
  category: "group",
  usage: ".gws <duration> <prize>",
  isMod: true,
  discordAdmin: true,
  cooldown: 10,

  async run({ msg, args, text, rawSender, discord }) {
    const discordMessage = discord?.message;
    const durationMs = parseDiscordGiveawayDuration(args[0]);
    const prize = text.replace(/^\S+\s*/, "").trim();

    if (!discordMessage?.guild) {
      return discordMessage?.reply?.("❌ Giveaways can only be created inside a Discord server.");
    }

    if (!durationMs || !prize) {
      return discordMessage.reply([
        "❌ **Giveaway details required**",
        "",
        "**Usage:** `.gws <duration> <prize>`",
        "**Example:** `.gws 2h Nitro Basic`",
        "",
        "Durations: `30s`, `10m`, `2h`, `1d`, `1h30m`.",
        `Maximum duration: ${formatDiscordGiveawayDuration(30 * 24 * 60 * 60 * 1000)}.`,
      ].join("\n"));
    }

    try {
      await createDiscordGiveaway({
        message: discordMessage,
        creatorId: rawSender || discordMessage.author.id,
        prize,
        durationMs,
      });
      return discordMessage.reply(
        `✅ Giveaway created. React with ${"🎉"} to enter; the winner will be selected in ${formatDiscordGiveawayDuration(durationMs)}.`,
      );
    } catch (error) {
      return discordMessage.reply(`❌ Could not create the giveaway: ${error.message}`);
    }
  },
};