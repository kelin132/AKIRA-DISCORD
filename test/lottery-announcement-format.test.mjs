import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLotteryAnnouncementWinner,
  getLotteryAnnouncementDetails,
} from "../lib/lotteryAnnouncementFormat.mjs";

test("reads the current nested lottery announcement schema", () => {
  const details = getLotteryAnnouncementDetails({
    payload: {
      totalTickets: 15,
      prize: 60_000_000,
      winners: [
        { name: "Kelin", phone: "263771234567", amount: 30_000_000 },
        { name: "Discord player", discordId: "123456789012345678", amount: 20_000_000 },
      ],
    },
  });

  assert.equal(details.totalEntries, 15);
  assert.equal(details.prize, 60_000_000);
  assert.equal(details.winners.length, 2);
  assert.equal(
    formatLotteryAnnouncementWinner(details.winners[0], 0),
    "🥇 +263771234567 (Kelin) — $30,000,000",
  );
  assert.equal(
    formatLotteryAnnouncementWinner(details.winners[1], 1),
    "🥈 <@123456789012345678> — $20,000,000",
  );
});

test("continues to read legacy top-level lottery events", () => {
  const details = getLotteryAnnouncementDetails({
    totalEntries: 8,
    prize: 4_000,
    winners: [{ name: "Winner", prize: 4_000 }],
  });

  assert.equal(details.totalEntries, 8);
  assert.equal(details.prize, 4_000);
  assert.equal(
    formatLotteryAnnouncementWinner(details.winners[0], 0),
    "🥇 Winner — $4,000",
  );
});

test("never formats a privacy LID or raw JID as a public result", () => {
  const details = getLotteryAnnouncementDetails({
    payload: {
      totalTickets: 1,
      prize: 500,
      winners: [{
        name: "123456789012345678@lid",
        userId: "123456789012345678@lid",
        phone: "123456789012345678",
        amount: 500,
      }],
    },
  });

  assert.equal(
    formatLotteryAnnouncementWinner(details.winners[0], 0),
    "🥇 WhatsApp player — $500",
  );
});
