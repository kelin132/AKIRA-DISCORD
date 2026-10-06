import test from "node:test";
import assert from "node:assert/strict";
import {
  LOTTERY_PRIZES,
  getDiscordParticipantId,
  lotteryDisplayName,
  lotteryTicketDiscordId,
  lotteryWinnerIdentity,
  lotteryWinnerLabel,
  REQUIRED_LOTTERY_ENTRIES,
} from "../lib/lotteryDraw.mjs";

test("uses million-level lottery prizes", () => {
  assert.deepEqual(LOTTERY_PRIZES, [30_000_000, 20_000_000, 10_000_000]);
});

test("credits bare WhatsApp lottery identities using their full JID", () => {
  assert.equal(
    lotteryWinnerIdentity({ userId: "263771234567" }),
    "263771234567@s.whatsapp.net",
  );
});

test("preserves full WhatsApp and namespaced Discord lottery identities", () => {
  assert.equal(
    lotteryWinnerIdentity({ userId: "263771234567@s.whatsapp.net" }),
    "263771234567@s.whatsapp.net",
  );
  assert.equal(
    lotteryWinnerIdentity({ userId: "discord:123456789012345678" }),
    "discord:123456789012345678",
  );
});

test("only treats explicitly Discord-backed tickets as mentionable Discord users", () => {
  assert.equal(
    lotteryTicketDiscordId({ userId: "263771234567" }),
    null,
  );
  assert.equal(
    lotteryTicketDiscordId({ userId: "263771234567", discordId: "263771234567" }),
    null,
  );
  assert.equal(
    lotteryTicketDiscordId({ userId: "discord:123456789012345678" }),
    "123456789012345678",
  );
  assert.equal(
    lotteryTicketDiscordId({
      userId: "263771234567",
      discordId: "123456789012345678",
    }),
    "123456789012345678",
  );
});

test("requires fifteen entries before the shared lottery draw", () => {
  assert.equal(REQUIRED_LOTTERY_ENTRIES, 15);
});

test("does not interpret a WhatsApp phone number as a Discord account", () => {
  assert.equal(getDiscordParticipantId(null, "263771234567@s.whatsapp.net"), null);
  assert.equal(getDiscordParticipantId(null, "263771234567"), null);
  assert.equal(getDiscordParticipantId({ message: { author: { id: "123456789012345678" } } }, "263771234567"), "123456789012345678");
});

test("formats phone mentions with readable names and Discord identities as names", () => {
  assert.equal(lotteryWinnerLabel({ userId: "263771234567", name: "Kelin" }), "@263771234567 (Kelin)");
  assert.equal(lotteryWinnerLabel({ userId: "discord:123456789012345678", name: "Kelin" }), "Kelin");
  assert.equal(lotteryDisplayName({ userId: "discord:123456789012345678" }), "Discord user");
});
