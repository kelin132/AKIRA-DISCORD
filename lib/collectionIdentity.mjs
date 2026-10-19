import { getDb } from "./mongo.mjs";
import { resolveAccountIdentity, collectionOwnershipQuery } from "./accountIdentity.mjs";
export { collectionOwnershipQuery } from "./accountIdentity.mjs";

export function collectionIdentityQuery(values, fields) {
  return { $or: fields.map(field => ({ [field]: { $in: values } })) };
}

export async function accountIdentityValues(id) {
  const { ids } = await resolveAccountIdentity(getDb(), id);
  const numeric = ids.filter(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))).map(Number);
  return [...ids, ...numeric];
}

export async function trainerIdentityQuery(id) {
  return collectionOwnershipQuery(await accountIdentityValues(id),
    ["jid", "_id", "userId", "ownerJid"]);
}

export async function pokemonOwnershipQuery(id) {
  return collectionOwnershipQuery(await accountIdentityValues(id),
    ["ownerJid", "owner", "userId"]);
}
