import { getDb } from "./mongo.mjs";
import { formatAnimeLeaderboard } from "./animeLeaderboard.mjs";
import { getCachedLeaderboard } from "./leaderboardCache.mjs";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function resolveNames(db, rows) {
  const ids = rows
    .map((row) => row.user.whatsappNumber)
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
    name: economyNames.get(String(row.user.whatsappNumber || ""))
      || String(row.user.username || row.user.userId || "Unknown").trim()
      || "Unknown",
  }));
}

export async function getCardLeaderboard(seriesQuery = "") {
  const cacheKey = `cards:${normalize(seriesQuery) || "all"}`;
  return getCachedLeaderboard(cacheKey, async () => {
    const db = await getDb();
    const col = db.collection("mn_users");

    let seriesLabel = "";
    if (seriesQuery) {
      const query = normalize(seriesQuery);
      const seriesDocs = await col.aggregate([
        { $unwind: "$cards" },
        { $group: { _id: { $ifNull: ["$cards.series", "Unknown"] } } },
        { $project: { _id: 0, label: "$_id" } },
      ]).toArray();
      const exact = seriesDocs.find((doc) => normalize(doc.label) === query);
      const partial = seriesDocs.find((doc) => {
        const label = normalize(doc.label);
        return label.includes(query) || query.includes(label);
      });
      seriesLabel = exact?.label || partial?.label || seriesQuery.trim();
    }

    const cardCount = seriesLabel
      ? {
          $size: {
            $filter: {
              input: { $ifNull: ["$cards", []] },
              as: "card",
              cond: {
                $eq: [
                  { $toLower: { $ifNull: ["$$card.series", "unknown"] } },
                  normalize(seriesLabel),
                ],
              },
            },
          },
        }
      : { $size: { $ifNull: ["$cards", []] } };

    const rows = await col.aggregate([
      { $match: { "cards.0": { $exists: true } } },
      {
        $project: {
          userId: 1,
          whatsappNumber: 1,
          username: 1,
          cardCount,
        },
      },
      { $match: { cardCount: { $gt: 0 } } },
      { $sort: { cardCount: -1, userId: 1 } },
      { $limit: 10 },
    ]).toArray();

    const namedRows = await resolveNames(db, rows.map((user) => ({
      user,
      total: Number(user.cardCount || 0),
    })));

    return { rows: namedRows, seriesLabel };
  });
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
