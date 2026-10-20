import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { deleteAuction, getAuction, setAuction } from "../lib/auctionManager.mjs";

const fixture = {
  cards: new Map(),
  economy: new Map(),
  debits: [],
  credits: [],
  histories: [],
  cleared: [],
};
globalThis.__discordAuctionSettlement = fixture;

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/plugins/cards/db.js")) return {
      format: "module",
      shortCircuit: true,
      source: `
        export async function findOrCreateUser(id) {
          return globalThis.__discordAuctionSettlement.cards.get(id);
        }
      `,
    };
    if (url.endsWith("/plugins/economy/database.js")) return {
      format: "module",
      shortCircuit: true,
      source: `
        export const isRegistered = async () => true;
        export async function debitWalletIfAvailable(id, amount) {
          const state = globalThis.__discordAuctionSettlement;
          state.debits.push({ id, amount });
          const user = state.economy.get(id);
          if (!user || user.money < amount) return null;
          user.money -= amount;
          return { money: user.money, bank: user.bank || 0 };
        }
        export async function addMoney(id, amount) {
          const state = globalThis.__discordAuctionSettlement;
          state.credits.push({ id, amount });
          state.economy.get(id).money += amount;
        }
        export async function addHistory(...entry) {
          globalThis.__discordAuctionSettlement.histories.push(entry);
        }
        export async function clearAuctionHold(id, auctionId) {
          globalThis.__discordAuctionSettlement.cleared.push({ id, auctionId });
          return true;
        }
      `,
    };
    if (url.endsWith("/lib/cardApi.mjs")) return {
      format: "module",
      shortCircuit: true,
      source: "export const TIER_EMOJI = {};",
    };
    return nextLoad(url, context);
  },
});

const { closeAuction } = await import("../plugins/cards/auction.js");

function setup(group, winnerMoney) {
  fixture.cards.clear();
  fixture.economy.clear();
  fixture.debits.length = 0;
  fixture.credits.length = 0;
  fixture.histories.length = 0;
  fixture.cleared.length = 0;
  const seller = { cards: [], totalCards: 0, async save() {} };
  const winner = { cards: [], totalCards: 0, async save() {} };
  fixture.cards.set("seller@s.whatsapp.net", seller);
  fixture.cards.set("winner@s.whatsapp.net", winner);
  fixture.economy.set("seller@s.whatsapp.net", { money: 250, bank: 0 });
  fixture.economy.set("winner@s.whatsapp.net", { money: winnerMoney, bank: 0 });
  const sock = { sendMessage: async () => {} };
  setAuction(group, {
    sock,
    card: { cardId: "discord-card-1", name: "Discord Fixture", tier: "Rare" },
    sellerJid: "seller@s.whatsapp.net",
    currentBid: 100,
    currentBidder: "winner@s.whatsapp.net",
    startBid: 50,
    endsAt: Date.now() + 1_000,
    auctionId: `discord:${group}`,
  });
  return { seller, winner };
}

test("Discord auction close charges the winner and credits the seller before completing", async () => {
  const group = "discord-settlement-success@g.us";
  const { winner } = setup(group, 500);
  await closeAuction(group);
  assert.equal(getAuction(group), null);
  assert.equal(fixture.debits[0].amount, 100);
  assert.equal(fixture.economy.get("winner@s.whatsapp.net").money, 400);
  assert.equal(fixture.economy.get("seller@s.whatsapp.net").money, 350);
  assert.equal(winner.cards.length, 1);
  assert.equal(fixture.cleared.length, 1);
});

test("Discord auction close returns the card without charging if funds are gone", async () => {
  const group = "discord-settlement-failed@g.us";
  const { seller, winner } = setup(group, 40);
  await closeAuction(group);
  assert.equal(getAuction(group), null);
  assert.equal(fixture.economy.get("winner@s.whatsapp.net").money, 40);
  assert.equal(fixture.credits.length, 0);
  assert.equal(seller.cards.length, 1);
  assert.equal(winner.cards.length, 0);
  assert.equal(fixture.cleared.length, 1);
});
