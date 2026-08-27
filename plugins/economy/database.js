import { getDb } from "../../lib/mongo.mjs";

export const DEFAULTS = {
  name:          "User",
  money:         0,
  bank:          0,
  vault:         0,
  orbs:          0,
  diamonds:      0,
  level:         1,
  xp:            0,
  bio:           "",
  profileBackground: null,
  age:           null,
  birthday:      null,
  inventory:     [],
  history:       [],
  lastDaily:     0,
  lastWeekly:    0,
  lastMonthly:   0,
  lastWork:      0,
  lastRest:      0,
  job:           null,
  fired:         false,
  lastJobChange: 0,
  energy:        100,
  workXp:        0,
  completedShifts: 0,
  staffLevel:    0,
  isPremium:     false,
  staffImmunity: false,
  registered:    false,
  registeredAt:  null,
  banned:        false,
};

export async function getUser(id, isDiscord = false) {
  const db = await getDb();
  const query = isDiscord ? { discordId: id } : { _id: id };
  const user = await db.collection("users").findOne(query);
  
  if (!user) return isDiscord ? null : { ...DEFAULTS };
  
  const { _id, ...rest } = user;
  const merged = { ...DEFAULTS, ...rest };

  merged._snap = {
    money:    merged.money    ?? 0,
    bank:     merged.bank     ?? 0,
    vault:    merged.vault    ?? 0,
    xp:       merged.xp       ?? 0,
    diamonds: merged.diamonds ?? 0,
    orbs:     merged.orbs     ?? 0,
    workXp:   merged.workXp   ?? 0,
    completedShifts: merged.completedShifts ?? 0,
  };
  return merged;
}

const WALLET_CAP = 500_000_000_000;
const ATOMIC_FIELDS = new Set([
  "money", "bank", "vault", "xp", "diamonds", "orbs",
  "completedShifts", "workXp",
]);
const COOLDOWN_FIELDS = new Set([
  "lastDaily", "lastWeekly", "lastMonthly",
  "lastWork", "lastJobChange",
  "lastRest",
  "lastCrime", "lastRob",
  "lastDig", "lastFish",
  "lastGamble", "lastBet",
  "lastBeg", "lastSlots", "lastScratch",
]);
const MONOTONIC_FIELDS = new Set(["level"]);

export async function saveUser(id, data, isDiscord = false) {
  const db = await getDb();
  const { _id, _snap, ...safeData } = data;

  if ((safeData.money ?? 0) > WALLET_CAP) {
    const excess   = safeData.money - WALLET_CAP;
    safeData.money = WALLET_CAP;
    safeData.bank  = (safeData.bank ?? 0) + excess;
  }

  const query = isDiscord ? { discordId: id } : { _id: id };

  if (_snap) {
    const incOp = {};
    const maxOp = {};
    const setOp = {};

    for (const [key, value] of Object.entries(safeData)) {
      if (ATOMIC_FIELDS.has(key)) {
        const delta = (value ?? 0) - (_snap[key] ?? 0);
        if (delta !== 0) incOp[key] = delta;
      } else if (COOLDOWN_FIELDS.has(key)) {
        maxOp[key] = value ?? 0;
      } else if (MONOTONIC_FIELDS.has(key)) {
        maxOp[key] = value ?? 0;
      } else {
        setOp[key] = value;
      }
    }

    const update = {};
    if (Object.keys(incOp).length > 0) update.$inc = incOp;
    if (Object.keys(maxOp).length > 0) update.$max = maxOp;
    if (Object.keys(setOp).length > 0) update.$set = setOp;
    if (Object.keys(update).length === 0) return;

    await db.collection("users").updateOne(query, update, { upsert: true });
  } else {
    await db.collection("users").updateOne(
      query,
      { $set: safeData },
      { upsert: true }
    );
  }
}

export async function isRegistered(id, isDiscord = false) {
  const db = await getDb();
  const query = isDiscord ? { discordId: id } : { _id: id };
  const user = await db.collection("users").findOne(query, { projection: { registered: 1 } });
  return !!(user?.registered);
}

export async function registerUser(id, name, isDiscord = false) {
  const db = await getDb();
  const { name: _n, registered: _r, registeredAt: _ra, ...insertDefaults } = DEFAULTS;
  const query = isDiscord ? { discordId: id } : { _id: id };
  
  await db.collection("users").updateOne(
    query,
    {
      $setOnInsert: { ...insertDefaults, money: 100_000 },
      $set: { 
        name: name || "User", 
        registered: true, 
        registeredAt: new Date().toISOString(),
        ...(isDiscord ? { discordId: id } : {})
      },
    },
    { upsert: true }
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
  const query = isDiscord ? { discordId: id } : { _id: id };
  const entry = { type, amount, desc, ts: Date.now() };
  await db.collection("users").updateOne(
    query,
    {
      $push: {
        history: {
          $each:  [entry],
          $slice: -10,
        },
      },
    }
  );
}
