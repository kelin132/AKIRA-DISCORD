import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const activeLinks = [];
const includes = (actual, expected) =>
  Array.isArray(expected)
    ? expected.includes(actual)
    : expected && typeof expected === "object" && "$in" in expected
      ? expected.$in.includes(actual)
      : actual === expected;
globalThis.accountLinkIsolationFixture = {
  collection(name) {
    assert.equal(name, "account_links");
    return {
      find(query) {
        return {
          toArray: async () => activeLinks.filter(link =>
            Object.entries(query).every(([field, expected]) => includes(link[field], expected))
          ),
        };
      },
    };
  },
};
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/lib/mongo.mjs")) return {
      format: "module",
      shortCircuit: true,
      source: "export const getDb = () => globalThis.accountLinkIsolationFixture;",
    };
    return nextLoad(url, context);
  },
});
const { resolveDiscordAccount, resolveWhatsAppAccount } = await import("../lib/accountLink.mjs");

test("unambiguous active links resolve in both directions", async () => {
  activeLinks.splice(0, activeLinks.length, {
    discordId: "111111111111111111",
    whatsappId: "263771234567@s.whatsapp.net",
    status: "active",
  });
  assert.equal(await resolveDiscordAccount("111111111111111111"), "263771234567@s.whatsapp.net");
  assert.equal(await resolveWhatsAppAccount("263771234567@s.whatsapp.net"), "111111111111111111");
});

test("duplicate active links to different WhatsApp accounts are rejected", async () => {
  activeLinks.splice(0, activeLinks.length,
    { discordId: "222222222222222222", whatsappId: "263771234567@s.whatsapp.net", status: "active" },
    { discordId: "222222222222222222", whatsappId: "263779999999@s.whatsapp.net", status: "active" },
  );
  assert.equal(await resolveDiscordAccount("222222222222222222"), null);
});

test("multiple Discord accounts linked to one WhatsApp account are rejected", async () => {
  activeLinks.splice(0, activeLinks.length,
    { discordId: "333333333333333333", whatsappId: "263771234567@s.whatsapp.net", status: "active" },
    { discordId: "444444444444444444", whatsappId: "263771234567@s.whatsapp.net", status: "active" },
  );
  assert.equal(await resolveDiscordAccount("333333333333333333"), null);
  assert.equal(await resolveWhatsAppAccount("263771234567@s.whatsapp.net"), null);
});
