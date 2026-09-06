/**
 * Return the key used by the card spawner for a chat.
 *
 * Discord spawns are keyed by the channel ID, while WhatsApp spawns use the
 * message remote JID. Keeping this decision in one helper prevents the claim
 * command from looking up a Discord spawn under a different identifier.
 */
export function getSpawnKey(jid, discord) {
  return discord?.message?.channelId
    ? String(discord.message.channelId)
    : jid;
}