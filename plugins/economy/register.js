export default {
  name: "register",
  description: "Open AIDORU to create or link your account",
  category: "economy",
  usage: ".register",
  aliases: ["reg", "signup"],
  discordColor: "#57B894",
  discordTitle: "✅ Welcome to AKIRA Economy",
  cooldown: 5,

  async run({ sock, msg }) {
    await sock.sendMessage(msg.key.remoteJid, {
      text: [
        "🔗 *Use AIDORU to create or link your account*",
        "",
        "Discord does not create a separate economy account.",
        "Open https://aidoru.zone.id to create a new account or choose Continue with Discord and link your existing AIDORU account with its AID ID.",
        "",
        "After linking, your WhatsApp trainer progress works here automatically.",
      ].join("\n"),
    }, { quoted: msg });
  }
};
