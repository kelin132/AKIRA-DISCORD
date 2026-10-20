import test from "node:test";
import assert from "node:assert/strict";
import { refreshCommunityInvite } from "../lib/communityInvite.mjs";

function setupGuild({ invites = [], createdInvite = null } = {}) {
  const writes = [];
  const channel = {
    id: "channel-1",
    name: "general",
    type: 0,
    permissionsFor: () => ({ has: () => true }),
    createInvite: async (options) => {
      channel.createOptions = options;
      return createdInvite;
    },
  };
  const guild = {
    id: "guild-aidoru",
    name: "aidoru",
    systemChannelId: channel.id,
    channels: { cache: new Map([[channel.id, channel]]) },
    members: { me: { id: "bot-user" } },
    invites: { fetch: async () => new Map(invites.map((invite) => [invite.code, invite])) },
  };
  const collection = {
    findOne: async () => ({ _id: "community_links", discordInvite: "https://discord.gg/old", discordInviteCode: "old" }),
    updateOne: async (...args) => writes.push(args),
  };
  const client = {
    guilds: { cache: new Map([[guild.id, guild]]) },
    fetchInvite: async () => { throw new Error("expired"); },
  };
  return { client, guild, channel, collection, writes, database: { collection: () => collection } };
}

test("website link follows the newest active invite in the aidoru server", async () => {
  const older = {
    code: "older",
    url: "https://discord.gg/older",
    guild: { id: "guild-aidoru" },
    createdTimestamp: 10,
    channel: { id: "old-channel" },
  };
  const newest = {
    code: "newest",
    url: "https://discord.gg/newest",
    guild: { id: "guild-aidoru" },
    createdTimestamp: 20,
    channel: { id: "new-channel" },
  };
  const fixture = setupGuild({ invites: [older, newest] });
  const before = [
    process.env.DISCORD_COMMUNITY_GUILD_ID,
    process.env.DISCORD_COMMUNITY_INVITE_CODE,
  ];
  process.env.DISCORD_COMMUNITY_GUILD_ID = "";
  process.env.DISCORD_COMMUNITY_INVITE_CODE = "";
  try {
    assert.equal(
      await refreshCommunityInvite(fixture.client, {
        database: fixture.database,
        logger: () => {},
      }),
      newest.url,
    );
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0][1].$set.discordInvite, newest.url);
  } finally {
    if (before[0] === undefined) delete process.env.DISCORD_COMMUNITY_GUILD_ID;
    else process.env.DISCORD_COMMUNITY_GUILD_ID = before[0];
    if (before[1] === undefined) delete process.env.DISCORD_COMMUNITY_INVITE_CODE;
    else process.env.DISCORD_COMMUNITY_INVITE_CODE = before[1];
  }
});

test("creates and stores a permanent replacement when the server has no active invite", async () => {
  const replacement = {
    code: "fresh",
    url: "https://discord.gg/fresh",
    guild: { id: "guild-aidoru" },
    channel: { id: "channel-1" },
  };
  const fixture = setupGuild({ createdInvite: replacement });
  const before = [
    process.env.DISCORD_COMMUNITY_GUILD_ID,
    process.env.DISCORD_COMMUNITY_INVITE_CODE,
  ];
  process.env.DISCORD_COMMUNITY_GUILD_ID = "";
  process.env.DISCORD_COMMUNITY_INVITE_CODE = "";
  try {
    assert.equal(
      await refreshCommunityInvite(fixture.client, {
        database: fixture.database,
        logger: () => {},
      }),
      replacement.url,
    );
    assert.equal(fixture.channel.createOptions.maxAge, 0);
    assert.equal(fixture.channel.createOptions.maxUses, 0);
    assert.equal(fixture.writes.length, 1);
  } finally {
    if (before[0] === undefined) delete process.env.DISCORD_COMMUNITY_GUILD_ID;
    else process.env.DISCORD_COMMUNITY_GUILD_ID = before[0];
    if (before[1] === undefined) delete process.env.DISCORD_COMMUNITY_INVITE_CODE;
    else process.env.DISCORD_COMMUNITY_INVITE_CODE = before[1];
  }
});
