let indexesPromise = null;

const INDEXES = [
  ["identity_links", { phoneId: 1 }, "identity_links_phone"],
  ["users", { identityAliases: 1 }, "users_identity_aliases"],
  ["users", { userId: 1 }, "users_user_id"],
  ["users", { jid: 1 }, "users_jid"],
  ["users", { whatsappNumber: 1 }, "users_whatsapp_number"],
  ["users", { phoneNumber: 1 }, "users_phone_number"],
  ["users", { phone: 1 }, "users_phone"],
  ["users", { whatsappId: 1 }, "users_whatsapp_id"],
  ["users", { whatsappJid: 1 }, "users_whatsapp_jid"],
  ["users", { userJid: 1 }, "users_user_jid"],
  ["users", { migratedFrom: 1 }, "users_migrated_from"],
  ["users", { discordId: 1 }, "users_discord_id"],
  ["account_links", { whatsappId: 1, status: 1 }, "account_links_whatsapp_status"],
  ["account_links", { discordId: 1, status: 1 }, "account_links_discord_status"],
  ["users", { registered: 1, level: -1, xp: -1 }, "users_registered_level"],
  ["pokemon_trainers", { wins: -1 }, "pokemon_trainer_wins"],
  ["pokemon_trainers", { level: -1, xp: -1 }, "pokemon_trainer_level_xp"],
  ["pokemon_trainers", { jid: 1 }, "pokemon_trainer_jid"],
  ["pokemon_trainers", { userId: 1 }, "pokemon_trainer_user_id"],
  ["pokemon_trainers", { ownerJid: 1 }, "pokemon_trainer_owner_jid"],
  ["pokemon_trainers", { owner: 1 }, "pokemon_trainer_owner"],
  ["pokemon_trainers", { whatsappNumber: 1 }, "pokemon_trainer_whatsapp_number"],
  ["pokemon_owned", { level: -1 }, "pokemon_owned_level"],
  ["pokemon_owned", { ownerJid: 1 }, "pokemon_owned_owner"],
  ["pokemon_owned", { owner: 1 }, "pokemon_owned_owner_alias"],
  ["pokemon_owned", { userId: 1 }, "pokemon_owned_user_id"],
  ["mn_users", { totalCards: -1, userId: 1 }, "cards_total"],
  ["mn_users", { userId: 1 }, "cards_user_id"],
  ["mn_users", { jid: 1 }, "cards_jid"],
  ["mn_users", { owner: 1 }, "cards_owner"],
  ["mn_users", { whatsappNumber: 1 }, "cards_whatsapp_number"],
  ["mn_users", { "cards.cardId": 1 }, "cards_card_id"],
  ["mn_users", { "cards.series": 1 }, "cards_series"],
  ["guilds", { owner: 1 }, "guild_owner"],
  ["guilds", { members: 1 }, "guild_members"],
  ["companies", { ownerId: 1 }, "companies_owner"],
];

export function ensurePerformanceIndexes(db) {
  if (!db) return Promise.resolve();
  if (!indexesPromise) {
    indexesPromise = Promise.allSettled(
      [...new Set(INDEXES.map(([collectionName]) => collectionName))].map(async (collectionName) => {
        const collection = db.collection(collectionName);
        const existing = await collection.listIndexes().toArray().catch((error) => {
          if (error?.code === 26) return [];
          throw error;
        });
        for (const [, spec, name] of INDEXES.filter(([target]) => target === collectionName)) {
          const fields = Object.keys(spec);
          const present = existing.some((index) => {
            const keys = Object.keys(index.key || {});
            return !index.partialFilterExpression && !index.sparse && fields.length === keys.length
              && fields.every((field, position) => keys[position] === field && index.key[field] === spec[field]);
          });
          if (!present) await collection.createIndex(spec, { name });
        }
      }),
    ).then((results) => {
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) {
        console.warn(`[indexes] ${failed.length} performance index(es) could not be created`);
      }
    });
  }
  return indexesPromise;
}