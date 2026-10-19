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
import { getCardClaimId } from "../../lib/cardClaimId.mjs";

// ── Summon costs by tier ──────────────────────────────────────────────────────
export const SUMMON_COST = {
  Common: 10000, Uncommon: 50000, Rare: 100000,
  Epic: 150000, Legendary: 200000, Mythical: 300000,
};
const WEIGHTS = [40, 25, 18, 10, 5, 2];
const summonCooldowns = new Map();

function randomTier() {
  let roll = Math.random() * WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < WEIGHTS.length; i++) {
    roll -= WEIGHTS[i];
    if (roll < 0) return TIER_NAME[String(i + 1)];
  }
  return "Common";
}

export default {
  name: "summon",
  aliases: ["nsummon", "cardsummon", "pull"],
  category: "cards",
  description: "Summon a card to claim later — costs coins based on tier",
  usage: ".summon [tier]",
  cooldown: 20,

  async run({ sock, msg, args, sender, discord, prefix = "." }) {
    const jid = msg.key.remoteJid;
    const reply = text => sendEconomyReply({
      sock, jid, msg, discord, text, title: "🔮 Summon", color: "#FF8A65",
      simpleText: `🔮 summon: ${flattenEconomyText(text)}`, mentions: [sender],
    });
    if (args[0]?.toLowerCase() === "help") {
      return reply("Use .summon [1-6 or S], then .claim <code>.\n"
        + Object.entries(SUMMON_COST).map(([tier, cost]) => `${tier}: $${cost.toLocaleString()}`).join("\n"));
    }
    if (!await requireRegistration(sock, msg, sender)) return;
    const input = String(args[0] || "").trim().toLowerCase();
    const tier = input
      ? TIER_NAME[input] || Object.values(TIER_NAME).find(name => name.toLowerCase() === input)
      : randomTier();
    if (!tier) return reply("❌ Unknown tier. Use .summon help.");
    const now = Date.now();
    if (now - (summonCooldowns.get(sender) || 0) < 20_000) return reply("⏳ Wait 20 seconds between summons.");
    summonCooldowns.set(sender, now);
    try {
      // Retain the prices from the last complete summon implementation.
      const cost = SUMMON_COST[tier] ?? SUMMON_COST.Common;
      const ecoUser = await getUser(sender);
      if ((ecoUser.money || 0) < cost) return reply(`❌ Not enough coins. Required: $${cost.toLocaleString()}.`);
      // Fetch first so an unavailable API never charges the user's wallet.
      const card = await fetchCardByTier(TIER_NUM[tier.toLowerCase()] || "1");
      if (!card) return reply("❌ No cards available for this tier. Your coins were not deducted.");
      const [cardUser, series] = await Promise.all([
        findOrCreateUser(sender),
        card.series && card.series !== "Unknown"
          ? Promise.resolve(card.series)
          : getSeries(card.name, { timeout: 1500 }).catch(() => "Unknown"),
      ]);
      const pendingCard = {
        ...card, series: series || "Unknown", claimId: getCardClaimId(card),
        spawnId: createSpawnId(), summonedAt: new Date(),
      };
      ecoUser.money -= cost;
      await saveUser(sender, ecoUser);
      cardUser.pendingCards = Array.isArray(cardUser.pendingCards) ? cardUser.pendingCards : [];
      cardUser.pendingCards.push(pendingCard);
      await cardUser.save();
      await addHistory(sender, "summon", -cost, `Summoned ${tier} card`).catch(() => {});
      const text = `${TIER_EMOJI[tier] || "🃏"} ${card.name} summoned!\n`
        + `Use ${prefix}claim ${pendingCard.claimId} to collect it.\n`
        + `Cost: ${compactMoney(cost)} • Wallet: ${compactMoney(ecoUser.money)}`;
      if (discord?.message) {
        try {
          const payload = await buildDiscordSummonPayload(pendingCard, {
            summonCost: cost, walletRemaining: ecoUser.money, prefix,
          });
          return await discord.message.reply(payload);
        } catch { return reply(text); }
      }
      if (card.media) {
        try { return await sendCardMedia(sock, jid, pendingCard, text, { quoted: msg, mentions: [sender] }); }
        catch { /* A media failure must not repeat the purchase. */ }
      }
      return reply(text);
    } catch (error) {
      console.error("SUMMON ERROR:", error.message);
      return reply("❌ Summon could not be completed. Check your pending cards before retrying.");
    }
  },
};
