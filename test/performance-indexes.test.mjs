import test from "node:test";
import assert from "node:assert/strict";
import { ensurePerformanceIndexes } from "../lib/performanceIndexes.mjs";
test("index setup reuses equivalent website indexes and runs only once", async () => {
  const listed = new Map(), created = [];
  const db = { collection: name => ({
    listIndexes() {
      listed.set(name, (listed.get(name) || 0) + 1);
      return { toArray: async () => name === "identity_links" ? [{ name: "phoneId_1", key: { phoneId: 1 } }] : [] };
    },
    createIndex: async spec => created.push({ name, spec }),
  }) };
  await Promise.all([ensurePerformanceIndexes(db), ensurePerformanceIndexes(db)]);
  assert.ok([...listed.values()].every(count => count === 1));
  assert.ok(!created.some(row => row.name === "identity_links"));
  assert.ok(created.some(row => row.name === "users" && row.spec.whatsappId === 1));
  assert.ok(created.some(row => row.name === "account_links"));
});
