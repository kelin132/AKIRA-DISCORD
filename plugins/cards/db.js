/**
 * KELIN MD — Cards system database helpers
 * Collections: mn_users, mn_cards, mn_card_market, mn_spawn_settings
 */
import { getDb } from "../../lib/mongo.mjs";
import { BSON } from "mongodb";
import { normalizeJid, economyAccountId } from "../../lib/identity.mjs";
import { accountIdentityValues, collectionOwnershipQuery } from "../../lib/collectionIdentity.mjs";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function uid(sender) {
  const raw = String(sender ?? "");
  return raw.startsWith("discord:") ? raw : raw.split("@")[0].split(":")[0];
}

export function tag(jid) {
  return `@${uid(jid)}`;
}

export function fmt(n) {
  return Number(n || 0).toLocaleString();
}

// ── Collections ───────────────────────────────────────────────────────────────
// Each method is async — always await the call before chaining .find()/.insertOne() etc.
// Usage: const col = await Col.users();  await col.findOne(...)

export const Col = {
  users:  async () => (await getDb()).collection("mn_users"),
  cards:  async () => (await getDb()).collection("mn_cards"),
  market: async () => (await getDb()).collection("mn_card_market"),
  spawns: async () => (await getDb()).collection("mn_spawn_settings"),
};

// ── User helpers ──────────────────────────────────────────────────────────────

/**
 * Find or create a user. Returns the document with a save() method attached.
 */
export async function findOrCreateUser(sender) {
  const existing = await getUser(sender);
  if (existing) return existing;
  const col    = await Col.users();
  const normalized = normalizeJid(await economyAccountId(sender));
  const userId = normalized.endsWith("@lid") ? normalized : uid(normalized);
  const user = await col.findOneAndUpdate({ userId }, {
    $setOnInsert: {
      userId,
      whatsappNumber: normalized,
      balance:    0,
      cards:      [],
      cardLimit:  Infinity,
      totalCards: 0,
      username:   null,
      createdAt:  new Date(),
    },
  }, { upsert: true, returnDocument: "after", includeResultMetadata: false });
  return attachCardSave([user]);
}

/**
 * Find a user without creating one. Returns null if not found.
 */
export async function getUser(sender) {
  const col    = await Col.users();
  const values = await accountIdentityValues(sender);
  const records = (await col.find(collectionOwnershipQuery(values,
    ["_id", "userId", "jid", "owner"],
  )).toArray()).filter(record => record.userId !== "discord");
  // Older uid() stripped every standalone account to literal "discord".
  // That potentially mixed document cannot safely be assigned to any player.
  if (!records.length) return null;
  records.sort((a, b) => (b.cards?.length || 0) - (a.cards?.length || 0)
    || String(a._id).localeCompare(String(b._id)));
  return attachCardSave(records);
}

function attachCardSave(records) {
  const primary = records[0];
  const sources = new WeakMap();
  const originals = new Map();
  const pendingSources = new WeakMap();
  const pendingOriginals = new Map();
  const pendingCards = records.flatMap(record => {
    const pending = Array.isArray(record.pendingCards) ? record.pendingCards : [];
    pendingOriginals.set(record, BSON.deserialize(BSON.serialize({ pending })).pending);
    for (const card of pending) if (card && typeof card === "object") pendingSources.set(card, record);
    return pending;
  });
  const cards = records.flatMap(record => {
    const owned = Array.isArray(record.cards) ? record.cards : [];
    originals.set(record, BSON.deserialize(BSON.serialize({ cards: owned })).cards);
    for (const card of owned) if (card && typeof card === "object") sources.set(card, record);
    return owned;
  });
  const user = { ...primary, cards, pendingCards, totalCards: cards.length };
  user.markModified = () => {};
  user.save = async () => {
    const { _id, save, markModified, cards: currentCards, pendingCards: currentPending, totalCards, ...data } = user;
    const grouped = new Map(records.map(record => [record, []]));
    const groupedPending = new Map(records.map(record => [record, []]));
    for (const card of currentPending) {
      const source = card && typeof card === "object" ? pendingSources.get(card) : null;
      groupedPending.get(source || primary).push(card);
    }
    for (const card of currentCards) {
      const source = card && typeof card === "object" ? sources.get(card) : null;
      grouped.get(source || primary).push(card);
    }
    const col = await Col.users();
    for (const record of records) {
      const owned = grouped.get(record);
      const pending = groupedPending.get(record);
      const result = await col.updateOne({
        _id: record._id, ...(Array.isArray(record.cards) ? { cards: originals.get(record) } : {}),
        ...(Array.isArray(record.pendingCards) ? { pendingCards: pendingOriginals.get(record) } : {}),
      }, { $set: { ...(record === primary ? data : {}), cards: owned, pendingCards: pending, totalCards: owned.length } });
      if (result.matchedCount === 0) throw new Error("Your collection changed. Reload it and retry.");
      originals.set(record, BSON.deserialize(BSON.serialize({ cards: owned })).cards);
      record.cards = owned;
      pendingOriginals.set(record, BSON.deserialize(BSON.serialize({ pending })).pending);
      record.pendingCards = pending;
      for (const card of pending) if (card && typeof card === "object") pendingSources.set(card, record);
      for (const card of owned) if (card && typeof card === "object") sources.set(card, record);
    }
    user.totalCards = currentCards.length;
  };
  return user;
}

// ── Spawn settings (used by cardspawn.js + autoSpawn.js) ─────────────────────

export async function isSpawnEnabled(chatId) {
  const col = await Col.spawns();
  const doc = await col.findOne({ chatId });
  return doc?.enabled === true;
}

export async function setSpawnEnabled(chatId, enabled) {
  const col = await Col.spawns();
  await col.updateOne(
    { chatId },
    { $set: { chatId, enabled } },
    { upsert: true }
  );
}

export async function getEnabledSpawnChats() {
  const col  = await Col.spawns();
  const docs = await col.find({ enabled: true }).toArray();
  return docs.map(d => d.chatId);
}

export async function isDiscordSpawnEnabled(guildId) {
  const col = await Col.spawns();
  const doc = await col.findOne({ platform: "discord", guildId: String(guildId) });
  return doc?.enabled === true;
}

export async function setDiscordSpawnEnabled(guildId, channelId, enabled) {
  const col = await Col.spawns();
  const normalizedGuildId = String(guildId);
  await col.updateOne(
    { platform: "discord", guildId: normalizedGuildId },
    {
      $set: {
        platform: "discord",
        guildId: normalizedGuildId,
        channelId: String(channelId),
        enabled: Boolean(enabled),
      },
    },
    { upsert: true },
  );
}

export async function getEnabledDiscordSpawnChannels() {
  const col = await Col.spawns();
  const docs = await col.find({
    platform: "discord",
    enabled: true,
    channelId: { $exists: true, $ne: null },
  }).toArray();
  return docs.map((doc) => String(doc.channelId));
}
