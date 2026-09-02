import { groupSettings } from "./groupSettings.js";

export function discordSettingsKey(guildId) {
  return `discord:${guildId}`;
}

function canManageServer(member) {
  return Boolean(
    member?.permissions?.has?.("Administrator") ||
    member?.permissions?.has?.("ManageGuild"),
  );
}

function renderTemplate(template, { member, guild, count }) {
  return String(template)
    .replace(/@user/gi, `<@${member.id}>`)
    .replace(/@group/gi, guild.name)
    .replace(/@count/gi, String(count));
}

async function findConfiguredChannel(guild, channelId) {
  if (channelId) {
    const configured = await guild.channels.fetch(channelId).catch(() => null);
    if (configured?.isTextBased?.()) return configured;
  }

  if (guild.systemChannel?.isTextBased?.()) return guild.systemChannel;
  return guild.channels.cache.find((channel) => channel.isTextBased?.()) || null;
}

export async function handleDiscordAntiLink(message) {
  if (!message?.guild || message.author?.bot || !message.content) return false;

  const settings = groupSettings.get(discordSettingsKey(message.guild.id));
  if (!settings?.antilink || canManageServer(message.member)) return false;

  const linkPattern = /(?:https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)[^\s]+/i;
  if (!linkPattern.test(message.content)) return false;

  await message.delete().catch(() => {});
  const action = settings.antilinkAction || "delete";

  if (action === "kick") {
    await message.member?.kick("Anti-link protection").catch(() => {});
    return true;
  }

  if (action === "warn") {
    const warnings = { ...(settings.discordLinkWarns || {}) };
    const count = (Number(warnings[message.author.id]) || 0) + 1;
    const limit = Number(settings.antilinkMaxWarns) || 3;
    warnings[message.author.id] = count;
    groupSettings.set(discordSettingsKey(message.guild.id), { discordLinkWarns: warnings });

    if (count >= limit) {
      await message.member?.kick("Anti-link warning limit reached").catch(() => {});
      return true;
    }

    await message.channel.send(
      `⚠️ <@${message.author.id}> link warning ${count}/${limit}. Links are not allowed here.`,
    ).catch(() => {});
  }

  return true;
}

export async function handleDiscordMemberJoin(member) {
  const settings = groupSettings.get(discordSettingsKey(member.guild.id));
  if (!settings?.welcomeEnabled) return;

  const channel = await findConfiguredChannel(member.guild, settings.welcomeChannelId);
  if (!channel) return;

  const text = renderTemplate(
    settings.welcome || "Welcome @user to **@group**! You are member **@count**.",
    { member, guild: member.guild, count: member.guild.memberCount },
  );
  await channel.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
}

export async function handleDiscordMemberLeave(member) {
  const settings = groupSettings.get(discordSettingsKey(member.guild.id));
  if (!settings?.goodbyeEnabled) return;

  const channel = await findConfiguredChannel(member.guild, settings.goodbyeChannelId);
  if (!channel) return;

  const text = renderTemplate(
    settings.goodbye || "Goodbye @user. We will miss you in **@group**.",
    { member, guild: member.guild, count: member.guild.memberCount },
  );
  await channel.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
}