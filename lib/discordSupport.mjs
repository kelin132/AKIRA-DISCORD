// Commands in this list depend on WhatsApp-only message formats, JIDs, or
// background events that are not available to the Discord companion.
export const DISCORD_UNSUPPORTED_COMMANDS = new Set([
  "add",
  "antibadword",
  "antilink",
  "antimention",
  "antispam",
  "bot",
  "cardspawn",
  "dbzchallenge",
  "dbzreset",
  "dbzspawn",
  "gstatus",
  "goodbye",
  "groupsettings",
  "leave",
  "setgoodbye",
  "setwelcome",
  "sticker",
  "otp",
  "pokespawn",
  "reqbot",
  "setpokes",
  "shazam",
  "support",
  "vv",
  "warn",
  "welcome",
]);

export function isDiscordSupported(plugin) {
  return plugin?.discord !== false &&
    !DISCORD_UNSUPPORTED_COMMANDS.has(String(plugin?.name || "").toLowerCase());
}