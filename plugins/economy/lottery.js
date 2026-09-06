/**
 * .lottery  — enter the global lottery ($10,000, one ticket per round)
 * .lottery draw           — owner-only: draw the winning ticket
 * .lottery info           — show jackpot + your tickets
 */
import { getUser, saveUser, requireRegistration, addHistory } from "./database.js";
import { getDb } from "../../lib/mongo.mjs";
import { getLotteryAnnouncementChannel } from "../../lib/lotterySettings.mjs";
import {
  drawLottery,
  findLotteryTicket,
  getDiscordParticipantId,
  lotteryDisplayName,
  REQUIRED_LOTTERY_ENTRIES,
} from "../../lib/lotteryDraw.mjs";

const TICKET_PRICE  = 10_000;
const MAX_TICKETS   = 1;
const MIN_JACKPOT   = 10_000_000;
const MAX_JACKPOT   = 50_000_000;

function randomBaseJackpot() {
  return Math.floor(Math.random() * (MAX_JACKPOT - MIN_JACKPOT + 1)) + MIN_JACKPOT;
}

async function getLottery() {
  const db  = getDb();
  let doc   = await db.collection("lottery").findOne({ _id: "current" });
  if (!doc) {
    const base = randomBaseJackpot();
    doc = { _id: "current", tickets: [], totalTickets: 0, jackpot: base, baseJackpot: base, createdAt: new Date() };
    await db.collection("lottery").insertOne(doc);
  }
  const tickets = Array.isArray(doc.tickets)
    ? doc.tickets
      .map((ticket) => ({ ...ticket, count: Number(ticket.count) || 0 }))
      .filter((ticket) => ticket.count > 0)
    : [];
  const totalTickets = tickets.reduce((total, ticket) => total + ticket.count, 0);
  const jackpot = Number(doc.jackpot);
  return {
    ...doc,
    tickets,
    totalTickets,
    jackpot: Number.isFinite(jackpot) && jackpot >= 0 ? jackpot : randomBaseJackpot(),
  };
}

async function saveLottery(data) {
  const { _id, ...rest } = data;
  await getDb().collection("lottery").updateOne({ _id: "current" }, { $set: rest }, { upsert: true });
}

export default {
  name: "lottery",
  aliases: ["lotto"],
  category: "economy",
  cooldown: 6,
  description: "Buy lottery tickets or draw the jackpot",
  usage: ".lottery  |  .lottery info  |  .lottery draw",
  discordColor: "#F1C40F",
  discordTitle: "🎰 Lottery",

  async run({ sock, msg, sender, rawSender, args, isOwner, staffLevel, discord }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const jid  = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });
    const sub  = (args[0] || "buy").toLowerCase();

    // ── INFO ───────────────────────────────────────────────────────────────────
    if (sub === "info") {
      const lot      = await getLottery();
      const discordId = getDiscordParticipantId(discord, rawSender);
      const lotteryUserId = sender.startsWith("discord:")
        ? sender
        : sender.split("@")[0];
      const currentTicket = findLotteryTicket(lot.tickets, lotteryUserId, discordId);
      const myCount  = currentTicket?.count || 0;
      const chance   = lot.totalTickets > 0 ? ((myCount / lot.totalTickets) * 100).toFixed(1) : "0.0";
      return reply(
`╭━━━〔 🎰 𝑳𝑶𝑻𝑻𝑬𝑹𝒀 𝑰𝑵𝑭𝑶 🎟️ 〕━━━╮
┃ ✦ Try your luck — win big!
┃
┃ 💰 Jackpot      › $${Number(lot.jackpot || 0).toLocaleString()}
┃ 🎫 Total Tickets › ${lot.totalTickets}
┃ 🎟️  Your Tickets  › ${myCount}
┃ 🎯 Your Chance  › ${chance}%
┃
┣━━━━━━━━━━━━━━━━━━━━
┃ 🏷️  Price › $${TICKET_PRICE.toLocaleString()} per ticket
┃ 🔒 Max   › ${MAX_TICKETS} tickets per player
┣━━━━━━━━━━━━━━━━━━━━
┃ 💡 .lottery buy <n>  — buy tickets
┃ 💡 .lotterylist      — see all players
╰━━━━━━━━━━━━━━━━━━━━╯`
      );
    }

    // ── BUY ────────────────────────────────────────────────────────────────────
    if (sub === "buy") {
      const requestedCount = args[1] ? parseInt(args[1], 10) : 1;
      if (!Number.isFinite(requestedCount) || requestedCount < 1) return reply("❌ Use `.lottery` to buy one ticket.");
      if (requestedCount > 1) return reply("🎟️ You can only buy one ticket for the global lottery.");

      const lot     = await getLottery();
      const userId  = sender.startsWith("discord:")
        ? sender
        : sender.split("@")[0];
      const discordId = getDiscordParticipantId(discord, rawSender);
      const myEntry = findLotteryTicket(lot.tickets, userId, discordId);
      const myCount = myEntry?.count ?? 0;

      if (myCount >= MAX_TICKETS) {
        return reply("⚠️ You have already entered the global lottery.");
      }

      const canBuy = Math.min(requestedCount, MAX_TICKETS - myCount);
      const cost   = canBuy * TICKET_PRICE;
      const user   = await getUser(sender);

      if (user.money < cost) {
        return reply(
`╭━━━〔 💸 𝑰𝑵𝑺𝑼𝑭𝑭𝑰𝑪𝑰𝑬𝑵𝑻 𝑭𝑼𝑵𝑫𝑺 〕━━━╮
┃ ✦ Not enough cash for tickets!
┃
┃ 🏷️  Cost    › $${cost.toLocaleString()}
┃ 👛 Wallet  › $${user.money.toLocaleString()}
┣━━━━━━━━━━━━━━━━━━━━
┃ 💡 Earn more via .work .daily .crime
╰━━━━━━━━━━━━━━━━━━━━╯`
        );
      }

      user.money -= cost;
      await saveUser(sender, user);
      await addHistory(sender, "lottery", -cost, `Bought ${canBuy} lottery ticket(s)`);

      lot.jackpot += cost;
      if (myEntry) {
        myEntry.count += canBuy;
        if (discordId) myEntry.discordId = discordId;
        if (discord?.message) myEntry.name = lotteryDisplayName({
          name: discord.message.member?.displayName
            || discord.message.author?.globalName
            || discord.message.author?.username
            || myEntry.name,
        });
      } else {
        lot.tickets.push({
          userId,
          discordId: discordId || undefined,
          name: discord?.message?.member?.displayName
            || discord?.message?.author?.globalName
            || discord?.message?.author?.username
            || user.name
            || "User",
          count: canBuy,
        });
      }
      lot.totalTickets += canBuy;
      await saveLottery(lot);

      const newTotal = (myCount + canBuy);
      const chance   = ((newTotal / lot.totalTickets) * 100).toFixed(1);

      await reply(
        `✅ You have entered the global lottery.\n🎟️ One ticket purchased for $${cost.toLocaleString()}.\n💰 Wallet remaining: $${user.money.toLocaleString()}\n🍀 Good luck!`,
      );

      if (lot.totalTickets >= REQUIRED_LOTTERY_ENTRIES) {
        const guildId = discord?.message?.guildId || msg.guildId || null;
        const configuredChannel = guildId
          ? await getLotteryAnnouncementChannel(guildId)
          : null;
        const result = await drawLottery({
          db: getDb(),
          minimumEntries: REQUIRED_LOTTERY_ENTRIES,
          guildId,
          announcementChannelId: configuredChannel,
          discord,
        });
        if (result.ok) {
          await sock.sendMessage(jid, result.message);
          if (configuredChannel && String(configuredChannel) !== String(jid)) {
            await sock.sendMessage(configuredChannel, result.message).catch((error) => {
              console.error("[lottery] Failed to post configured announcement:", error.message);
            });
          }
        }
      }
      return;
    }

    // ── DRAW (owner only) ──────────────────────────────────────────────────────
    if (sub === "draw") {
      if (!isOwner && (staffLevel || 0) < 2) return reply(
`╭━━━〔 🔒 𝑨𝑪𝑪𝑬𝑺𝑺 𝑫𝑬𝑵𝑰𝑬𝑫 〕━━━╮
┃ ✦ Insufficient permissions!
┃
┃ 🎰 Drawing requires:
┃    › Owner  OR  Staff Level 2+
╰━━━━━━━━━━━━━━━━━━━━╯`
      );

      const guildId = discord?.message?.guildId || msg.guildId || null;
      const announcementChannelId = guildId
        ? await getLotteryAnnouncementChannel(guildId)
        : null;
      const result = await drawLottery({
        db: getDb(),
        minimumEntries: 1,
        guildId,
        announcementChannelId,
        discord,
      });
      if (!result.ok) {
        return reply(result.reason === "empty"
          ? "❌ No tickets have been bought yet."
          : "❌ The lottery could not be drawn.");
      }
      await sock.sendMessage(jid, result.message, { quoted: msg });
      if (announcementChannelId && String(announcementChannelId) !== String(jid)) {
        await sock.sendMessage(announcementChannelId, result.message).catch((error) => {
          console.error("[lottery] Failed to post configured announcement:", error.message);
        });
      }
      return;
    }

    return reply(
`╭━━━〔 ℹ️ 𝑼𝑺𝑨𝑮𝑬 〕━━━╮
┃ .lottery info        — jackpot info
┃ .lottery buy <n>     — buy tickets
┃ .lottery draw        — draw winner
┃ .lotterylist         — all players
╰━━━━━━━━━━━━━━━━━━━━╯`
    );
  },
};
