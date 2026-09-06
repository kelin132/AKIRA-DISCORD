import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { groupSettings } from "./groupSettings.js";
import { AIDORU_COLORS, AIDORU_FOOTER } from "./discordTheme.mjs";

const AIDORU_SITE = "https://aidoru.zone.id";

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
    .replace(/@count/gi, String(count))
    .replace(/\{br\}/gi, "\n\n")
    .replace(/\\n/g, "\n")
    .replace(/@pp/gi, "")
    .replace(/@gp/gi, "")
    .trim();
}

function memberAvatar(member) {
  return member.displayAvatarURL?.({ extension: "png", size: 512, forceStatic: true }) || null;
}

function guildIcon(guild) {
  return guild.iconURL?.({ extension: "png", size: 512, forceStatic: true }) || null;
}

function welcomeEmbed({ member, text, imageMode }) {
  const avatar = memberAvatar(member);
  const icon = guildIcon(member.guild);
  const embed = new EmbedBuilder()
    .setColor("#9b87f5")
    .setTitle(`👋 Welcome, ${member.displayName || member.user.username}!`)
    .setDescription(text)
    .setThumbnail(imageMode === "group" ? (icon || avatar) : avatar)
    .setFooter({ text: `${member.guild.name} • Member ${member.guild.memberCount}` });

  if (imageMode === "group" && icon) embed.setImage(icon);
  return embed;
}

function goodbyeEmbed({ member, text, imageMode }) {
  const avatar = memberAvatar(member);
  const icon = guildIcon(member.guild);
  const embed = new EmbedBuilder()
    .setColor("#6f6b85")
    .setTitle(`👋 Goodbye, ${member.displayName || member.user.username}`)
    .setDescription(text)
    .setThumbnail(imageMode === "group" ? (icon || avatar) : avatar)
    .setFooter({ text: `${member.guild.name} • ${member.guild.memberCount} members` });

  if (imageMode === "group" && icon) embed.setImage(icon);
  return embed;
}

function aidoruWelcomeEmbed(member) {
  const icon = guildIcon(member.guild);
  const embed = new EmbedBuilder()
    .setColor(AIDORU_COLORS.default)
    .setTitle("✦ Welcome to AIDORU")
    .setDescription([
      `Welcome to **${member.guild.name}**, ${member}!`,
      "",
      "AIDORU connects your Discord experience to the anime-powered trainer world.",
      "Already have a WhatsApp trainer? Link it. New here? Register your AIDORU account.",
    ].join("\n"))
    .setFooter(AIDORU_FOOTER);

  if (icon) embed.setThumbnail(icon);
  return embed;
}

function aidoruWelcomeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Link")
      .setStyle(ButtonStyle.Link)
      .setURL(`${AIDORU_SITE}/?discord=login`),
    new ButtonBuilder()
      .setLabel("Register")
      .setStyle(ButtonStyle.Link)
      .setURL(`${AIDORU_SITE}/?discord=register`),
  );
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
  if (settings?.welcomeEnabled) {
    const channel = await findConfiguredChannel(member.guild, settings.welcomeChannelId);
    if (channel) {
      const template = settings.welcome || [
        `Welcome, <@${member.id}>! 🎉`,
        "",
        `We now have **${member.guild.memberCount} members**.`,
        "",
        "• Please read the rules.",
        "• Be respectful and have fun.",
        "• Invite your friends!",
      ].join("\n");
      const text = renderTemplate(
        template,
        { member, guild: member.guild, count: member.guild.memberCount },
      );
      const imageMode = settings.welcomeImage
        || (settings.welcome && /@gp/i.test(settings.welcome)
          ? "group"
          : settings.welcome && /@pp/i.test(settings.welcome) ? "member" : "none");
      const useCard = settings.welcomeCard || ["member", "group"].includes(imageMode);
      await channel.send(useCard
        ? {
            content: `Welcome, <@${member.id}>!`,
            embeds: [welcomeEmbed({ member, text, imageMode })],
            allowedMentions: { users: [member.id] },
          }
        : {
            content: text,
            allowedMentions: { users: [member.id] },
          }).catch(() => {});
    }
  }

  await member.send({
    embeds: [aidoruWelcomeEmbed(member)],
    components: [aidoruWelcomeButtons()],
  }).catch((error) => {
    console.warn(`[discord] could not DM new member ${member.id}: ${error.message}`);
  });
}

export async function handleDiscordMemberLeave(member) {
  const settings = groupSettings.get(discordSettingsKey(member.guild.id));
  if (!settings?.goodbyeEnabled) return;

  const channel = await findConfiguredChannel(member.guild, settings.goodbyeChannelId);
  if (!channel) return;

  const template = settings.goodbye || [
    "A member has left the server.",
    "",
    "Goodbye, @user. We will miss you.",
    "Take care and come back soon. 🙏",
  ].join("\n");
  const text = renderTemplate(
    template,
    { member, guild: member.guild, count: member.guild.memberCount },
  );
  const imageMode = settings.goodbyeImage
    || (settings.goodbye && /@gp/i.test(settings.goodbye)
      ? "group"
      : settings.goodbye && /@pp/i.test(settings.goodbye) ? "member" : "none");
  const useCard = ["member", "group"].includes(imageMode);
  await channel.send(useCard
    ? {
        content: `Goodbye, <@${member.id}>`,
        embeds: [goodbyeEmbed({ member, text, imageMode })],
        allowedMentions: { users: [member.id] },
      }
    : {
        content: text,
        allowedMentions: { users: [member.id] },
      }).catch(() => {});
}