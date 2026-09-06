import { getDb } from "../../lib/mongo.mjs";

export default {
  name: "lotterylist",
  aliases: ["lottolist", "tickets"],
  category: "economy",
  cooldown: 6,
  description: "View current lottery participants and ticket counts",
  usage: ".lotterylist",

  async run({ sock, msg }) {
    const jid   = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

    try {
      const db  = getDb();
      const lot = await db.collection("lottery").findOne({ _id: "current" });

      if (!lot || !lot.tickets?.length) {
        return reply(
`╭━━━〔 🎰 𝑳𝑶𝑻𝑻𝑬𝑹𝒀 〕━━━╮
┃ ✦ No tickets bought yet!
┃
┃ 💡 Be the first — .lottery
╰━━━━━━━━━━━━━━━━━━━━╯`
        );
      }

      const tickets = Array.isArray(lot.tickets)
        ? lot.tickets.filter((ticket) => Number(ticket.count) > 0)
        : [];
      const totalTickets = Number(lot.totalTickets) || tickets.reduce(
        (total, ticket) => total + (Number(ticket.count) || 0),
        0,
      );
      const sorted = [...tickets].sort((a, b) => Number(b.count) - Number(a.count));
      const rows   = sorted.map((t, i) => {
        const chance = totalTickets > 0
          ? ((Number(t.count) / totalTickets) * 100).toFixed(1)
          : "0.0";
        const medal  = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        return `┃ ${medal} ${t.name} › ${t.count} ticket(s) · ${chance}%`;
      }).join("\n");

      return reply(
`╭━━━〔 🎰 𝑳𝑶𝑻𝑻𝑬𝑹𝒀 𝑳𝑰𝑺𝑻 🎟️ 〕━━━╮
┃ ✦ Current round participants
┃
┃ 💰 Jackpot › $${Number(lot.jackpot || 0).toLocaleString()}
┃ 🎫 Tickets › ${totalTickets} total
┃
┣━━━━━━━━━━━━━━━━━━━━
${rows}
┣━━━━━━━━━━━━━━━━━━━━
┃ 💡 .lottery to join
╰━━━━━━━━━━━━━━━━━━━━╯`
      );
    } catch (err) {
      console.error("LOTTERYLIST ERROR:", err);
      return reply("❌ Failed to load lottery.");
    }
  },
};
