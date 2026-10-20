import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const account = {
  _id: "discord:123456789",
  registered: true,
  name: "Linked player",
  money: 1200,
  bank: 50,
};
const writes = [];
const collection = {
  async findOneAndUpdate(query, update, options) {
    writes.push({ query, update, options });
    if (!Array.isArray(update)) return null;
    const amount = update[0].$set.money.$subtract[1];
    if (!account.registered || account.money < amount) return null;
    account.money -= amount;
    return { ...account };
  },
  async updateOne(query, update) {
    writes.push({ query, update });
    for (const [path, value] of Object.entries(update.$set || {})) {
      if (path.startsWith("auctionHolds.")) {
        account.auctionHolds ||= {};
        account.auctionHolds[path.split(".")[1]] = value;
      }
    }
    for (const path of Object.keys(update.$unset || {})) {
      if (path.startsWith("auctionHolds.")) delete account.auctionHolds?.[path.split(".")[1]];
    }
    return { matchedCount: 1, modifiedCount: 1 };
  },
};
globalThis.__auctionWalletHoldDb = { collection: () => collection };

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/lib/mongo.mjs")) return {
      format: "module",
      shortCircuit: true,
      source: "export const getDb = async () => globalThis.__auctionWalletHoldDb;",
    };
    if (url.endsWith("/lib/identity.mjs")) return {
      format: "module",
      shortCircuit: true,
      source: `
        export const findUserByIdentity = async () => ({ ...globalThis.__auctionWalletHoldAccount });
        export const economyAccountId = async () => globalThis.__auctionWalletHoldAccount._id;
      `,
    };
    return nextLoad(url, context);
  },
});
globalThis.__auctionWalletHoldAccount = account;

const {
  getUser, saveUser, debitWalletIfAvailable, setAuctionHold, clearAuctionHold,
} = await import("../plugins/economy/database.js");

test("Discord auction settlement debits the shared wallet atomically", async () => {
  writes.length = 0;
  account.money = 1200;
  const debited = await debitWalletIfAvailable("discord:123456789", 700);
  assert.deepEqual(debited, { money: 500, bank: 50 });
  assert.equal(account.money, 500);
  const write = writes.find(({ update }) => Array.isArray(update));
  assert.equal(write.query.registered, true);
  assert.equal(write.query.$expr.$gte[1], 700);

  assert.equal(await debitWalletIfAvailable("discord:123456789", 700), null);
  assert.equal(account.money, 500);
});

test("Discord auction holds survive ordinary wallet saves and clear by auction", async () => {
  writes.length = 0;
  account.money = 1200;
  account.auctionHolds = {};
  assert.equal(await setAuctionHold("discord:123456789", "discord:channel-1", 900, 50_000), true);
  const holdWrite = writes.find(({ update }) => Object.keys(update.$set || {}).some((key) => key.startsWith("auctionHolds.")));
  const holdField = Object.keys(holdWrite.update.$set)[0];
  assert.equal(holdWrite.update.$set[holdField].amount, 900);
  assert.equal(holdWrite.update.$set[holdField].auctionId, "discord:channel-1");

  const user = await getUser("discord:123456789");
  user.money -= 5;
  await saveUser("discord:123456789", user);
  const ordinarySave = writes.find(({ update }) => update.$inc?.money === -5);
  assert.equal(ordinarySave.update.$set?.auctionHolds, undefined);

  assert.equal(await clearAuctionHold("discord:123456789", "discord:channel-1"), true);
  assert.deepEqual(Object.keys(account.auctionHolds), []);
});
