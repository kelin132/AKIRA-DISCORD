import {
  BUMP_CHANNEL_ID,
  recordBumpRequest,
} from "../../lib/discordBump.mjs";

export default {
  name: "bump",
  aliases: ["serverbump"],
  category: "group",
  description: "Record a server bump and remind the bumpies role in two hours",
  usage: "/bump",
  cooldown: 10,

  async run({ sock, msg, sender, discord }) {
    const discordMessage = discord?.message;
    if (!discordMessage?.guild) {
      return sock.sendMessage(
        msg.key.remoteJid,
        { text: "❌ This command is available in the Discord server only." },
        { quoted: msg },
      );
    }

    if (discordMessage.channelId !== BUMP_CHANNEL_ID) {
      return discordMessage.reply(
        `❌ Please use this command in <#${BUMP_CHANNEL_ID}>.`,
      );
    }

    await recordBumpRequest({
      guildId: discordMessage.guild.id,
      channelId: discordMessage.channelId,
      userId: sender,
      discordId: discordMessage.author.id,
      userName:
        discordMessage.member?.displayName ||
        discordMessage.author.globalName ||
        discordMessage.author.username,
    });
    return discordMessage.reply(
      "✅ Bump request sent. DISBOARD will confirm it shortly.",
    );
  },
};
