import test from "node:test";
import assert from "node:assert/strict";
import { findBattleParticipantId } from "../lib/pokemon/discordBattleIdentity.mjs";

test("matches a battle participant against its normalized string identity", () => {
  const storedId = { toString: () => "mongo-user-42" };
  const battle = { challengerJid: storedId, opponentJid: "discord:other@user" };

  assert.equal(
    findBattleParticipantId(battle, ["discord:owner@user", "mongo-user-42"]),
    storedId,
  );
});

test("returns no participant for unrelated accounts", () => {
  const battle = { challengerJid: "discord:one@user", opponentJid: "discord:two@user" };

  assert.equal(findBattleParticipantId(battle, ["discord:three@user"]), undefined);
});

test("ignores empty identity candidates", () => {
  const battle = { challengerJid: "discord:one@user" };

  assert.equal(findBattleParticipantId(battle, [null, undefined, ""]), undefined);
});
