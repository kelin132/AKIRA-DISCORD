import {
  buildDiscordCardSpawnPayload,
  createSpawnId,
  pickRandomCard,
} from "./cardApi.mjs";
import { getEnabledDiscordSpawnChannels } from "../plugins/cards/db.js";
import { fetchRandom, getImageMessage } from "./pokemon/api.mjs";
import { getMovesForType, randomWildLevel } from "./pokemon/gameLogic.mjs";
import { getRepel } from "./pokemon/itemState.mjs";
import { getWild, setWild } from "./pokemon/wildState.mjs";
import { getDb } from "./mongo.mjs";
import { findSpawnRole } from "./discordSpawnRoles.mjs";

const CARD_MIN_MS = 20 * 60 * 1000;
const CARD_MAX_MS = 25 * 60 * 1000;
const POKE_MIN_MS = 15 * 60 * 1000;
const POKE_MAX_MS = 20 * 60 * 1000;
const POKE_COLLECTION = "pokemon_autospawn_chats";
const LOTTERY_ANNOUNCEMENT_COLLECTION = "lottery_announcements";
const CARD_EXPIRE_MS = 10 * 60 * 1000;
const PREFIX = process.env.PREFIX || ".";

const TYPE_EMOJIS = {
  fire: "🔥", water: "💧", grass: "🍃", electric: "⚡", psychic: "🔮", normal: "⭐",
  flying: "🌤️", bug: "🐛", poison: "☠️", rock: "🪨", ground: "🌍", ice: "❄️",
  fighting: "🥊", ghost: "👻", dragon: "🐉", dark: "🌑", steel: "⚙️", fairy: "🌸",
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

async function getEnabledPokeChannels() {
  const db = await getDb();
  const docs = await db.collection(POKE_COLLECTION).find({
    platform: "discord",
    enabled: true,
    channelId: { $exists: true, $ne: null },
  }).toArray();
  return docs.map((doc) => String(doc.channelId));
}

async function getDiscordChannel(client, channelId) {
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel?.guild || !channel.isTextBased?.() || typeof channel.send !== "function") return null;
  return channel;
}

function discordFile(media, name) {
  if (!media) return null;
  if (Buffer.isBuffer(media) || media instanceof Uint8Array) {
    return { attachment: Buffer.from(media), name };
  }
  if (media.url) return { attachment: media.url, name };
  return null;
}

async function sendDiscordCard(channel, card, spawnId) {
  const role = findSpawnRole(channel.guild, "card");
  const roleMention = role ? `<@&${role.id}>` : "";
  const payload = await buildDiscordCardSpawnPayload(card, spawnId, PREFIX);
  if (roleMention) {
    payload.content = roleMention;
    payload.allowedMentions = { roles: [role.id] };
  }

  return channel.send(payload);
}

async function spawnCard(channel) {
  const spawns = global.activeSpawns || (global.activeSpawns = {});
  if (spawns[channel.id]) return false;

  let card;
  try {
    card = await pickRandomCard();
  } catch (error) {
    console.error(`[discord cardspawn] Card API failed:`, error.message);
    return false;
  }
  if (!card) return false;
  const spawnId = createSpawnId();
  spawns[channel.id] = { cardId: card.cardId, spawnId, card };

  try {
    await sendDiscordCard(channel, card, spawnId);
    setTimeout(() => {
      if (spawns[channel.id]?.spawnId !== spawnId) return;
      delete spawns[channel.id];
      channel.send(`⏰ **${card.name}** was not claimed in time and vanished.`).catch(() => {});
    }, CARD_EXPIRE_MS).unref?.();
    return true;
  } catch (error) {
    delete spawns[channel.id];
    console.error(`[discord cardspawn] Failed in ${channel.id}:`, error.message);
    return false;
  }
}

async function runCardCycle(client) {
  const channels = await getEnabledDiscordSpawnChannels();
  for (const channelId of channels) {
    const channel = await getDiscordChannel(client, channelId);
    if (channel) await spawnCard(channel);
  }
}

async function spawnPokemon(channel) {
  if (getWild(channel.id) || getRepel(channel.id)) return false;

  let apiData;
  try {
    apiData = await fetchRandom();
  } catch (error) {
    console.error(`[discord pokespawn] Pokémon API failed:`, error.message);
    return false;
  }

  const level = randomWildLevel();
  const maxHp = Math.max(10, Math.floor(apiData.baseHp * (1 + level * 0.05)));
  const wildPokemon = {
    pokedexId: apiData.pokedexId,
    name: apiData.name,
    displayName: apiData.displayName,
    types: apiData.types,
    primaryType: apiData.primaryType,
    level,
    hp: maxHp,
    maxHp,
    attack: Math.max(5, Math.floor(apiData.baseAttack * (1 + level * 0.05))),
    defense: Math.max(5, Math.floor(apiData.baseDefense * (1 + level * 0.05))),
    speed: Math.max(5, Math.floor(apiData.baseSpeed * (1 + level * 0.05))),
    imageUrl: apiData.imageUrl,
    moves: getMovesForType(apiData.primaryType, apiData.types),
  };

  setWild(channel.id, wildPokemon, null, (name) => {
    channel.send(`🌿 **${name}** got tired of waiting and fled away!`).catch(() => {});
  });

  const typeText = apiData.types.map((type) => `${TYPE_EMOJIS[type] || ""}${type}`).join(" / ");
  const role = findSpawnRole(channel.guild, "pokemon");
  const roleMention = role ? `<@&${role.id}>` : "";
  const embed = {
    title: "🌿 𝐖𝐈𝐋𝐃 𝐏𝐎𝐊É𝐌𝐎𝐍 𝐀𝐏𝐏𝐄𝐀𝐑𝐄𝐃",
    description: "A wild Pokémon appeared in AIDORU!",
    color: 0xFF4FA3,
    fields: [
      { name: "🐾 Name", value: String(wildPokemon.displayName), inline: false },
      { name: "🏷️ Type", value: typeText || "Unknown", inline: true },
      { name: "📊 Level", value: String(level), inline: true },
      { name: "❤️ HP", value: `${maxHp}/${maxHp}`, inline: true },
    ],
    footer: {
      text: `Use ${PREFIX}catch to battle • Flees in 30 minutes`,
    },
  };
  const payload = { embeds: [embed] };
  if (roleMention) {
    payload.content = roleMention;
    payload.allowedMentions = { roles: [role.id] };
  }

  try {
    const media = await getImageMessage(apiData);
    const file = discordFile(media?.image, "pokemon.png");
    if (file) {
      embed.image = { url: "attachment://pokemon.png" };
      payload.files = [file];
    }
    await channel.send(payload);
  } catch (error) {
    console.error(`[discord pokespawn] Failed in ${channel.id}:`, error.message);
    delete embed.image;
    delete payload.files;
    channel.send(payload).catch(() => {});
  }
  return true;
}

export async function spawnDiscordCardNow(client, channelId) {
  const channel = await getDiscordChannel(client, channelId);
  if (!channel) return false;
  return await spawnCard(channel);
}

export async function spawnDiscordPokemonNow(client, channelId) {
  const channel = await getDiscordChannel(client, channelId);
  if (!channel) return false;
  return await spawnPokemon(channel);
}

async function runPokemonCycle(client) {
  const channels = await getEnabledPokeChannels();
  for (const channelId of channels) {
    const channel = await getDiscordChannel(client, channelId);
    if (channel) await spawnPokemon(channel);
  }
}

function lotteryAnnouncementPayload(event) {
  const winners = Array.isArray(event.winners) ? event.winners : [];
  const winnerLines = winners
    .map((winner, index) => {
      const medal = ["🥇", "🥈", "🥉"][index] || "🏆";
      return `${medal} ${String(winner.name || "Lottery player")} — $${Number(winner.prize || 0).toLocaleString()}`;
    })
    .join("\n");

  return {
    embeds: [{
      title: "🎟️ Global Lottery Draw",
      description: `The winning tickets have been drawn!\n\n${winnerLines || "No winners recorded."}`,
      color: 0xFFD166,
      fields: [
        {
          name: "💰 Prizes paid",
          value: `$${Number(event.prize || 0).toLocaleString()}`,
          inline: true,
        },
        {
          name: "🎫 Entries",
          value: String(Number(event.totalEntries || 0)),
          inline: true,
        },
      ],
      footer: { text: "🎉 Congratulations! A new global lottery has started." },
    }],
  };
}

async function runLotteryAnnouncementCycle(client) {
  const db = await getDb();
  const [pending, settings] = await Promise.all([
    db.collection(LOTTERY_ANNOUNCEMENT_COLLECTION)
      .find({ deliveredAt: { $exists: false } })
      .sort({ createdAt: 1 })
      .limit(20)
      .toArray(),
    db.collection("lottery_settings")
      .find({ announcementChannelId: { $exists: true, $ne: null } })
      .toArray(),
  ]);

  if (!pending.length || !settings.length) return;

  for (const event of pending) {
    const delivered = new Set((event.announcedChannelIds || []).map(String));
    for (const setting of settings) {
      const channelId = String(setting.announcementChannelId);
      if (delivered.has(channelId)) continue;

      const channel = await getDiscordChannel(client, channelId);
      if (!channel) continue;

      try {
        await channel.send(lotteryAnnouncementPayload(event));
        delivered.add(channelId);
        await db.collection(LOTTERY_ANNOUNCEMENT_COLLECTION).updateOne(
          { _id: event._id },
          { $addToSet: { announcedChannelIds: channelId } },
        );
      } catch (error) {
        console.error(`[discord lottery] Failed in ${channelId}:`, error.message);
      }
    }

    if (settings.every((setting) => delivered.has(String(setting.announcementChannelId)))) {
      await db.collection(LOTTERY_ANNOUNCEMENT_COLLECTION).updateOne(
        { _id: event._id },
        { $set: { deliveredAt: new Date() } },
      );
    }
  }
}

function schedule(label, callback, min, max) {
  const timer = setTimeout(async () => {
    try {
      await callback();
    } catch (error) {
      console.error(`[discord ${label}] cycle failed:`, error.message);
    } finally {
      schedule(label, callback, min, max);
    }
  }, randomBetween(min, max));
  timer.unref?.();
  console.log(`[discord ${label}] next cycle scheduled`);
}

export function startDiscordSpawners(client) {
  if (global.__discordSpawnersStarted) return;
  global.__discordSpawnersStarted = true;
  runCardCycle(client).catch((error) => {
    console.error("[discord cardspawn] Initial cycle failed:", error.message);
  });
  runPokemonCycle(client).catch((error) => {
    console.error("[discord pokespawn] Initial cycle failed:", error.message);
  });
  runLotteryAnnouncementCycle(client).catch((error) => {
    console.error("[discord lottery] Initial announcement check failed:", error.message);
  });
  const lotteryTimer = setInterval(() => {
    runLotteryAnnouncementCycle(client).catch((error) => {
      console.error("[discord lottery] Announcement check failed:", error.message);
    });
  }, 15_000);
  lotteryTimer.unref?.();
  schedule("cardspawn", () => runCardCycle(client), CARD_MIN_MS, CARD_MAX_MS);
  schedule("pokespawn", () => runPokemonCycle(client), POKE_MIN_MS, POKE_MAX_MS);
}