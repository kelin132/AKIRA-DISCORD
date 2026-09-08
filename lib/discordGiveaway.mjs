import { randomInt, randomUUID } from "crypto";
import { getDb } from "./mongo.mjs";
import { discordAccountKey } from "./identity.mjs";
import { log } from "./logger.mjs";

export const DISCORD_GIVEAWAY_EMOJI = "🎉";
const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TIMER_DELAY = 2_147_000_000;

const timers = new Map();
const finalizing = new Set();
let indexesPromise = null;

function giveaways() {
  return getDb().collection("discord_giveaways");
}

async function ensureIndexes() {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      giveaways().createIndex(
        { messageId: 1 },
        { unique: true, name: "discord_giveaway_message" },
      ),
      giveaways().createIndex(
        { status: 1, endsAt: 1 },
        { name: "discord_giveaway_due" },
      ),
    ]).catch((error) => {
      indexesPromise = null;
      throw error;
    });
  }
  return indexesPromise;
}

export function parseDiscordGiveawayDuration(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;

  const compactNumber = raw.match(/^(\d+)$/);
  if (compactNumber) {
    const minutes = Number(compactNumber[1]);
    const duration = minutes * 60_000;
    return duration > 0 && duration <= MAX_DURATION_MS ? duration : null;
  }

  const matches = [
    ...raw.matchAll(
      /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)/g,
    ),
  ];
  if (!matches.length) return null;

  const consumed = matches.map((match) => match[0]).join("").replace(/\s+/g, "");
  if (consumed !== raw.replace(/\s+/g, "")) return null;

  const multipliers = {
    s: 1_000,
    sec: 1_000,
    secs: 1_000,
    second: 1_000,
    seconds: 1_000,
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    w: 604_800_000,
    week: 604_800_000,
    weeks: 604_800_000,
  };
  const duration = matches.reduce(
    (total, match) => total + Number(match[1]) * multipliers[match[2]],
    0,
  );
  return duration > 0 && duration <= MAX_DURATION_MS ? duration : null;
}

export function formatDiscordGiveawayDuration(durationMs) {
  let remaining = Math.max(0, Number(durationMs));
  const parts = [];
  const units = [
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];

  for (const [label, size] of units) {
    const amount = Math.floor(remaining / size);
    if (!amount) continue;
    remaining -= amount * size;
    parts.push(`${amount} ${label}${amount === 1 ? "" : "s"}`);
  }
  return parts.join(" ") || "0 seconds";
}

function giveawayContent({ prize, durationMs }) {
  return [
    "🎁 **GIVEAWAY**",
    "",
    `🎉 **Prize:** ${prize}`,
    `⏳ **Ends in:** ${formatDiscordGiveawayDuration(durationMs)}`,
    `🗳️ React with ${DISCORD_GIVEAWAY_EMOJI} to enter!`,
    "",
    "_One reaction per person. The winner is selected automatically when the timer ends._",
  ].join("\n");
}

function scheduleGiveaway(giveaway, client) {
  const id = String(giveaway._id);
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);

  const remaining = Math.max(0, new Date(giveaway.endsAt).getTime() - Date.now());
  const delay = Math.min(remaining, MAX_TIMER_DELAY);
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    if (remaining > delay) scheduleGiveaway(giveaway, client);
    else void finalizeDiscordGiveaway(giveaway._id, client);
  }, delay));
}

function cancelTimer(id) {
  const timer = timers.get(String(id));
  if (timer) clearTimeout(timer);
  timers.delete(String(id));
}

async function getWinnerName(userId) {
  const user = await getDb().collection("users").findOne(
    { _id: discordAccountKey(userId) },
    { projection: { name: 1 } },
  );
  return String(user?.name || "").trim();
}

export async function createDiscordGiveaway({ message, creatorId, prize, durationMs }) {
  if (!message?.guild || !message.channel?.send) {
    throw new Error("Giveaways can only be created inside a Discord server.");
  }

  await ensureIndexes();
  const giveawayMessage = await message.channel.send({
    content: giveawayContent({ prize, durationMs }),
  });
  const endsAt = new Date(Date.now() + durationMs);
  const giveaway = {
    _id: randomUUID(),
    guildId: message.guild.id,
    channelId: message.channelId,
    messageId: giveawayMessage.id,
    creatorId,
    prize,
    emoji: DISCORD_GIVEAWAY_EMOJI,
    participants: [],
    status: "active",
    endsAt,
    createdAt: new Date(),
  };

  await giveaways().insertOne(giveaway);
  scheduleGiveaway(giveaway, message.client);

  try {
    await giveawayMessage.react(DISCORD_GIVEAWAY_EMOJI);
  } catch (error) {
    log("warn", `Discord giveaway reaction could not be added: ${error.message}`);
  }

  return giveaway;
}

async function findActiveGiveaway(reaction) {
  if (!reaction?.message?.id) return null;
  await ensureIndexes();
  return giveaways().findOne({
    messageId: reaction.message.id,
    status: "active",
    emoji: DISCORD_GIVEAWAY_EMOJI,
  });
}

async function fetchPartialReaction(reaction) {
  if (!reaction?.partial) return reaction;
  try {
    return await reaction.fetch();
  } catch {
    return null;
  }
}

export async function handleDiscordGiveawayReaction(reaction, user, action) {
  if (!user || user.bot) return;

  const hydratedReaction = await fetchPartialReaction(reaction);
  if (!hydratedReaction) return;

  try {
    const giveaway = await findActiveGiveaway(hydratedReaction);
    if (!giveaway || hydratedReaction.emoji.name !== giveaway.emoji) return;

    const update = action === "add"
      ? { $addToSet: { participants: user.id } }
      : { $pull: { participants: user.id } };
    await giveaways().updateOne(
      { _id: giveaway._id, status: "active" },
      update,
    );
  } catch (error) {
    log("warn", `Discord giveaway reaction handling failed: ${error.message}`);
  }
}

export async function finalizeDiscordGiveaway(giveawayId, client) {
  const id = String(giveawayId);
  if (finalizing.has(id)) return;
  finalizing.add(id);

  try {
    const claim = await giveaways().updateOne(
      { _id: id, status: "active" },
      { $set: { status: "drawing", drawnAt: new Date() } },
    );
    if (claim.matchedCount !== 1) return;

    const giveaway = await giveaways().findOne({ _id: id });
    if (!giveaway) return;
    cancelTimer(id);

    const participants = [...new Set(giveaway.participants || [])];
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel?.send) {
      throw new Error(`Giveaway channel ${giveaway.channelId} is unavailable`);
    }

    if (!participants.length) {
      await giveaways().updateOne(
        { _id: id },
        {
          $set: {
            status: "completed",
            winnerId: null,
            winnerName: null,
            participantCount: 0,
            completedAt: new Date(),
          },
        },
      );
      await channel.send({
        content: [
          "🎊 **GIVEAWAY ENDED**",
          "",
          `🎁 **Prize:** ${giveaway.prize}`,
          "😔 Nobody entered this giveaway.",
        ].join("\n"),
      });
      return;
    }

    const winnerId = participants[randomInt(participants.length)];
    const winnerName = await getWinnerName(winnerId).catch(() => "");
    await giveaways().updateOne(
      { _id: id },
      {
        $set: {
          status: "completed",
          winnerId,
          winnerName: winnerName || null,
          participantCount: participants.length,
          completedAt: new Date(),
        },
      },
    );

    const displayName = winnerName ? `**${winnerName}** (<@${winnerId}>)` : `<@${winnerId}>`;
    await channel.send({
      content: [
        "🎊 **GIVEAWAY ENDED**",
        "",
        `🎁 **Prize:** ${giveaway.prize}`,
        `🏆 **Winner:** ${displayName}`,
        "",
        "Congratulations!",
      ].join("\n"),
      allowedMentions: { users: [winnerId] },
    });
  } catch (error) {
    log("error", `Discord giveaway ${id} finalization failed: ${error.message}`);
    await giveaways().updateOne(
      { _id: id, status: "drawing" },
      { $set: { status: "active" } },
    ).catch(() => {});
  } finally {
    finalizing.delete(id);
  }
}

export async function restoreDiscordGiveaways(client) {
  await ensureIndexes();
  const due = await giveaways().find({
    status: "active",
    endsAt: { $lte: new Date() },
  }).toArray();
  for (const giveaway of due) {
    await finalizeDiscordGiveaway(giveaway._id, client);
  }

  const active = await giveaways().find({
    status: "active",
    endsAt: { $gt: new Date() },
  }).toArray();
  for (const giveaway of active) {
    scheduleGiveaway(giveaway, client);
  }
}

export async function startDiscordGiveawayService(client) {
  client.on("messageReactionAdd", (reaction, user) => {
    void handleDiscordGiveawayReaction(reaction, user, "add");
  });
  client.on("messageReactionRemove", (reaction, user) => {
    void handleDiscordGiveawayReaction(reaction, user, "remove");
  });
  await restoreDiscordGiveaways(client);
}