import { getUser, requireRegistration } from "./database.js";
import { sendEconomyReply } from "../../lib/discordEconomyReply.mjs";

const COOLDOWNS = [
  { key: "lastWork",    label: "work",    ms: 10 * 60 * 1000 },
  { key: "lastCrime",   label: "crime",   ms: 20 * 60 * 1000 },
  { key: "lastRob",     label: "rob",     ms: 45 * 60 * 1000 },
  { key: "lastDig",     label: "dig",     ms: 10 * 1000 },
  { key: "lastFish",    label: "fish",    ms: 10 * 1000 },
  { key: "lastGamble",  label: "gamble",  ms:  5 * 60 * 1000 },
  { key: "lastBet",     label: "bet",     ms: 30 * 1000 },
  { key: "lastBeg",     label: "beg",     ms:  3 * 60 * 1000 },
  { key: "lastSlots",   label: "slots",   ms: 15 * 1000 },
  { key: "lastScratch", label: "scratch", ms: 10 * 1000 },
];

function fmtRemaining(ms) {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000)  / 60_000);
  const s = Math.floor((ms % 60_000)     / 1000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

export default {
  name: "mycds",
  aliases: ["cooldown", "cooldowns", "cds", "timers"],
  category: "economy",
  discordPlainText: true,
  description: "View all your remaining cooldowns at a glance",
  usage: ".mycds",

  async run({ sock, msg, sender, discord }) {
    if (!await requireRegistration(sock, msg, sender)) return;

    const user = await getUser(sender);
    const now  = Date.now();
    const active = [];

    for (const cd of COOLDOWNS) {
      const last = user[cd.key] || 0;
      const rem  = cd.ms - (now - last);
      if (rem > 0) active.push(`${cd.label} - ${fmtRemaining(rem)}`);
    }

    const text = active.length
      ? active.join("\n")
      : "All your cooldowns are ready to go.";

    await sendEconomyReply({
      sock,
      jid: msg.key.remoteJid,
      msg,
      discord,
      text,
      title: "Cooldowns",
      color: "#7C83FD",
      simpleText: text,
      mentions: [sender],
      footer: "AIDORU • Active cooldowns only",
    });
  },
};