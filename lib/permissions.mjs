import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const MODS_FILE = path.resolve("data", "discord_mods.json");

function getOwnerId(passedParam = "") {
  return passedParam || process.env.DISCORD_OWNER_ID || "";
}

export function getModsData() {
  try {
    if (existsSync(MODS_FILE)) {
      const parsed = JSON.parse(readFileSync(MODS_FILE, "utf8"));
      return Array.isArray(parsed.list) ? parsed.list : [];
    }
  } catch { /* ignore */ }
  return [];
}

export function getMods() {
  return getModsData().map(e => e.id);
}

export function saveModsData(data) {
  try {
    const dir = path.dirname(MODS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(MODS_FILE, JSON.stringify({ list: data }, null, 2));
  } catch (err) {
    console.error("[permissions] Failed to save mods:", err.message);
  }
}

export async function getPermissions(senderId, ownerId = "", { message, client } = {}) {
  const canonicalOwnerId = getOwnerId(ownerId);
  
  if (senderId === canonicalOwnerId) return _ownerPerms();

  const mods = getMods();
  const isModByFile = mods.includes(senderId);

  try {
    const { getDb } = await import("./mongo.mjs");
    const db = await getDb();
    // We use a unified collection but Discord users have their own IDs
    // We prefix or use a separate field to avoid collision with WhatsApp JIDs
    const user = await db.collection("mn_users").findOne(
      { discordId: senderId },
      { projection: { staffLevel: 1, isPremium: 1, jailed: 1, jailUntil: 1, staffImmunity: 1, banned: 1 } }
    );

    const staffLevel = Math.max(user?.staffLevel ?? 0, isModByFile ? 1 : 0);

    let isJailed = !!(user?.jailed);
    if (isJailed && user?.jailUntil && user.jailUntil <= Date.now()) {
      isJailed = false;
      db.collection("mn_users")
        .updateOne({ discordId: senderId }, { $set: { jailed: false, jailUntil: null } })
        .catch(() => {});
    }

    return {
      isOwner:       false,
      isStaff:       staffLevel >= 2,
      isMod:         staffLevel >= 1 || isModByFile,
      isPremium:     !!(user?.isPremium) || staffLevel >= 1 || isModByFile,
      isJailed,
      isBanned:      !!(user?.banned),
      staffImmunity: !!(user?.staffImmunity) || staffLevel >= 2,
      staffLevel,
    };
  } catch {
    return {
      isOwner:       false,
      isStaff:       false,
      isMod:         isModByFile,
      isPremium:     isModByFile,
      isJailed:      false,
      isBanned:      false,
      staffImmunity: false,
      staffLevel:    isModByFile ? 1 : 0,
    };
  }
}

function _ownerPerms() {
  return {
    isOwner:       true,
    isStaff:       true,
    isMod:         true,
    isPremium:     true,
    isJailed:      false,
    staffImmunity: true,
    staffLevel:    99,
  };
}
