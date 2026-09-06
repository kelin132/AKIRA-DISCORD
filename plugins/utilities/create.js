import { ChannelType, PermissionFlagsBits } from "discord.js";
import { getDb } from "../../lib/mongo.mjs";

const MAX_TICKETS = 100;
const RESPONSE_TIMEOUT_MS = 30 * 60 * 1000;
const activeTimeouts = new Map();

function ticketNumberFromName(name) {
  const match = String(name || "").match(/^ticket ([1-9]\d{0,1}|100)$/i);
  return match ? Number(match[1]) : null;
}

function isModeratorMember(member) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return true;
  return member.roles?.cache?.some((role) =>
    /\b(?:mod|moderator|staff|admin|support)\b/i.test(role.name),
  ) || false;
}

function clearTicketTimeout(channelId) {
  const timer = activeTimeouts.get(channelId);
  if (timer) clearTimeout(timer);
  activeTimeouts.delete(channelId);
}

async function closeUnansweredTicket(client, ticket) {
  clearTicketTimeout(ticket.channelId);

  await getDb().collection("support_tickets").updateOne(
    { _id: ticket._id },
    { $set: { closedAt: new Date(), closeReason: "No moderator response within 30 minutes" } },
  ).catch(() => {});

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel?.deletable) {
    await channel.delete("Support ticket closed after 30 minutes without a moderator response").catch(() => {});
  }

  const role = channel?.guild?.roles?.cache?.get(ticket.roleId)
    || (channel?.guild?.roles?.fetch ? await channel.guild.roles.fetch(ticket.roleId).catch(() => null) : null);
  if (role?.deletable) {
    await role.delete("Temporary support ticket role cleanup").catch(() => {});
  }
}

function scheduleTicketTimeout(client, ticket) {
  clearTicketTimeout(ticket.channelId);
  const remaining = Math.max(
    0,
    RESPONSE_TIMEOUT_MS - (Date.now() - new Date(ticket.createdAt).getTime()),
  );
  const timer = setTimeout(async () => {
    const current = await getDb().collection("support_tickets").findOne({
      _id: ticket._id,
      closedAt: { $exists: false },
      respondedAt: { $exists: false },
    }).catch(() => null);
    if (current) await closeUnansweredTicket(client, current);
  }, remaining);
  timer.unref?.();
  activeTimeouts.set(ticket.channelId, timer);
}

function availableTicketNumber(guild) {
  const used = new Set(
    [...guild.channels.cache.values()]
      .map((channel) => ticketNumberFromName(channel.name))
      .filter(Boolean),
  );
  for (let number = 1; number <= MAX_TICKETS; number += 1) {
    if (!used.has(number)) return number;
  }
  return null;
}

function permissionOverwrites(guild, requesterId, ticketRoleId) {
  const entries = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: ticketRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const addMember = (member) => {
    if (!member?.id || entries.some((entry) => entry.id === member.id)) return;
    entries.push({
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  };

  addMember(guild.members.me);
  addMember(guild.members.cache.get(guild.ownerId));
  for (const member of guild.members.cache.values()) {
    if (isModeratorMember(member)) addMember(member);
  }

  return entries;
}

export default {
  name: "create",
  aliases: ["ticket", "support"],
  category: "utilities",
  description: "Create a private support ticket",
  usage: ".create",

  async run({ sock, msg, discord }) {
    const message = discord?.message;
    const jid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

    if (!message?.guild) return reply("❌ Support tickets can only be opened inside a Discord server.");
    if (!message.member) return reply("❌ I could not identify your server member account.");

    const guild = message.guild;
    const db = getDb();
    const existing = await db.collection("support_tickets").findOne({
      guildId: guild.id,
      requesterId: message.author.id,
      closedAt: { $exists: false },
    });
    if (existing) {
      const existingChannel = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (existingChannel) {
        scheduleTicketTimeout(discord.client, existing);
        return reply(`❌ You already have an open ticket: <#${existing.channelId}>`);
      }
      await db.collection("support_tickets").updateOne(
        { _id: existing._id },
        { $set: { closedAt: new Date(), closeReason: "Ticket channel no longer exists" } },
      );
    }

    const number = availableTicketNumber(guild);
    if (!number) {
      return reply("❌ All 100 support ticket slots are currently in use.");
    }

    const botMember = guild.members.me;
    if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels)
      || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return reply("❌ I need Manage Channels and Manage Roles permissions to create support tickets.");
    }

    let role;
    let channel;
    try {
      role = await guild.roles.create({
        name: `ticket ${number}`,
        reason: `Private support ticket for ${message.author.tag}`,
      });
      await message.member.roles.add(role, "Private support ticket access");

      channel = await guild.channels.create({
        name: `ticket ${number}`,
        type: ChannelType.GuildText,
        permissionOverwrites: permissionOverwrites(guild, message.author.id, role.id),
        reason: `Support ticket opened by ${message.author.tag}`,
      });
    } catch (error) {
      if (channel?.deletable) await channel.delete("Ticket setup failed").catch(() => {});
      if (role?.deletable) await role.delete("Ticket setup failed").catch(() => {});
      return reply(`❌ I could not create the support ticket: ${error.message}`);
    }

    const ticket = {
      guildId: guild.id,
      channelId: channel.id,
      roleId: role.id,
      number,
      requesterId: message.author.id,
      createdAt: new Date(),
    };
    const result = await db.collection("support_tickets").insertOne(ticket);
    scheduleTicketTimeout(discord.client, { ...ticket, _id: result.insertedId });

    await channel.send(
      `Support ticket opened for <@${message.author.id}>.\n` +
      "A moderator will respond here. This channel will close automatically if no moderator responds within 30 minutes.",
    );
    return reply(`✅ Your private support ticket is ready: <#${channel.id}>`);
  },

  async onDiscordMessage({ client, message }) {
    if (!message.guild || !message.channelId || !message.member || !isModeratorMember(message.member)) return;

    const db = getDb();
    const ticket = await db.collection("support_tickets").findOne({
      guildId: message.guild.id,
      channelId: message.channelId,
      closedAt: { $exists: false },
      respondedAt: { $exists: false },
    }).catch(() => null);
    if (!ticket || message.author.id === ticket.requesterId) return;

    clearTicketTimeout(ticket.channelId);
    await db.collection("support_tickets").updateOne(
      { _id: ticket._id },
      { $set: { respondedAt: new Date(), respondedBy: message.author.id } },
    );
  },
};