/**
 * .staffs
 * List all staff members and their ranks.
 */
import { getStaffMembers } from "../economy/database.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.mjs";
import { normalizeOwnerNumbers, normalizeOwnerPhone } from "../../lib/ownerIdentity.mjs";

const LEVEL_NAMES = { 1: "🔧 Mod", 2: "🛡️ Staff", 3: "👑 Owner", 99: "👑 Owner" };

function normalizeAccountId(value) {
  return String(value || "").trim().replace(/^discord:/, "").split("@")[0].split(":")[0];
}

function isBotAccount(user, botId) {
  return Boolean(botId) &&
    normalizeAccountId(user._id || user.jid || user.userId) === botId;
}

export default {
  name: "staffs",
  description: "List all staff members",
  category: "staff",
  usage: ".staffs",
  aliases: ["stafflist", "staffmembers"],

  async run({ sock, msg }) {
    const jid    = msg.key.remoteJid;
    const botId = normalizeAccountId(sock.user?.id);
    const ownerNumbers = normalizeOwnerNumbers(
      process.env.OWNER_NUMBERS,
      process.env.OWNER_NUMBER,
      getRuntimeSettings().ownerNumber,
    );
    const ownerNumberSet = new Set(ownerNumbers);
    const list = (await getStaffMembers()).filter((user) => !isBotAccount(user, botId));
    const staffList = list.filter((user) =>
      !ownerNumberSet.has(normalizeOwnerPhone(user._id || user.jid || user.userId)),
    );

    if (ownerNumbers.length === 0 && staffList.length === 0) {
      return sock.sendMessage(jid, {
        text: "📋 *Staff List*\n\nNo staff members found."
      }, { quoted: msg });
    }

    // Sort by level descending
    staffList.sort((a, b) => (b.staffLevel || 0) - (a.staffLevel || 0));

    const rows = staffList.map((u, i) => {
      const rank = LEVEL_NAMES[u.staffLevel] || "Unknown";
      const num  = u._id?.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") || "?";
      return [
        `╭─❖ *${i + 1}. ${u.name || "Unknown"}*`,
        `│ 📱 Number: +${num}`,
        `│ ${rank}`,
        "╰──────────────",
      ].join("\n");
    });
    const ownerRows = ownerNumbers.map((number) => {
      const owner = list.find((user) =>
        normalizeOwnerPhone(user._id || user.jid || user.userId) === number,
      );
      return `│ 👑 ${owner?.name ? `${owner.name} ─ ` : ""}+${number}`;
    });

    await sock.sendMessage(jid, {
      text:
        `╭━━━〔 🛡️ *STAFF MEMBERS* 〕━━━╮\n` +
        `│ 👥 Members: *${ownerNumbers.length + staffList.length}*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `👑 *OWNERS*\n${ownerRows.length ? ownerRows.join("\n") : "│ None configured"}\n\n` +
        `🛡️ *STAFF & MODS*\n${rows.length ? rows.join("\n\n") : "No staff or mods found."}`
    }, { quoted: msg });
  }
};
