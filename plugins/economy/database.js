import { getDb } from "../../lib/mongo.mjs";
import { identityInsertFields, identityQuery } from "../../lib/identity.mjs";

export const DEFAULTS = {
  name: "User",
  money: 0,
  bank: 0,
  vault: 0,
  orbs: 0,
  diamonds: 0,
  level: 1,
  xp: 0,
  bio: "",
  profileBackground: null,
  age: null,
  birthday: null,
  inventory: [],
  history: [],
  lastDaily: 0,
  lastWeekly: 0,
  lastMonthly: 0,
  lastWork: 0,
  lastRest: 0,
  job: null,
  fired: false,
  lastJobChange: 0,
  energy: 100,
  workXp: 0,
  completedShifts: 0,
  staffLevel: 0,
  isPremium: false,
  staffImmunity: false,
  registered: false,
  registeredAt: null,
  banned: false,
};

const USERS_COLLECTION = "users";
const WALLET_CAP = Number(process.env.WALLET_CAP || 300_000_000_000);
const ATOMIC_FIELDS = new Set([
  "money", "bank", "vault", "xp", "diamonds", "orbs",
  "completedShifts", "workXp",
]);
const COOLDOWN_FIELDS = new Set([
  "lastDaily", "lastWeekly", "lastMonthly", "lastWork", "lastJobChange",
  "lastRest", "lastCrime", "lastRob", "lastDig", "lastFish",
  "lastGamble", "lastBet", "lastBeg", "lastSlots", "lastScratch",
]);
const MONOTONIC_FIELDS = new Set(["level"]);

function collection(db) {
  return db.collection(USERS_COLLECTION);
}

export async function getUser(id, isDiscord = false) {
  const db = await getDb();
  const normalizedId = String(id);
  const user = await collection(db).findOne(identityQuery(normalizedId, isDiscord));

  if (!user) return isDiscord ? null : { ...DEFAULTS, _id: normalizedId };

  const { _id, ...rest } = user;
  const merged = { ...DEFAULTS, ...rest, _id };
  merged._snap = {
    money: merged.money ?? 0,
    bank: merged.bank ?? 0,
    vault: merged.vault ?? 0,
    xp: merged.xp ?? 0,
    diamonds: merged.diamonds ?? 0,
    orbs: merged.orbs ?? 0,
    workXp: merged.workXp ?? 0,
    completedShifts: merged.completedShifts ?? 0,
  };
  return merged;
}

export async function saveUser(id, data, isDiscord = false) {
  const db = await getDb();
  const { _id, _snap, ...safeData } = data;
  const normalizedId = String(id);

  if ((safeData.money ?? 0) > WALLET_CAP) {
    const excess = safeData.money - WALLET_CAP;
    safeData.money = WALLET_CAP;
    safeData.bank = (safeData.bank ?? 0) + excess;
  }

  const query = identityQuery(normalizedId, isDiscord);
  if (_snap) {
    const incOp = {};
    const maxOp = {};
    const setOp = {};

    for (const [key, value] of Object.entries(safeData)) {
      if (ATOMIC_FIELDS.has(key)) {
        const delta = (value ?? 0) - (_snap[key] ?? 0);
        if (delta !== 0) incOp[key] = delta;
      } else if (COOLDOWN_FIELDS.has(key) || MONOTONIC_FIELDS.has(key)) {
        maxOp[key] = value ?? 0;
      } else {
        setOp[key] = value;
      }
    }

    const update = {};
    if (Object.keys(incOp).length) update.$inc = incOp;
    if (Object.keys(maxOp).length) update.$max = maxOp;
    if (Object.keys(setOp).length) update.$set = setOp;
    if (!Object.keys(update).length) return;

    await collection(db).updateOne(query, update, { upsert: true });
    return;
  }

  await collection(db).updateOne(query, { $set: safeData }, { upsert: true });
}

export async function isRegistered(id, isDiscord = false) {
  const db = await getDb();
  const user = await collection(db).findOne(
    identityQuery(String(id), isDiscord),
    { projection: { registered: 1 } },
  );
  return user?.registered === true;
}

export async function registerUser(id, name, isDiscord = false) {
  const db = await getDb();
  const { name: _name, registered: _registered, registeredAt: _registeredAt, ...insertDefaults } = DEFAULTS;
  const identity = identityInsertFields(String(id), isDiscord);

  await collection(db).updateOne(
    identityQuery(String(id), isDiscord),
    {
      $setOnInsert: {
        ...identity,
        ...insertDefaults,
        money: 100_000,
      },
      $set: {
        name: name || "User",
        registered: true,
        registeredAt: new Date().toISOString(),
        ...(isDiscord ? { discordId: identity.discordId } : {}),
      },
    },
    { upsert: true },
  );
}

export async function requireRegistration(discord, sender) {
  const { message } = discord;
  const ok = await isRegistered(sender, true);
  if (!ok) {
    await message.reply("❌ You need to register first!\n\nUse `.register <your_name>` to create your account.");
  }
  return ok;
}

export async function addHistory(id, type, amount, desc, isDiscord = false) {
  const db = await getDb();
  await collection(db).updateOne(
    identityQuery(String(id), isDiscord),
    {
      $push: {
        history: {
          $each: [{ type, amount, desc, ts: Date.now() }],
          $slice: -10,
        },
      },
    },
  );
}
