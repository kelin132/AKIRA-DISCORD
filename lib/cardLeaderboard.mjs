import { getDb } from "./mongo.mjs";
import { formatAnimeLeaderboard } from "./animeLeaderboard.mjs";
import { getCachedLeaderboard } from "./leaderboardCache.mjs";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function economyJid(user) {
  const raw = String(user.whatsappNumber || user.userId || "").trim();
  if (!raw) return "";
  const [number, server = "s.whatsapp.net"] = raw.split("@");
  return `${number.split(":")[0]}@${server}`;
}

async function resolveNames(db, rows) {
  const ids = rows
    .map((row) => economyJid(row.user))
    .filter(Boolean)
    .map(String);
  const economyDocs = ids.length
    ? await db.collection("users").find(
        { _id: { $in: ids } },
        { projection: { _id: 1, name: 1, registered: 1 } },
      ).toArray()
    : [];
  const economyNames = new Map(
    economyDocs
      .filter((doc) => doc.registered !== false && doc.name)
      .map((doc) => [String(doc._id), String(doc.name).trim()]),
  );

  return rows.map((row) => ({
    ...row,
    name: economyNames.get(economyJid(row.user))
      || String(row.user.username || row.user.userId || "Unknown").trim()
      || "Unknown",
  }));
}

export async function getCardLeaderboard(seriesQuery = "") {
  const cacheKey = normalize(seriesQuery);
  return getCachedLeaderboard(
    `cards:${cacheKey}`,
    () => loadCardLeaderboard(seriesQuery),
    { ttlMs: 60_000 },
  );
}

async function loadCardLeaderboard(seriesQuery = "") {
  const db = await getDb();
  const col = db.collection("mn_users");

  let seriesLabel = "";
  if (seriesQuery) {
    const query = normalize(seriesQuery);
    const seriesValues = (await col.distinct("cards.series"))
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    seriesLabel = seriesValues.find((value) => normalize(value) === query)
      || seriesValues.find((value) => normalize(value).includes(query) || query.includes(normalize(value)))
      || seriesQuery.trim();
  }

  let users;
  if (seriesLabel) {
    const pipeline = [
      { $match: { cards: { $exists: true, $type: "array", $ne: [] } } },
    ];
    pipeline.push({
      $project: {
        userId: 1,
        username: 1,
        whatsappNumber: 1,
        cards: {
          $filter: {
            input: "$cards",
            as: "card",
            cond: {
              $eq: [
                {
                  $toLower: {
                    $trim: { input: { $ifNull: ["$$card.series", ""] } },
                  },
                },
                normalize(seriesLabel),
              ],
            },
          },
        },
      },
    });
    pipeline.push(
      { $project: { userId: 1, username: 1, whatsappNumber: 1, total: { $size: "$cards" } } },
      { $match: { total: { $gt: 0 } } },
      { $sort: { total: -1, userId: 1 } },
      { $limit: 10 },
    );
    users = await col.aggregate(pipeline).toArray();
  } else {
    // New card users maintain totalCards, allowing the common leaderboard
    // query to sort by a scalar field instead of sizing every card array.
    users = await col.find(
      { totalCards: { $gt: 0 } },
      { projection: { userId: 1, username: 1, whatsappNumber: 1, totalCards: 1 } },
    ).sort({ totalCards: -1, userId: 1 }).limit(10).toArray();

    // Keep old installations with only a cards array working. This fallback
    // is only used when the indexed counter has not been populated yet.
    if (!users.length) {
      users = await col.aggregate([
        { $match: { cards: { $exists: true, $type: "array", $ne: [] } } },
        { $project: { userId: 1, username: 1, whatsappNumber: 1, total: { $size: "$cards" } } },
        { $sort: { total: -1, userId: 1 } },
        { $limit: 10 },
      ]).toArray();
    }
  }

  const namedRows = await resolveNames(db, users.map((user) => ({
    user,
    total: user.total ?? user.totalCards,
  })));

  return { rows: namedRows, seriesLabel };
}

export function formatCardLeaderboard({ rows, seriesLabel = "" }) {
  return formatAnimeLeaderboard({
    title: seriesLabel ? "LEADERBOARD" : "LEADERBOARD",
    subtitle: seriesLabel ? `𝐒𝐄𝐑𝐈𝐄𝐒 · ${seriesLabel.toUpperCase()}` : "ANIME CARD LEADERBOARD",
    rows: rows.map((row) => ({ name: row.name, value: row.total })),
    valueIcon: "🃏",
    valueLabel: "𝐂𝐀𝐑𝐃𝐒",
    footer: seriesLabel ? `🌸 𝐒𝐄𝐑𝐈𝐄𝐒 · ${seriesLabel.toUpperCase()} 𝐋𝐄𝐆𝐄𝐍𝐃𝐒` : "🌸 𝐀𝐍𝐈𝐌𝐄 𝐋𝐄𝐆𝐄𝐍𝐃𝐒",
  });
}
