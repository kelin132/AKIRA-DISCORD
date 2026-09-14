/**
 * KELIN MD — .summon
 * Summon a random card from any tier (or a specific tier).
 * Costs coins from the user's card balance based on the tier summoned.
 * The result is held as a pending claim until the user runs .claim.
 *
 * Usage:
 * .summon           — random tier summon; claim it later with .claim
 * .summon <tier>    — specific tier (1-6, S, or Common/Uncommon/Rare/Epic/Legendary/Mythical/Secret)
 */
import { findOrCreateUser } from "./db.js";
import { getUser, saveUser, requireRegistration, addHistory } from "../economy/database.js";
import {
  buildDiscordSummonPayload,
  fetchCardByTier,
  sendCardMedia,
  TIER_EMOJI,
  TIER_NUM,
  TIER_NAME,
  createSpawnId,
} from "../../lib/cardApi.mjs";
import { getSeries } from "../../lib/seriesEnrich.mjs";
import { flattenEconomyText, sendEconomyReply } from "../../lib/discordEconomyReply.mjs";
import { compactMoney } from "../../lib/compactMoney.mjs";

// ── Summon costs by tier ──────────────────────────────────────────────────────
export const SUMMON_COST =
