import { getUser, saveUser, requireRegistration, addHistory, maybeAwardDiamonds, checkLevelUp } from "./database.js";
import { DIG_LOOT, SHOP_ITEMS, rollLoot } from "./_items.js";
import { sendEconomyReply } from "../../lib/discordEconomyReply.mjs";
import { compactMoney } from "../../lib/compactMoney.mjs";
import { ECONOMY_THUMBNAILS } from "../../lib/economyEmbed.mjs";

const COOLDOWN = 10 * 1000; // 10 seconds

function fmt(n) {
  return compactMoney(n);
}

export default {
  name: "dig",
  aliases: ["mine"],
  category: "economy",
  description: "Dig for buried treasure — cash, items, or orbs",
  usage: ".dig",
  cooldown: 10,

  async run({ sock, msg, sender, discord }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const jid   = msg.key.remoteJid;
    const reply = (text, options = {}) => sendEconomyReply({
      sock,
      jid,
      msg,
      discord,
      text,
      title: options.title || "⛏️ Digging",
      color: options.color || "#57B894",
      fields: options.fields || [],
      discordText: options.discordText,
      thumbnail: ECONOMY_THUMBNAILS.dig,
      mentions: [sender],
    });
    const now   = Date.now();

    const user = await getUser(sender);

    if (now - (user.lastDig || 0) < COOLDOWN) {
      const rem  = COOLDOWN - (now - user.lastDig);
      const secs = Math.ceil(rem / 1000);
      return reply(
        `╭─❀「 ⛏️ *𝐃𝐈𝐆* 」❀─╮
│ ⏳ *Result*  :: *TIRED 🔴*
│ 🍃 *Flavour* :: _腕が疲れた...もう少し待て！_
│
│ 🕐 *Next*    :: *${secs}s remaining*
╰───────────────❀`,
        { discordText: `⛏️ You can dig again in ${secs}s.` },
      );
    }

    const loot = rollLoot(DIG_LOOT);
    user.lastDig = now;
    const hasDiamondShovel = (user.inventory || []).includes("diamond_shovel");
    const diamondReward = maybeAwardDiamonds(user, hasDiamondShovel ? 0.01 : 0.005, 1, 2);

    let resultLine = "";
    let discordResult = "";
    let resultType = "";

    if (loot.type === "cash") {
      const amount  = Math.floor(Math.random() * (loot.max - loot.min + 1)) + loot.min;
      user.money    = (user.money || 0) + amount;
      await addHistory(sender, "dig", amount, `Dug up $${amount.toLocaleString()}`);
      resultLine = `💰 Found *${fmt(amount)}* in the ground!`;
      discordResult = `You dug and found ${fmt(amount)} in the ground.`;
      resultType = `+${fmt(amount)}`;
    } else if (loot.type === "item") {
      user.inventory = user.inventory || [];
      user.inventory.push(loot.name);
      const def  = SHOP_ITEMS[loot.name];
      resultLine = `${def?.emoji || "📦"} Found a *${loot.name}*!`;
      discordResult = `You dug and found ${loot.name}.`;
      resultType = loot.name;
      await addHistory(sender, "dig", 0, `Dug up ${loot.name}`);
    } else if (loot.type === "orbs") {
      const amount  = Math.floor(Math.random() * (loot.max - loot.min + 1)) + loot.min;
      user.orbs     = (user.orbs || 0) + amount;
      resultLine    = `🔮 Found *${amount} orb(s)*!`;
      discordResult = `You dug and found ${amount} orb(s).`;
      resultType    = `+${amount} orbs`;
      await addHistory(sender, "dig", 0, `Dug up ${amount} orbs`);
    } else {
      resultLine = "🪨 You just found a rock. Useless.";
      discordResult = "You dug up a rock. Useless.";
      resultType = "Nothing";
    }

    user.xp = (user.xp || 0) + 10;
    const { leveled, newLevel } = checkLevelUp(user);
    await saveUser(sender, user);

    const digMessages = [
      hasDiamondShovel
        ? "🪏 Your Diamond Shovel glints as you dig deep..."
        : "⛏️ You dig deep into the earth...",
      hasDiamondShovel
        ? "🪏 Your lucky shovel sweeps through the soil..."
        : "⛏️ You strike something with your pickaxe...",
      hasDiamondShovel
        ? "🪏 The Diamond Shovel finds a promising glimmer..."
        : "⛏️ The ground gives way beneath your feet...",
    ];
    const flavour = digMessages[Math.floor(Math.random() * digMessages.length)];

    return reply(
`╭─❀「 ⛏️ *𝐃𝐈𝐆* 」❀─╮
│ 🌙 *Result*  :: *${resultType}*
│ 🍃 *Flavour* :: _${flavour}_
│
│ ${resultLine}
│
│ 💰 *Cash*    :: *${fmt(user.money || 0)}*
│ 🔮 *Orbs*    :: *${user.orbs || 0}*
│ 🎒 *Items*   :: *${(user.inventory || []).length}*
│ ⭐ *XP*      :: *+10*${diamondReward ? `\n│ 💎 *Bonus*   :: *+${diamondReward} Gem${diamondReward === 1 ? "" : "s"}*` : ""}${leveled ? `\n│\n│ 🎉 *LEVEL UP!* — Now Level ${user.level}` : ""}
╰───────────────❀`,
      {
        color: leveled ? "#F1C40F" : "#57B894",
        discordText: [
          discordResult,
          `Wallet: ${fmt(user.money || 0)} • Orbs: ${user.orbs || 0} • Items: ${(user.inventory || []).length} • XP: +10.`,
          ...(diamondReward ? [`Gem bonus: +${diamondReward}.`] : []),
          ...(leveled ? [`Level up: ${user.level}.`] : []),
        ].join("\n"),
      },
    );
  },
};
