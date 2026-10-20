import { getDb } from "./mongo.mjs";
import { log } from "./logger.mjs";

const CONFIG_ID = "community_links";
const REFRESH_INTERVAL_MS = 15 * 60_000;

function inviteCode(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)?([a-zA-Z0-9-]{2,})\/?$/i);
  return match?.[1] || "";
}

function isInviteForGuild(invite, guildId) {
  return Boolean(invite?.code && invite.guild?.id === guildId);
}

async function storeInvite(collection, guild, channel, invite) {
  await collection.updateOne(
    { _id: CONFIG_ID },
    {
      $set: {
        discordInvite: invite.url,
        discordInviteCode: invite.code,
        discordInviteUpdatedAt: new Date(),
        discordGuildId: guild.id,
        discordGuildName: guild.name,
        discordInviteChannelId: channel?.id ?? invite.channel?.id ?? null,
      },
    },
    { upsert: true },
  );
  return invite.url;
}

function selectInviteChannel(guild) {
  const configuredId = process.env.DISCORD_COMMUNITY_CHANNEL_ID?.trim();
  if (configuredId) {
    const channel = guild.channels.cache.get(configuredId);
    if (channel && (channel.type === 0 || channel.type === 5)) return channel;
    return null;
  }

  const candidates = [...guild.channels.cache.values()]
    .filter((channel) => channel.type === 0 || channel.type === 5)
    .sort((left, right) => {
      const leftSystem = left.id === guild.systemChannelId ? 0 : 1;
      const rightSystem = right.id === guild.systemChannelId ? 0 : 1;
      return leftSystem - rightSystem || left.name.localeCompare(right.name);
    });
  return candidates.find((channel) =>
    channel.permissionsFor(guild.members.me)?.has("CreateInstantInvite"),
  ) ?? null;
}

/**
 * Publish the current invite for the Discord server named "aidoru".
 * A configured invite code is treated as the server's canonical invite. If
 * none is configured, the newest valid server invite is used; when all are
 * gone, create a permanent invite if the bot has permission.
 */
export async function refreshCommunityInvite(client, {
  database = getDb(),
  logger = log,
} = {}) {
  const configuredGuildId = process.env.DISCORD_COMMUNITY_GUILD_ID?.trim();
  const guildCache = client.guilds.cache;
  const guild = configuredGuildId
    ? guildCache.get(configuredGuildId)
    : [...guildCache.values()].find((candidate) => candidate.name.trim().toLowerCase() === "aidoru");
  if (!guild) {
    logger("warn", "Community invite sync: the configured aidoru server is not available to this bot.");
    return null;
  }

  const collection = database.collection("site_public_config");
  const current = await collection.findOne({ _id: CONFIG_ID });
  const canonicalCode = inviteCode(process.env.DISCORD_COMMUNITY_INVITE_CODE);
  let validInvite = null;

  if (canonicalCode) {
    try {
      const fetched = await client.fetchInvite(canonicalCode);
      if (isInviteForGuild(fetched, guild.id)) validInvite = fetched;
    } catch {
      // A stale canonical code falls through to the server's live invite list.
    }
  }

  if (!validInvite) {
    try {
      const liveInvites = await guild.invites.fetch();
      const candidates = [...liveInvites.values()]
        .filter((invite) => isInviteForGuild(invite, guild.id))
        .sort((left, right) => (right.createdTimestamp ?? 0) - (left.createdTimestamp ?? 0));
      validInvite = candidates[0] ?? null;
    } catch {
      const savedCode = inviteCode(current?.discordInviteCode ?? current?.discordInvite);
      if (savedCode) {
        try {
          const fetched = await client.fetchInvite(savedCode);
          if (isInviteForGuild(fetched, guild.id)) validInvite = fetched;
        } catch {
          // A revoked or expired website link is replaced below.
        }
      }
    }
  }

  if (validInvite) {
    const savedUrl = current?.discordInvite;
    if (savedUrl !== validInvite.url || current?.discordGuildId !== guild.id) {
      await storeInvite(collection, guild, validInvite.channel, validInvite);
    }
    return validInvite.url;
  }

  const channel = selectInviteChannel(guild);
  if (!channel) {
    logger("warn", "Community invite sync: no text channel with Create Instant Invite permission was found.");
    return typeof current?.discordInvite === "string" ? current.discordInvite : null;
  }

  try {
    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: true,
      reason: "Keep the AIDORU website community invite current",
    });
    const url = await storeInvite(collection, guild, channel, invite);
    logger("info", "Community invite sync: published the current aidoru Discord invite.");
    return url;
  } catch (error) {
    logger("warn", `Community invite sync: invite creation failed (${error?.name || "Error"}).`);
    return typeof current?.discordInvite === "string" ? current.discordInvite : null;
  }
}

export function startCommunityInviteSync(client, options = {}) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await refreshCommunityInvite(client, options);
    } catch (error) {
      (options.logger ?? log)("warn", `Community invite sync unavailable (${error?.name || "Error"}).`);
    } finally {
      busy = false;
    }
  };

  if (client.isReady?.()) void run();
  else client.once?.("clientReady", run);
  const timer = setInterval(() => void run(), REFRESH_INTERVAL_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    client.removeListener?.("clientReady", run);
  };
}
