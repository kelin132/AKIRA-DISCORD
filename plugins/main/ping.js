export default {
  name: "ping",
  description: "Check if the bot is responsive",
  category: "main",
  usage: ".ping",
  // Keep `.p` reserved for the economy profile shortcut.
  aliases: [],
  cooldown: 3,
  isOwner: false,
  isAdmin: false,
  isPremium: false,
  version: "1.0.0",
  async run({ sock, msg, discord }) {
    // A send followed by an edit measured two Discord/WhatsApp API round trips,
    // which made a healthy connection look twice as slow. Discord exposes the
    // gateway heartbeat directly; use it when this command is running there.
    const gatewayPing = Number(discord?.client?.ws?.ping);
    const ping = Number.isFinite(gatewayPing) && gatewayPing >= 0
      ? Math.round(gatewayPing)
      : null;

    await sock.sendMessage(msg.key.remoteJid, {
      text: ping == null
        ? "🏓 Pong! Connection is online."
        : `🏓 Pong! Gateway latency: \`${ping}ms\``,
    });
  },
};
