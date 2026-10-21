import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const writes = [];
globalThis.__setPlayerAccount = {
  _id: "discord:123456789012345678",
  registered: true,
  money: 40,
  bank: 5,
};
globalThis.__setPlayerDb = {
  collection: () => ({
    async updateOne(query, update, options) {
      writes.push({ query, update, options });
      return { matchedCount: 1 };
    },
  }),
};

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/lib/mongo.mjs")) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export function getDb() { return globalThis.__setPlayerDb; }",
      };
    }
    if (url.endsWith("/lib/identity.mjs")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export async function findUserByIdentity() {
            return globalThis.__setPlayerAccount;
          }
          export async function economyAccountId(id) { return String(id); }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

const { setPlayerFields } = await import("../plugins/economy/database.js");

test("setplayer updates the existing Discord account instead of creating a duplicate", async () => {
  writes.length = 0;
  const updated = await setPlayerFields("discord:123456789012345678", { money: 500 });
  assert.equal(updated, true);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].query, {
    _id: "discord:123456789012345678",
    registered: true,
  });
  assert.equal(writes[0].options?.upsert, undefined);
  assert.equal(writes[0].update[0].$set.money, 500);
});

test("setplayer refuses to create a shadow account when identity lookup fails", async () => {
  writes.length = 0;
  globalThis.__setPlayerAccount = null;
  assert.equal(await setPlayerFields("discord:000000000000000000", { money: 500 }), false);
  assert.equal(writes.length, 0);
});
