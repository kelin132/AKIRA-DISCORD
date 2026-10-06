import { randomUUID } from "node:crypto";
import { addHistory } from "../plugins/economy/database.js";

export const REQUIRED_LOTTERY_ENTRIES = 15;
export const LOTTERY_PRIZES = [30_000_000, 20_000_000, 10_000_000];

function discordIdFrom(value) {
  const raw = String(value || "");
  if (raw.startsWith("discord:")) return raw.slice("discord:".length);
  return /^\d{16,20}$/.test(raw) ? raw : null;
}

export function getDiscordParticipantId(discord, rawSender) {
  if (discord?.message?.author?.id) return String(discord.message.author.id);
  if (!discord?.message) return null;
  return discordIdFrom(rawSender) || null;
}

export function lotteryTicketDiscordId(ticket) {
  const linkedDiscordId = discordIdFrom(ticket?.discordId);
  if (linkedDiscordId) return linkedDiscordId;
  const userId = String(ticket?.userId || "");
  return userId.startsWith("discord:") ? discordIdFrom(userId) : null;
}

export function findLotteryTicket(tickets, sender, discordId) {
  return tickets.find((ticket) =>
    String(ticket.userId) === String(sender)
    || (discordId && String(ticket.discordId || "") === String(discordId))
    || (discordId && String(ticket.userId) === `discord:${discordId}`),
  );
}

export function lotteryDisplayName(ticket) {
  const name = String(ticket?.name || "").trim();
  if (name) return name;
  if (String(ticket?.userId || "").startsWith("discord:")) return "Discord user";
  const identity = lotteryWinnerIdentity(ticket);
  return identity.endsWith("@s.whatsapp.net") ? identity.split("@")[0] : "Lottery player";
}

export async function resolveDiscordDisplayName(discord, ticket) {
  const discordId = lotteryTicketDiscordId(ticket);
  if (!discordId || !discord?.client) return "";

  const guild = discord.message?.guild;
  if (guild?.members?.fetch) {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member?.displayName) return String(member.displayName).trim();
  }

  const user = await discord.client.users.fetch(discordId).catch(() => null);
  return String(user?.globalName || user?.username || "").trim();
}

export function lotteryWinnerLabel(ticket) {
  const identity = lotteryWinnerIdentity(ticket);
  const phone = identity.endsWith("@s.whatsapp.net") ? identity.split("@")[0] : "";
  const name = lotteryDisplayName(ticket);
  return phone ? "@" + phone + " (" + name + ")" : name;
}

function weightedWinners(tickets, count = LOTTERY_PRIZES.length) {
  const candidates = tickets
    .filter((ticket) => Number(ticket.count) > 0);
  const weighted = candidates.map((ticket) => ({ ticket, weight: Number(ticket.count) }));
  const winners = [];

  while (weighted.length && winners.length < count) {
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    let selectedIndex = weighted.length - 1;

    for (let index = 0; index < weighted.length; index += 1) {
      roll -= weighted[index].weight;
      if (roll < 0) {
        selectedIndex = index;
        break;
      }
    }

    const selected = weighted.splice(selectedIndex, 1)[0].ticket;
    winners.push(selected);
  }

  return winners;
}

export function lotteryWinnerIdentity(ticket) {
  const identity = String(ticket?.userId || "").trim();
  if (!identity) return "";
  if (identity.startsWith("discord:") || identity.includes("@")) return identity;
  return `${identity}@s.whatsapp.net`;
}

export async function drawLottery({
  db,
  minimumEntries = 1,
  guildId = null,
  announcementChannelId = null,
  discord = null,
}) {
  const lot = await db.collection("lottery").findOne({ _id: "current" });
  const totalTickets = Number(lot?.totalTickets || 0);

  if (!lot || !lot.tickets?.length) {
    return { ok: false, reason: "empty" };
  }
  if (totalTickets < minimumEntries) {
    return { ok: false, reason: "minimum", totalTickets, minimumEntries };
  }

  const winners = weightedWinners(lot.tickets, 3).map((winner) => ({ ...winner }));
  if (!winners.length) return { ok: false, reason: "empty" };

  for (const winner of winners) {
    const identity = lotteryWinnerIdentity(winner);
    const profile = identity
      ? await db.collection("users").findOne({ _id: identity }, { projection: { name: 1 } })
      : null;
    const discordOnly = String(winner.userId || "").startsWith("discord:");
    if (discordOnly) {
      const displayName = await resolveDiscordDisplayName(discord, winner);
      winner.name = displayName || profile?.name || winner.name;
    } else if (profile?.name) {
      winner.name = String(profile.name).trim();
    }
  }

  const whatsappGroupId = [...lot.tickets].reverse()
    .map((ticket) => String(ticket.groupId || ticket.whatsappGroupId || ""))
    .find((id) => id.endsWith("@g.us")) || null;
  const awarded = [];

  for (let index = 0; index < winners.length; index += 1) {
    const winner = winners[index];
    const amount = LOTTERY_PRIZES[index];
    const identity = lotteryWinnerIdentity(winner);
    if (!identity) continue;

    await db.collection("users").updateOne(
      { _id: identity },
      {
        $inc: { money: amount },
        $setOnInsert: { name: lotteryDisplayName(winner), registered: true },
      },
      { upsert: true },
    );
    await addHistory(
      identity,
      "lottery_win",
      amount,
       `Won lottery prize $${amount.toLocaleString()} (${index + 1}/${LOTTERY_PRIZES.length})`,
    );
    awarded.push({ ...winner, amount });
  }

  const newBase = Math.floor(Math.random() * (50_000_000 - 10_000_000 + 1)) + 10_000_000;
  await db.collection("lottery").updateOne(
    { _id: "current" },
    {
      $set: {
        tickets: [],
        totalTickets: 0,
        jackpot: newBase,
        baseJackpot: newBase,
        createdAt: new Date(),
      },
    },
  );

  const winnerLines = awarded.map((winner, index) => {
    const medal = ["🥇", "🥈", "🥉"][index] || "🏆";
    return "┃ " + medal + " " + lotteryWinnerLabel(winner) + " — $" + winner.amount.toLocaleString();
  });
  const mentions = discord?.message
    ? awarded
      .map(lotteryTicketDiscordId)
      .filter(Boolean)
      .map((id) => `discord:${id}`)
    : awarded
      .map(lotteryWinnerIdentity)
      .filter((identity) => identity.endsWith("@s.whatsapp.net"));

  return {
    ok: true,
    prize: LOTTERY_PRIZES.reduce((sum, amount) => sum + amount, 0),
    winners: awarded,
    mentions,
    totalTickets,
    whatsappGroupId,
    guildId,
    announcementChannelId,
    message: {
      text:
`╭━━━〔 🎰 𝑳𝑶𝑻𝑻𝑬𝑹𝒀 𝑫𝑹𝑨𝑾 🏆 〕━━━╮
┃ ✦ The winning tickets have been drawn...
┃
${winnerLines.join("\n")}
┃
┣━━━━━━━━━━━━━━━━━━━━
┃ 💰 Prizes paid   › $${LOTTERY_PRIZES.reduce((sum, amount) => sum + amount, 0).toLocaleString()}
┃ 🎫 Entries       › ${totalTickets}
┣━━━━━━━━━━━━━━━━━━━━
┃ 🎉 𝗖𝗢𝗡𝗚𝗥𝗔𝗧𝗨𝗟𝗔𝗧𝗜𝗢𝗡𝗦!
┃ A new lottery has started!
╰━━━━━━━━━━━━━━━━━━━━╯`,
      mentions,
      discordEmbed: {
        title: "🎟️ Lottery Results",
        description: awarded
          .map((winner) => {
            const discordId = lotteryTicketDiscordId(winner);
            const name = discordId ? "<@" + discordId + ">" : lotteryWinnerLabel(winner);
            return name + " — $" + winner.amount.toLocaleString();
          })
          .join("\n"),
        color: "#FFD166",
        footer: { text: "✦ AIDORU • AKIRA" },
      },
    },
  };
}

export async function queueLotteryAnnouncement({ db, result, sourcePlatform, whatsappGroupId = null }) {
  if (!db || !result?.ok || !Array.isArray(result.winners)) return null;
  const source = sourcePlatform === "whatsapp" ? "whatsapp" : "discord";
  const suppliedGroup = String(whatsappGroupId || "");
  const requestedGroup = suppliedGroup.endsWith("@g.us") ? suppliedGroup : String(result.whatsappGroupId || "");
  const targetGroup = requestedGroup.endsWith("@g.us") ? requestedGroup : null;
  const winners = result.winners.map((winner) => {
    const identity = lotteryWinnerIdentity(winner);
    const rawId = String(winner.userId || "");
    const discordId = lotteryTicketDiscordId(winner) || null;
    const phone = identity.endsWith("@s.whatsapp.net") ? identity.split("@")[0] : null;
    return {
      userId: rawId,
      name: lotteryDisplayName(winner),
      amount: Number(winner.amount || 0),
      discordId,
      phone,
    };
  });
  const whatsappMentions = result.winners
    .map((winner) => lotteryWinnerIdentity(winner))
    .filter((identity) => identity.endsWith("@s.whatsapp.net"));
  const event = {
    _id: randomUUID(),
    type: "lottery_draw",
    sourcePlatform: source,
    createdAt: new Date(),
    whatsappGroupId: targetGroup,
    payload: {
      text: String(result.message?.text || ""),
      mentions: whatsappMentions,
      totalTickets: Number(result.totalTickets || 0),
      prize: Number(result.prize || 0),
      winners,
    },
    deliveries: {
      whatsapp: source === "whatsapp"
        ? { status: "sent", sentAt: new Date() }
        : targetGroup ? { status: "pending", attempts: 0 } : { status: "skipped", reason: "No WhatsApp group is recorded for this round." },
      discord: source === "discord"
        ? { status: "sent", sentAt: new Date() }
        : { status: "pending", attempts: 0 },
    },
  };
  try {
    await db.collection("lottery_announcements").insertOne(event);
    return event._id;
  } catch (error) {
    console.error("[lottery] Could not queue cross-platform results:", error?.message || error);
    return null;
  }
}
