export default {
  name: "ping",
  aliases: ["latency", "speed"],
  category: "utilities",
  description: "Check bot response speed",
  usage: ".ping",
  cooldown: 3,

  async run({ sock, msg, discord }) {
    const jid = msg.key.remoteJid;
    const gatewayPing = Number(discord?.client?.ws?.ping);
    const latency = Number.isFinite(gatewayPing) && gatewayPing >= 0
      ? `*${Math.round(gatewayPing)} ms*`
      : "*Online*";

    // Keep ping to one outbound request. The old implementation sent a
    // placeholder and then edited it, adding a second network round trip.
    return sock.sendMessage(jid, {
      text: `╭─「 ⚡ 𝐀𝐈𝐃𝐎𝐑𝐔 𝐏𝐈𝐍𝐆 」─╮\n│ 🛰️ Gateway   :: ${latency}\n│ 🌸 Status    :: *Online*\n╰────────────────╯`,
    });
  },
};
