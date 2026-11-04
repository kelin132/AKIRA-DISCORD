/**
 * Resolve a Discord button click to the exact participant identifier stored
 * in the active battle. Mongo-backed IDs may be equivalent strings but
 * different object instances, so strict object identity is not reliable.
 */
export function findBattleParticipantId(battle, candidateIds = []) {
  const candidates = new Set(
    candidateIds
      .filter((value) => value !== undefined && value !== null && String(value).trim())
      .map(String),
  );
  return [battle?.challengerJid, battle?.opponentJid]
    .find((participantId) => participantId !== undefined && candidates.has(String(participantId)));
}
