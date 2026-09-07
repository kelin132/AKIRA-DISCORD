import { resolveDiscordAccount } from "../accountLink.mjs";
import { resolveLid } from "../permissions.mjs";

export async function resolveChallengeTargetJid({ jid, sock, chatJid }) {
  const value = String(jid || "").trim();
  if (!value) return null;

  if (value.startsWith("discord:")) {
    const discordId = value.slice("discord:".length).split("@", 1)[0];
    const linkedAccount = await resolveDiscordAccount(discordId).catch(() => null);
    return linkedAccount || value;
  }

  if (value.endsWith("@lid")) {
    const digits = await resolveLid(value, sock, chatJid);
    return digits ? `${digits}@s.whatsapp.net` : null;
  }

  return value;
}

export function challengeMentionJid(rawJid, resolvedJid) {
  return String(rawJid || "").startsWith("discord:")
    ? rawJid
    : resolvedJid;
}

export function challengeTargetLabel(resolvedJid, mentionJid = resolvedJid) {
  const value = String(mentionJid || resolvedJid || "");
  if (value.startsWith("discord:")) {
    return `@${value.slice("discord:".length).split("@", 1)[0]}`;
  }
  return `@${String(resolvedJid || value).split("@", 1)[0].split(":", 1)[0]}`;
}