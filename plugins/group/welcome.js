/**
 * KELIN MD — .welcome on|off
 * Toggles welcome messages for the group and shows current status.
 * Actual welcome sending is handled by lib/groupEventHandler.mjs
 */
import { groupSettings } from "../../lib/groupSettings.js";
import { discordSettingsKey } from "../../lib/discordGroupEvents.mjs";

export default {
  name: "welcome",
  description: "Toggle welcome messages for new members",
  category: "group",
  usage: ".welcome on|off",
  aliases: [],
  cooldown: 5,
  isAdmin: true,

  async run({ sock, msg, args, discord }) {
    const discordMessage = discord?.message;
    if (discordMessage?.guild) {
      const key = discordSettingsKey(discordMessage.guild.id);
      const settings = groupSettings.get(key);
      const toggle = args[0]?.toLowerCase();
      if (!toggle || !["on", "off"].includes(toggle)) {
        return discordMessage.reply(
          `👋 **Discord Welcome Messages**\n\nStatus: ${settings.welcomeEnabled ? "✅ ON" : "❌ OFF"}\n` +
          `Channel: ${settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : "Server system channel"}\n\n` +
          "Use `.welcome on` or `.welcome off`.\n" +
          "Use `.setwelcome <message>` to customize it.\n" +
          "Use `.setwelcome image member|group|off` for the avatar/icon.",
        );
      }

      const enabled = toggle === "on";
      groupSettings.set(key, {
        welcomeEnabled: enabled,
        welcomeChannelId: discordMessage.channel.id,
      });
      return discordMessage.reply(enabled
        ? "✅ Welcome messages enabled for new server members."
        : "❌ Welcome messages disabled.");
    }

    const jid = msg.key.remoteJid;

    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "❌ This command only works in groups." }, { quoted: msg });
    }

    const toggle = args[0]?.toLowerCase();
    const settings = groupSettings.get(jid);

    if (!toggle || !["on", "off"].includes(toggle)) {
      const status  = settings?.welcomeEnabled ? "✅ ON" : "❌ OFF";
      const current = settings?.welcome || "_(default message)_";
      return sock.sendMessage(jid, {
        text:
`👋 *WELCOME SETTINGS*

Status : ${status}
Message: ${current}

Usage:
• *.welcome on* — enable welcome messages
• *.welcome off* — disable welcome messages
• *.setwelcome <msg>* — set custom message

Variables for custom message:
• @user  — member's phone number
• @group — group name
• @count — total member count
• {br}   — blank line / paragraph break

Image: *.setwelcome image member|group|off*`,
      }, { quoted: msg });
    }

    const enabled = toggle === "on";
    groupSettings.set(jid, { welcomeEnabled: enabled });

    await sock.sendMessage(jid, {
      text: enabled
        ? `✅ Welcome messages *enabled*!\n\nNew members will be greeted.\nUse *.setwelcome <msg>* to set a custom message.`
        : `❌ Welcome messages *disabled*.`,
    }, { quoted: msg });
  },
};
