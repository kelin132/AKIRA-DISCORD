import test from "node:test";
import assert from "node:assert/strict";
import {
  BUMP_CHANNEL_ID,
  DISBOARD_SERVER_ID,
  isValidDisboardConfirmation,
} from "../lib/discordBump.mjs";

const validMessage = {
  author: { bot: true, username: "DISBOARD", discriminator: "2760" },
  guild: { id: DISBOARD_SERVER_ID },
  channelId: BUMP_CHANNEL_ID,
  content:
    "Bump done! :thumbsup:\n" +
    "Check it out [on DISBOARD](https://disboard.org/server/1533792061168423102).",
};

test("accepts the exact DISBOARD bump confirmation", () => {
  assert.equal(isValidDisboardConfirmation(validMessage), true);
});

test("rejects bump confirmations from the wrong source or location", () => {
  assert.equal(
    isValidDisboardConfirmation({
      ...validMessage,
      author: { ...validMessage.author, bot: false },
    }),
    false,
  );
  assert.equal(
    isValidDisboardConfirmation({
      ...validMessage,
      guild: { id: "another-guild" },
    }),
    false,
  );
  assert.equal(
    isValidDisboardConfirmation({
      ...validMessage,
      content: "Bump done! :thumbsup:",
    }),
    false,
  );
});