import { getUser, saveUser, requireRegistration, addHistory, checkLevelUp } from "./database.js";
import { FISH_LOOT, SHOP_ITEMS, rollLoot } from "./_items.js";
import { sendEconomyReply } from "../../lib/discordEconomyReply.mjs";
import { compactMoney } from "../../lib/compactMoney.mjs";
import { ECONOMY_THUMBNAILS } from "../../lib/economyEmbed.mjs";

const COOLDOWN = 10 * 1000; // 10 seconds

function fmt(n) {
  return compactMoney(n);
}

export default {
  name: "fish",
  aliases: ["fishing"],
  category: "economy",
  description: "Go fishing for cash, items, or orbs",
  usage: ".fish",
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
      title: options.title || "🎣 Fishing",
      color: options.color || "#3498DB",
      fields: options.fields || [],
      discordText: options.discordText,
      thumbnail: ECONOMY_THUMBNAILS.fish,
      mentions: [sender],
    });
    const now   = Date.now();

    const user = await getUser(sender);

    if (now - (user.lastFish || 0) < COOLDOWN) {
      const rem  = COOLDOWN - (now - user.lastFish);
      const secs = Math.ceil(rem / 1000);
      return reply(
        `╭─❀「 🎣 *𝐅𝐈𝐒𝐇* 」❀─╮
│ ⏳ *Result*  :: *WAITING 🔴*
│ 🍃 *Flavour* :: _魚がまだ食いついてない..._
│
│ 🕐 *Next*    :: *${secs}s remaining*
╰───────────────❀`,
        { discordText: `🎣 You can fish again in ${secs}s.` },
      );
    }

    const loot    = rollLoot(FISH_LOOT);
    user.lastFish = now;

    let resultLine = "";
    let discordResult = "";
    let resultType = "";

    if (loot.type === "cash") {
      const amount  = Math.floor(Math.random() * (loot.max - loot.min + 1)) + loot.min;
      user.money    = (user.money || 0) + amount;
      await addHistory(sender, "fish", amount, `Caught $${amount.toLocaleString()} worth of fish`);
      resultLine = `🐟 Sold your catch for *${fmt(amount)}*!`;
      discordResult = `You fished and sold your catch for ${fmt(amount)}.`;
      resultType = `+${fmt(amount)}`;
    } else if (loot.type === "item") {
      user.inventory = user.inventory || [];
      user.inventory.push(loot.name);
      const def  = SHOP_ITEMS[loot.name];
      resultLine = `${def?.emoji || "📦"} Reeled in a *${loot.name}*!`;
      discordResult = `You fished and reeled in ${loot.name}.`;
      resultType = loot.name;
      await addHistory(sender, "fish", 0, `Fished up ${loot.name}`);
    } else if (loot.type === "orbs") {
      const amount  = Math.floor(Math.random() * (loot.max - loot.min + 1)) + loot.min;
      user.orbs     = (user.orbs || 0) + amount;
      resultLine    = `🔮 Pulled up *${amount} orb(s)* from the deep!`;
      discordResult = `You fished and pulled up ${amount} orb(s).`;
      resultType    = `+${amount} orbs`;
      await addHistory(sender, "fish", 0, `Fished up ${amount} orbs`);
    } else {
      resultLine = "🪣 You caught a boot. Classic.";
      discordResult = "You fished but caught a boot. Classic.";
      resultType = "Nothing";
    }

    user.xp = (user.xp || 0) + 8;
    const { leveled, newLevel } = checkLevelUp(user);
    await saveUser(sender, user);

    const castMessages = [
      "🎣 You cast your line into the water...",
      "🎣 You wait patiently at the riverbank...",
      "🎣 The bobber dips below the surface...",
      "🎣 You feel a tug on the line...",
    ];
    const flavour = castMessages[Math.floor(Math.random() * castMessages.length)];

    return reply(
`╭─❀「 🎣 *𝐅𝐈𝐒𝐇* 」❀─╮
│ 🌙 *Result*  :: *${resultType}*
│ 🍃 *Flavour* :: _${flavour}_
│
│ ${resultLine}
│
│ 💰 *Cash*    :: *${fmt(user.money || 0)}*
│ 🔮 *Orbs*    :: *${user.orbs || 0}*
│ 🎒 *Items*   :: *${(user.inventory || []).length}*
│ ⭐ *XP*      :: *+8*${leveled ? `\n│\n│ 🎉 *LEVEL UP!* — Now Level ${user.level}` : ""}
╰───────────────❀`,
      {
        color: leveled ? "#F1C40F" : "#3498DB",
        discordText: [
          discordResult,
          `Wallet: ${fmt(user.money || 0)} • Orbs: ${user.orbs || 0} • Items: ${(user.inventory || []).length} • XP: +8.`,
          ...(leveled ? [`Level up: ${user.level}.`] : []),
        ].join("\n"),
      },
    );
  },
};
