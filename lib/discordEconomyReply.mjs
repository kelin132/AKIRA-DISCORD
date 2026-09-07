function compactDescription(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^[\s│║|]+/, "")
      .replace(/[│║|]\s*$/, "")
      .trim())
    .filter((line) => line && !/^[╭╰┌└┐┘]/.test(line) && !/^[─━═❀]+$/.test(line))
    .join("\n")
    .replace(/\s*::\s*/g, ": ");
}

export function flattenEconomyText(value) {
  return compactDescription(value).replace(/\s+/g, " ").trim();
}

export function sendEconomyReply({
  sock,
  jid,
  msg,
  discord,
  text,
  title,
  color = "#FFD166",
  mentions = [],
  footer = "AIDORU • Economy",
  fields = [],
  simpleText = null,
  discordText = null,
  discordFields = null,
  thumbnail = null,
}) {
  if (discord?.message) {
    if (simpleText !== null) {
      return sock.sendMessage(jid, { text: simpleText, mentions }, { quoted: msg });
    }

    return sock.sendMessage(jid, {
      discordEmbed: {
        title,
        description: compactDescription(discordText ?? text),
        color,
        ...((discordFields ?? fields).length ? { fields: discordFields ?? fields } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        footer: { text: footer },
      },
      mentions,
    }, { quoted: msg });
  }

  return sock.sendMessage(jid, { text, mentions }, { quoted: msg });
}