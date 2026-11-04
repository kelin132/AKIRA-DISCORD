import { TIER_NAME, TIER_WEIGHTS } from "../../lib/cardApi.mjs";

export default {
  name: "rarity",
  aliases: ["rrt", "tiers"],
  category: "cards",
  description: "View the card rarity system and spawn chances",
  usage: ".rarity",

  async run({ sock, msg }) {
    const jid = msg.key.remoteJid;
    const tiers = TIER_WEIGHTS
      .map(({ num }) => `${num}: ${TIER_NAME[num] || `Tier ${num}`}`)
      .join("\n");
    const text = `Card tiers\n\n${tiers}\n\n` +
      "Higher tiers are less common. Any available tier can spawn randomly.\n" +
      "Enabled groups get a card every 12–15 minutes.\n" +
      "Use .claim <code> to claim it at the listed value.";

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
