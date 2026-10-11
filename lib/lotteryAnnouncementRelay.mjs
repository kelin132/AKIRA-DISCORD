import { randomUUID } from "node:crypto";
import { EmbedBuilder } from "discord.js";
import { getDb } from "./mongo.mjs";
import {
  formatLotteryAnnouncementWinner,
  getLotteryAnnouncementDetails,
} from "./lotteryAnnouncementFormat.mjs";

const POLL_MS = 2_000;
const STALE_CLAIM_MS = 45_000;
const MAX_ATTEMPTS = 5;
let timer = null;
let activeClient = null;
let polling = false;

function winnerDescription(winners) {
  return (Array.isArray(winners) ? winners : [])
    .map(formatLotteryAnnouncementWinner)
    .join("\n") || "Lottery results are available.";
}

async function configuredChannels(db) {
  const settings = await db.collection("lottery_settings")
    .find({ announcementChannelId: { $exists: true, $ne: "" } }, { projection: { announcementChannelId: 1 } })
    .toArray();
  return [...new Set(settings.map((setting) => String(setting.announcementChannelId || "")).filter(Boolean))];
}

async function deliverOne(client) {
  if (!client || polling || (client.isReady && !client.isReady())) return;
  polling = true;
  try {
    const db = getDb();
    const channels = await configuredChannels(db);
    if (!channels.length) return;
    const collection = db.collection("lottery_announcements");
    const now = new Date();
    const claimId = randomUUID();
    const event = await collection.findOneAndUpdate(
      {
        sourcePlatform: "whatsapp",
        $or: [
          { $and: [
            { "deliveries.discord.status": "pending" },
            { $or: [
              { "deliveries.discord.nextAttemptAt": { $exists: false } },
              { "deliveries.discord.nextAttemptAt": { $lte: now } },
            ] },
          ] },
          {
            "deliveries.discord.status": "sending",
            "deliveries.discord.claimedAt": { $lt: new Date(now.getTime() - STALE_CLAIM_MS) },
          },
        ],
      },
      {
        $set: {
          "deliveries.discord.status": "sending",
          "deliveries.discord.claimId": claimId,
          "deliveries.discord.claimedAt": now,
        },
        $inc: { "deliveries.discord.attempts": 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after", includeResultMetadata: false },
    );
    if (!event) return;
    const attempts = Number(event.deliveries?.discord?.attempts || 1);
    if (attempts > MAX_ATTEMPTS) {
      await collection.updateOne(
        { _id: event._id, "deliveries.discord.claimId": claimId },
        { $set: { "deliveries.discord.status": "failed", "deliveries.discord.lastError": "Retry limit reached." }, $unset: { "deliveries.discord.claimId": "", "deliveries.discord.claimedAt": "" } },
      );
      return;
    }

    try {
      const sentTo = new Set(event.deliveries?.discord?.sentTo || []);
      const details = getLotteryAnnouncementDetails(event);
      const winners = details.winners;
      const embed = new EmbedBuilder()
        .setColor("#FFD166")
        .setTitle("🎟️ Lottery Results")
        .setDescription(winnerDescription(winners))
        .addFields(
          { name: "🎫 Entries", value: String(details.totalEntries), inline: true },
          { name: "💰 Prizes", value: "$" + details.prize.toLocaleString(), inline: true },
        )
        .setFooter({ text: "✦ AIDORU • AKIRA" });
      const mentionIds = winners.map((winner) => winner.discordId).filter(Boolean);
      let firstError = null;
      for (const channelId of channels) {
        if (sentTo.has(channelId)) continue;
        try {
          const channel = await client.channels.fetch(channelId);
          if (!channel?.isTextBased?.() || !channel.send) throw new Error("Configured channel is not text-capable.");
          await channel.send({ embeds: [embed], allowedMentions: { users: mentionIds } });
          sentTo.add(channelId);
          await collection.updateOne(
            { _id: event._id, "deliveries.discord.claimId": claimId },
            { $addToSet: { "deliveries.discord.sentTo": channelId } },
          );
        } catch (error) {
          firstError ||= error;
        }
      }
      if (firstError) throw firstError;
      await collection.updateOne(
        { _id: event._id, "deliveries.discord.claimId": claimId },
        { $set: { "deliveries.discord.status": "sent", "deliveries.discord.sentAt": new Date() }, $unset: { "deliveries.discord.claimId": "", "deliveries.discord.claimedAt": "", "deliveries.discord.nextAttemptAt": "", "deliveries.discord.lastError": "" } },
      );
    } catch (error) {
      const failed = attempts >= MAX_ATTEMPTS;
      await collection.updateOne(
        { _id: event._id, "deliveries.discord.claimId": claimId },
        {
          $set: {
            "deliveries.discord.status": failed ? "failed" : "pending",
            "deliveries.discord.lastError": String(error?.message || error).slice(0, 300),
            ...(!failed ? { "deliveries.discord.nextAttemptAt": new Date(Date.now() + attempts * 5_000) } : {}),
          },
          $unset: { "deliveries.discord.claimId": "", "deliveries.discord.claimedAt": "" },
        },
      );
      console.warn("[lottery] WhatsApp-to-Discord result delivery failed:", error?.message || error);
    }
  } catch (error) {
    console.warn("[lottery] Discord result relay poll failed:", error?.message || error);
  } finally {
    polling = false;
  }
}

export function stopLotteryAnnouncementRelay() {
  if (timer) clearInterval(timer);
  timer = null;
  activeClient = null;
}

export function startLotteryAnnouncementRelay(client) {
  stopLotteryAnnouncementRelay();
  activeClient = client;
  const poll = () => {
    if (activeClient) void deliverOne(activeClient);
  };
  timer = setInterval(poll, POLL_MS);
  timer.unref?.();
  poll();
}
