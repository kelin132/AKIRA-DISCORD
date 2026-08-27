export default {
  name: "ping",
  description: "Check bot response time",
  category: "main",
  usage: ".ping",
  aliases: ["p"],
  cooldown: 5,

  async run({ discord }) {
    const { message } = discord;
    const start = Date.now();
    const reply = await message.reply("🏓 Pinging...");
    const latency = Date.now() - start;
    await reply.edit(`🏓 Pong! Latency: **${latency}ms**`);
  },
};
