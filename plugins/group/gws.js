import { EmbedBuilder } from "discord.js";
import {
  createDiscordGiveaway,
  formatDiscordGiveawayDuration,
  parseDiscordGiveawayDuration,
} from "../../lib/discordGiveaway.mjs";

export default {
  name: "gws",
  aliases: ["giveaway"],
  description: "Create or reroll a timed reaction giveaway",
  category: "group",
  usage: ".gws <duration> <prize> | .gws reroll <messageId>",
  isMod: true,
  discordAdmin: true,
  cooldown: 0,

  async run({ msg, args, text, rawSender, discord }) {
    const discordMessage = discord?.message;

    if (!discordMessage?.guild) {
      return discordMessage?.reply?.("❌ Giveaways can only be created inside a Discord server.");
    }

    const sub = (args[0] || "").toLowerCase();

    // ── REROLL SUB-COMMAND ────────────────────────────────────────────────
    if (sub === "reroll") {
      const messageId = args[1];
      if (!messageId) {
        return discordMessage.reply("❌ **Please provide the giveaway message ID.**\nUsage: `.gws reroll <messageId>`");
      }

      try {
        const targetMsg = await discordMessage.channel.messages.fetch(messageId);
        if (!targetMsg) {
          return discordMessage.reply("❌ Could not find a message with that ID in this channel.");
        }

        const reaction = targetMsg.reactions.cache.get("🎉");
        if (!reaction) {
          return discordMessage.reply("❌ That message does not have any 🎉 reactions.");
        }

        const users = await reaction.users.fetch();
        // Filter out bot accounts
        const eligible = users.filter((u) => !u.bot).map((u) => u);

        if (eligible.length === 0) {
          return discordMessage.reply("❌ No eligible user entries found on that giveaway message.");
        }

        const newWinner = eligible[Math.floor(Math.random() * eligible.length)];

        const rerollEmbed = new EmbedBuilder()
          .setTitle("🎉 GIVEAWAY REROLL")
          .setDescription(`**Prize:** ${targetMsg.embeds[0]?.title?.replace("🎉 ", "") || "Giveaway Prize"}\n**New Winner:** ${newWinner}`)
          .setColor("#FF0055")
          .setTimestamp();

        return discordMessage.channel.send({
          content: `🥳 Congratulations ${newWinner}! You won the reroll!`,
          embeds: [rerollEmbed],
        });
      } catch (err) {
        return discordMessage.reply(`❌ Failed to reroll giveaway: ${err.message}`);
      }
    }

    // ── CREATE GIVEAWAY ───────────────────────────────────────────────────
    const durationMs = parseDiscordGiveawayDuration(args[0]);
    const prize = text.replace(/^\S+\s*/, "").trim();

    if (!durationMs || !prize) {
      const helpEmbed = new EmbedBuilder()
        .setTitle("❌ Giveaway Details Required")
        .setColor("#FF3366")
        .setDescription("Please specify valid giveaway parameters.")
        .addFields(
          { name: "Usage", value: "`.gws <duration> <prize>`\n`.gws reroll <messageId>`" },
          { name: "Examples", value: "`.gws 2h Nitro Basic`\n`.gws reroll 123456789012345678`" },
          { name: "Supported Durations", value: "`30s`, `10m`, `2h`, `1d`, `1h30m`" },
          { name: "Max Duration", value: formatDiscordGiveawayDuration(30 * 24 * 60 * 60 * 1000) }
        );

      return discordMessage.reply({ embeds: [helpEmbed] });
    }

    try {
      const created = await createDiscordGiveaway({
        message: discordMessage,
        creatorId: rawSender || discordMessage.author.id,
        prize,
        durationMs,
      });

      const confirmEmbed = new EmbedBuilder()
        .setTitle(`🎉 ${prize}`)
        .setDescription(`React with 🎉 to enter!\n**Duration:** ${formatDiscordGiveawayDuration(durationMs)}`)
        .addFields(
          { name: "Hosted By", value: `<@${rawSender || discordMessage.author.id}>`, inline: true },
          { name: "Ends In", value: `${formatDiscordGiveawayDuration(durationMs)}`, inline: true }
        )
        .setColor("#5865F2")
        .setFooter({ text: "Click the reaction below to join!" })
        .setTimestamp(Date.now() + durationMs);

      return discordMessage.reply({
        content: "✅ **Giveaway Started!**",
        embeds: [confirmEmbed],
      });
    } catch (error) {
      return discordMessage.reply(`❌ Could not create the giveaway: ${error.message}`);
    }
  },
};
