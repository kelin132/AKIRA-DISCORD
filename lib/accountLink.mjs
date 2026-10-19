import { createHash, randomInt } from "crypto";
import { getDb } from "./mongo.mjs";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_LINK_CACHE_TTL_MS = 30_000;
const accountLinkCache = new Map();

function normalize(value) {
  return String(value || "").trim();
}

function normalizeWhatsAppId(value) {
  const normalized = normalize(value);
  if (!normalized.includes("@")) {
    return /^\+?\d{7,15}$/.test(normalized)
      ? `${normalized.replace(/^\+/, "")}@s.whatsapp.net`
      : normalized;
  }
  const [number, server] = normalized.split("@");
  const normalizedServer = String(server || "s.whatsapp.net").toLowerCase() === "c.us"
    ? "s.whatsapp.net"
    : server || "s.whatsapp.net";
  return `${number.split(":")[0]}@${normalizedServer}`;
}

function whatsappIdentityVariants(value) {
  const normalized = normalizeWhatsAppId(value);
  if (!normalized) return [];
  const [local = "", server = "s.whatsapp.net"] = normalized.split("@");
  const digits = local.replace(/\D/g, "");
  return [...new Set([
    String(value || "").trim(),
    normalized,
    digits,
    digits ? `${digits}@${server}` : "",
    digits && server === "s.whatsapp.net" ? `${digits}@c.us` : "",
    digits && server === "s.whatsapp.net" ? `${digits}:0@s.whatsapp.net` : "",
  ].filter(Boolean))];
}

function canonicalWhatsAppId(value) {
  return normalizeWhatsAppId(value);
}

function hashCode(code) {
  return createHash("sha256").update(normalize(code).toUpperCase()).digest("hex");
}

function makeCode(length = 8) {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export async function createWhatsAppLinkCode(whatsappId) {
  const normalizedWhatsAppId = normalizeWhatsAppId(whatsappId);
  if (!normalizedWhatsAppId) throw new Error("WhatsApp identity is required");

  const db = await getDb();
  const now = Date.now();
  const code = makeCode();

  await db.collection("account_links").deleteMany({
    whatsappId: { $in: whatsappIdentityVariants(normalizedWhatsAppId) },
    status: "pending",
  });
  await db.collection("account_links").insertOne({
    whatsappId: normalizedWhatsAppId,
    codeHash: hashCode(code),
    status: "pending",
    createdAt: now,
    expiresAt: now + LINK_TTL_MS,
  });

  return { code, expiresAt: now + LINK_TTL_MS };
}

export async function claimWhatsAppLink(code, discordId) {
  const normalizedDiscordId = normalize(discordId);
  const normalizedCode = normalize(code);
  if (!normalizedDiscordId || !normalizedCode) return null;

  const db = await getDb();
  const now = Date.now();
  const record = await db.collection("account_links").findOneAndUpdate(
    {
      codeHash: hashCode(normalizedCode),
      status: "pending",
      expiresAt: { $gt: now },
    },
    {
      $set: {
        discordId: normalizedDiscordId,
        status: "active",
        linkedAt: now,
      },
    },
    { returnDocument: "after", includeResultMetadata: false },
  );

  if (!record) return null;
  accountLinkCache.delete(normalizedDiscordId);

  await db.collection("account_links").updateMany(
    {
      discordId: normalizedDiscordId,
      status: "active",
      _id: { $ne: record._id },
    },
    { $set: { status: "revoked", revokedAt: now } },
  );
  await db.collection("account_links").updateMany(
    {
      whatsappId: { $in: whatsappIdentityVariants(record.whatsappId) },
      status: "active",
      _id: { $ne: record._id },
    },
    { $set: { status: "revoked", revokedAt: now } },
  );

  return {
    whatsappId: record.whatsappId,
    discordId: normalizedDiscordId,
  };
}

export async function resolveDiscordAccount(discordId) {
  const normalizedDiscordId = normalize(discordId);
  if (!normalizedDiscordId) return null;

  const cached = accountLinkCache.get(normalizedDiscordId);
  if (cached?.whatsappId === null && Date.now() - cached.createdAt < ACCOUNT_LINK_CACHE_TTL_MS) {
    return null;
  }

  const db = await getDb();
  const records = await db.collection("account_links").find({
    discordId: normalizedDiscordId,
    status: "active",
  }).toArray();
  const whatsappIds = new Set(records.map(record => canonicalWhatsAppId(record.whatsappId)).filter(Boolean));
  let whatsappId = null;
  if (whatsappIds.size === 1) {
    const candidate = [...whatsappIds][0];
    const reverseLinks = await db.collection("account_links").find({
      whatsappId: { $in: whatsappIdentityVariants(candidate) },
      status: "active",
    }).toArray();
    const linkedDiscordIds = new Set(reverseLinks.map(record => String(record.discordId || "" )).filter(Boolean));
    if (linkedDiscordIds.size === 1 && linkedDiscordIds.has(normalizedDiscordId)) {
      whatsappId = candidate;
    }
  }
  accountLinkCache.set(normalizedDiscordId, { createdAt: Date.now(), whatsappId });
  return whatsappId;
}

export async function resolveWhatsAppAccount(whatsappId) {
  const normalizedWhatsAppId = normalizeWhatsAppId(whatsappId);
  if (!normalizedWhatsAppId) return null;

  const db = await getDb();
  const records = await db.collection("account_links").find({
    whatsappId: { $in: whatsappIdentityVariants(normalizedWhatsAppId) },
    status: "active",
  }).toArray();
  const discordIds = new Set(records.map(record => String(record.discordId || "")).filter(Boolean));
  const whatsappIds = new Set(records.map(record => canonicalWhatsAppId(record.whatsappId)));
  return discordIds.size === 1
    && whatsappIds.size === 1
    && whatsappIds.has(canonicalWhatsAppId(normalizedWhatsAppId))
    ? [...discordIds][0]
    : null;
}

export async function unlinkDiscordAccount(discordId) {
  const normalizedDiscordId = normalize(discordId);
  if (!normalizedDiscordId) return false;

  const db = await getDb();
  const result = await db.collection("account_links").updateMany(
    { discordId: normalizedDiscordId, status: "active" },
    { $set: { status: "revoked", revokedAt: Date.now() } },
  );
  accountLinkCache.delete(normalizedDiscordId);
  return result.modifiedCount > 0;
}