# Shared accounts, card claims and lottery entries

Update and restart both AKIRA-DISCORD and Kelin-MD2 together. Both must use
the same MongoDB database (`kelin_md`), and the player's accounts must be
connected through an active, verified `account_links` record.

- Linked commands resolve the existing WhatsApp economy account, including
  verified legacy phone/LID aliases. Reads and saves retain its original `_id`
  and unique `websiteId`; no users are copied or deleted and balances are not
  added together.
- Shared lookups follow only unambiguous one-to-one active Discord links and
  explicit identity fields. Conflicting link rows and generic `owner`/`sender`
  values cannot pull another user's profile into a collection read.
- LIDs are matched by their full `@lid` identifier, not by bare digits that
  could be another user's phone key. Numeric-only legacy rows stay isolated
  until an explicit owner identity is available.
- Cards and pending cards combine records under those verified ownership keys.
  Pokémon trainer, party, PC and count readers use the same account aliases.
  Saves target the original collection/trainer documents.
- Standalone Discord card keys retain the complete `discord:<id>` namespace.
  The old `uid()` implementation reduced all such keys to literal `discord`.
  A potentially mixed legacy `mn_users` document under that generic key is
  preserved but excluded from automatic attribution: its cards cannot safely
  be assigned to a player without independent ownership evidence.
- Public card claim codes are stable five-character uppercase alphanumeric
  values derived from character name and tier, not long API IDs or tier-local
  array positions. Persistent card IDs are unchanged. Old claim IDs, card IDs
  and indexes remain accepted for already-pending cards and live spawns.
- Lottery purchases match full/bare/device JIDs, verified LIDs, linked Discord
  identities, and aliases recorded on the ticket. A single conditional MongoDB
  update appends one ticket and increments the pool; commands never overwrite
  the entire ticket list from a stale snapshot. Losing concurrent attempts
  refund their debit. A draw lock prevents either platform from accepting
  entries while drawing, and a new round permits re-entry.

Existing ticket prices and prizes are unchanged. The truncated Discord summon
handler is restored, retaining prices from its last complete version and
displaying the same short code that `.claim` accepts.

Regression coverage includes both purchase directions, concurrent linked and
unrelated buyers, legacy tickets, new rounds, actual claim/lottery commands,
account read/write consistency, and separate standalone Discord users.
Tests use synthetic database fixtures, not the production database. On an
uncertain database write, the purchase deliberately reports uncertainty rather
than blindly refunding a potentially committed ticket. If payout fails after
a draw has been locked, inspect/reconcile that round before clearing its lock;
automatically retrying could pay prizes twice.
