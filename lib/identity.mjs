/**
 * Shared Mongo identity helpers.
 *
 * Kelin-MD2 uses the WhatsApp JID as users._id. Discord uses a namespaced
 * string key and a discordId field so both bots can safely share collections
 * without colliding with one another.
 */
import { getDb } from "./mongo.mjs";
import { resolveAccountIdentity } from "./accountIdentity.mjs";

export function normalizeJid(value = "") {
  const raw = String(value).trim();
  if (raw.startsWith("discord:")) return raw;
  if (!raw.includes("@")) return /^\+?\d{7,15}$/.test(raw) ? `${raw.replace(/^\+/, "")}@s.whatsapp.net` : raw;
  return raw.replace(/:\d+@/, "@").replace(/@c\.us$/i, "@s.whatsapp.net");
}

export async function findUserByIdentity(id, options = {}) {
  const db = getDb();
  const { accountId } = await resolveAccountIdentity(db, normalizeJid(id), null, { includeAccount: false });
  return db.collection("users").findOne({ _id: accountId }, options);
}

export async function economyAccountId(id) {
  return (await resolveAccountIdentity(getDb(), normalizeJid(id), null, { includeAccount: false })).accountId;
}

export function normalizePlatformId(value) {
  return String(value ?? "").trim();
}

export function discordAccountKey(discordId) {
  return `discord:${normalizePlatformId(discordId).replace(/^discord:/, "")}`;
}

export function identityQuery(id, isDiscord = false) {
  const normalized = isDiscord ? normalizePlatformId(id).replace(/^discord:/, "") : normalizePlatformId(id);
  if (!isDiscord) return { _id: normalized };

  return {
    $or: [
      { discordId: normalized },
      { _id: discordAccountKey(normalized) },
    ],
  };
}

export function identityInsertFields(id, isDiscord = false) {
  const normalized = isDiscord ? normalizePlatformId(id).replace(/^discord:/, "") : normalizePlatformId(id);
  return isDiscord
    ? { _id: discordAccountKey(normalized), discordId: normalized }
    : { _id: normalized };
}
