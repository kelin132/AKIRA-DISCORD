import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesOwnerPhone,
  normalizeOwnerPhone,
  normalizeOwnerNumbers,
} from "../lib/ownerIdentity.mjs";

test("the configured owner phone matches WhatsApp JID forms", () => {
  assert.equal(matchesOwnerPhone("27612345678@s.whatsapp.net", "+27612345678"), true);
  assert.equal(matchesOwnerPhone("27612345678:5@s.whatsapp.net", "27612345678"), true);
});

test("a different bot phone does not become owner by identity alone", () => {
  assert.equal(matchesOwnerPhone("27699999999@s.whatsapp.net", "27612345678"), false);
});

test("Discord platform IDs cannot match a phone owner number", () => {
  assert.equal(matchesOwnerPhone("discord:27612345678", "27612345678"), false);
});

test("phone normalization removes formatting", () => {
  assert.equal(normalizeOwnerPhone("+27 (612) 345-678"), "27612345678");
});

test("owner roster combines configured numbers and removes duplicates", () => {
  assert.deepEqual(
    normalizeOwnerNumbers(" +27 612 345 678,27612345679", "+27612345678", ["27612345680"]),
    ["27612345678", "27612345679", "27612345680"],
  );
});
