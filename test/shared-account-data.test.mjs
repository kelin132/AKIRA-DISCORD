import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createMemoryDb } from "./support/memoryMongo.mjs";

const phone = "263771234567@s.whatsapp.net";
const lid = "263779999999@lid";
const discord = "discord:123456789012345678";
const other = "263779999999@s.whatsapp.net";
let db;
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/lib/mongo.mjs")) return { format: "module", shortCircuit: true, source: "export const getDb = () => globalThis.sharedDataFixture;" };
    return nextLoad(url, context);
  },
});
const economy = await import("../plugins/economy/database.js");
const cards = await import("../plugins/cards/db.js");
const trainers = await import("../lib/pokemon/players.mjs");
const pokemon = await import("../lib/pokemon/pokemonDb.mjs");
const { default: collectionCommand } = await import("../plugins/cards/col.js");
beforeEach(() => {
  db = createMemoryDb({
    users: [
      { _id: phone, registered: false, money: 0 },
      { _id: lid, registered: true, phoneNumber: "263771234567", money: 12345, bank: 500, totalWealth: 12845, xp: 789, inventory: ["medicine"], websiteId: "AID-FIXTURE" },
      { _id: discord, registered: true, money: 999 },
      { _id: other, registered: true, money: 9876 },
    ],
    account_links: [{ whatsappId: phone, discordId: "123456789012345678", status: "active" }],
    mn_users: [
      { _id: "wa-cards", userId: lid, cards: [{ cardId: "a", name: "WhatsApp copy" }], pendingCards: [{ cardId: "p", name: "Old pending" }] },
      { _id: "discord-cards", userId: discord, cards: [{ cardId: "b", name: "Discord copy" }], pendingCards: [{ cardId: "q", name: "Discord pending" }] },
      { _id: "empty", userId: "263771234567", cards: [] },
      { _id: "other", userId: "263779999999", whatsappNumber: phone, identityAliases: [lid, phone], cards: [{ cardId: "c", name: "Other user's card" }] },
      { _id: "unsafe-old-bucket", userId: "discord", whatsappNumber: discord, cards: [{ cardId: "mixed", name: "Unassignable mixed card" }] },
    ],
    pokemon_trainers: [
      { _id: "legacy", jid: lid, party: ["p1"], pc: ["p2"], coins: 250, inventory: { pokeball: 3 } },
      { _id: "discord", jid: discord, party: [], pc: ["p3"], coins: 1000 },
      { _id: "empty", jid: phone, party: [], pc: [], coins: 1000 },
    ],
    pokemon_owned: [
      { _id: "p1", ownerJid: lid, inParty: true },
      { _id: "p2", owner: lid, inParty: false },
      { _id: "p3", ownerJid: discord, inParty: false },
      { _id: "p4", ownerJid: other, inParty: true },
      { _id: "p5", owner: 263779999999, whatsappNumber: phone, identityAliases: [lid, phone], inParty: false },
    ],
  });
  globalThis.sharedDataFixture = db;
});

test("linked Discord and WhatsApp read the same original economy profile", async () => {
  const wa = await economy.getUser(phone);
  const dc = await economy.getUser(discord);
  for (const field of ["money", "bank", "xp", "inventory", "websiteId"]) assert.deepEqual(dc[field], wa[field]);
  assert.equal(dc.money, 12345);
  assert.equal(await economy.isRegistered(discord), true);
  dc.money += 100;
  await economy.saveUser(discord, dc);
  assert.equal((await economy.getUser(phone)).money, 12445);
  assert.equal(db.data.users.find(user => user._id === lid).totalWealth, 12945);
  assert.equal(db.data.users.find(user => user._id === phone).money, 0);
  assert.equal(db.data.users.find(user => user._id === discord).money, 999);
  assert.equal(db.data.users.length, 4);
});
test("linked collections include both platforms' copies and pending cards without leaking the old shared bucket", async () => {
  const wa = await cards.getUser(phone);
  const dc = await cards.getUser(discord);
  assert.deepEqual(dc.cards, wa.cards);
  assert.equal(dc.cards.length, 2);
  assert.equal(dc.pendingCards.length, 2);
  assert.ok(!dc.cards.some(card => card.cardId === "mixed" || card.cardId === "c"));
  dc.cards.push({ cardId: "new", name: "New shared copy" });
  dc.pendingCards.splice(0, 1);
  await dc.save();
  assert.equal((await cards.getUser(phone)).cards.length, 3);
  assert.equal((await cards.getUser(phone)).pendingCards.length, 1);
  assert.equal(db.data.mn_users.find(user => user._id === "unsafe-old-bucket").cards.length, 1);
});

test("Discord saves repair a legacy missing wealth field from the shared wallet and bank", async () => {
  delete db.data.users.find(user => user._id === lid).totalWealth;
  const profile = await economy.getUser(discord);
  profile.money += 100;
  await economy.saveUser(discord, profile);
  assert.equal(db.data.users.find(user => user._id === lid).totalWealth, 12945);
});

test("reading accounts with no migration marker cannot reset any player's balances", async () => {
  const balances = db.data.users.map(({ _id, money, bank }) => ({ _id, money, bank }));
  const originalCollection = db.collection.bind(db);
  db.collection = name => {
    assert.notEqual(name, "economy_migrations", "a user read must not initialize the old reset migration");
    return originalCollection(name);
  };
  await economy.getUser(discord);
  await economy.getUser(other);
  assert.deepEqual(db.data.users.map(({ _id, money, bank }) => ({ _id, money, bank })), balances);
});
test("linked trainer, party, PC, counts and mutations agree on both identities", async () => {
  assert.deepEqual(await trainers.getTrainer(discord), await trainers.getTrainer(phone));
  assert.deepEqual(await pokemon.getAllTrainerPokemon(discord), await pokemon.getAllTrainerPokemon(phone));
  assert.equal(await pokemon.countTrainerPokemon(discord), 3);
  assert.ok((await pokemon.getAllTrainerPokemon(other)).some(p => p._id === "p5"));
  assert.equal((await pokemon.getTrainerParty(discord)).length, 1);
  assert.equal((await pokemon.getTrainerPC(discord)).length, 2);
  await trainers.addCoins(discord, 25);
  assert.equal((await trainers.getTrainer(phone)).coins, 275);
  await trainers.removeFromPC(discord, "p3");
  assert.ok(!(await trainers.getTrainer(phone)).pc.includes("p3"));
});
test("standalone Discord users keep different namespaced card records", async () => {
  const a = "discord:222222222222222222";
  const b = "discord:333333333333333333";
  assert.notEqual(cards.uid(a), cards.uid(b));
  const first = await cards.findOrCreateUser(a);
  first.cards.push({ cardId: "private", name: "Private standalone copy" });
  await first.save();
  assert.equal((await cards.findOrCreateUser(b)).cards.length, 0);
  assert.equal((await cards.getUser(a)).cards.length, 1);
  assert.equal(db.data.mn_users.filter(user => user.userId === "discord").length, 1);
});
test("actual collection commands show the same linked cards on either identity", async () => {
  const messages = [];
  const sock = { sendMessage: async (_, payload) => { messages.push(payload.text); } };
  const msg = { key: { remoteJid: "fixture-channel" } };
  for (const sender of [phone, discord]) await collectionCommand.run({ sock, msg, sender, args: [] });
  const withoutSenderLabel = text => text.split("\n").filter(line => !line.includes("*User*")).join("\n");
  assert.equal(withoutSenderLabel(messages[0]), withoutSenderLabel(messages[1]));
  assert.match(messages[0], /WhatsApp copy/);
  assert.match(messages[0], /Discord copy/);
  assert.doesNotMatch(messages[0], /Unassignable|Other user's/);
});

test("conflicting links and generic owner fields cannot merge a different user's data", async () => {
  const conflictingDiscord = "999999999999999999";
  db.data.account_links.push({
    whatsappId: phone,
    discordId: conflictingDiscord,
    status: "active",
  });
  db.data.users.push({
    _id: "discord:999999999999999999",
    discordId: conflictingDiscord,
    owner: phone,
    registered: true,
    money: 987654,
  });
  db.data.mn_users.push({
    _id: "conflicting-discord-cards",
    userId: "discord:999999999999999999",
    cards: [{ cardId: "foreign", name: "Must stay private" }],
  });

  const profile = await cards.getUser(phone);
  assert.deepEqual(profile.cards.map(card => card.name), ["WhatsApp copy"]);
  assert.ok(!profile.cards.some(card => card.name === "Discord copy" || card.name === "Must stay private"));
  assert.equal((await economy.getUser(phone)).money, 12345);
  assert.notEqual((await economy.getUser(phone)).money, 987654);
});
