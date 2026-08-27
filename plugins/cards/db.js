/**
 * Shared card database helpers.
 * Kelin-MD2 stores card users in mn_users with userId values derived from
 * WhatsApp JIDs. AKIRA-DISCORD adds discordId while keeping that collection
 * and document shape compatible with the WhatsApp bot.
 */
import { getDb } from "../../lib/mongo.mjs";

export function uid(sender) {
  return String(sender ?? "").split("@")[0].split(":")[0];
}

export function tag(jid) {
  return `@${uid(jid)}`;
}

export function fmt(n) {
  return Number(n || 0).toLocaleString();
}

export const Col = {
  users:  async () => (await getDb()).collection("mn_users"),
  cards:  async () => (await getDb()).collection("mn_cards"),
  market: async () => (await getDb()).collection("mn_card_market"),
  spawns: async () => (await getDb()).collection("mn_spawn_settings"),
};

function queryFor(sender, isDiscord = false) {
  if (isDiscord) {
    return { $or: [{ discordId: String(sender) }, { userId: `discord:${sender}` }] };
  }
  return { userId: uid(sender) };
}

function normalizeRecord(user) {
  if (!user) return null;
  user.markModified = () => {};
  user.save = async () => {
    const c = await Col.users();
    const { _id, save, markModified, ...data } = user;
    const query = user.discordId
      ? { discordId: user.discordId }
      : { userId: user.userId };
    await c.updateOne(query, { $set: data });
  };
  return user;
}

export async function findOrCreateUser(sender, isDiscord = false) {
  const col = await Col.users();
  const query = queryFor(sender, isDiscord);
  let user = await col.findOne(query);

  if (!user) {
    user = {
      userId: isDiscord ? `discord:${sender}` : uid(sender),
      ...(isDiscord ? { discordId: String(sender) } : { whatsappNumber: sender }),
      balance: 0,
      cards: [],
      cardLimit: Infinity,
      totalCards: 0,
      username: null,
      createdAt: new Date(),
    };
    const { insertedId } = await col.insertOne(user);
    user._id = insertedId;
  }

  return normalizeRecord(user);
}

export async function getUser(sender, isDiscord = false) {
  const col = await Col.users();
  return normalizeRecord(await col.findOne(queryFor(sender, isDiscord)));
}

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
    { upsert: true },
  );
}

export async function getEnabledSpawnChats() {
  const col = await Col.spawns();
  const docs = await col.find({ enabled: true }).toArray();
  return docs.map((doc) => doc.chatId);
}
