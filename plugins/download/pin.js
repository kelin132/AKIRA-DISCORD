/**
 * KELIN MD — .pinterest command
 * Searches Pinterest by keyword and sends a fetched image.
 * No links needed — just type words!
 */

import { get, searchGet, davidGet } from "../../lib/gifted.js";

// ─── Image search helpers ─────────────────────────────────────────────────────

const IMAGE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://www.pinterest.com/",
};

function resultItems(data) {
  const containers = [
    data?.results,
    data?.data,
    data?.images,
    data?.result,
    Array.isArray(data) ? data : null,
  ];

  return containers
    .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((item) => Array.isArray(item) ? item : [item]);
}

function imageUrlFrom(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;

  // Prefer high-resolution or original fields first.
  const nested =
    item.images?.orig?.url ||
    item.images?.original?.url ||
    item.image?.url ||
    item.image?.src ||
    item.original?.url;

  const url = nested ||
    item.url ||
    item.image ||
    item.image_url ||
    item.thumbnail ||
    item.src ||
    item.media_url ||
    item.download_url ||
    null;

  if (!url || typeof url !== "string") return null;

  // Filter out common "wrong" or low-quality patterns.
  const lower = url.toLowerCase();
  if (
    lower.includes("favicon") ||
    lower.includes("logo") ||
    lower.includes("icon") ||
    lower.includes("avatar") ||
    /\/(?:small|thumb|100x100|50x50)\//.test(lower)
  ) {
    return null;
  }

  return url;
}

async function scrapePinterest(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const url = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${encodeURIComponent(query)}&data=%7B%22options%22%3A%7B%22isPrefetch%22%3Afalse%2C%22query%22%3A%22${encodeURIComponent(query)}%22%2C%22scope%22%3A%22pins%22%2C%22no_fetch_context_on_resource%22%3Afalse%7D%2C%22context%22%3A%7B%7D%7D&_=1714450000000`;
    const res = await fetch(url, { headers: IMAGE_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`Pinterest HTTP ${res.status}`);
    const json = await res.json();
    const items = json?.resource_response?.data?.results || [];
    return items.map(i => i.images?.orig?.url || i.images?.["736x"]?.url).filter(Boolean);
  } catch (err) {
    console.error("Pinterest scrape failed:", err.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function* searchPinterestImages(query) {
  const seen = new Set();

  // Try direct scrape first
  const scraped = await scrapePinterest(query);
  const scrapedUrls = [];
  for (const url of scraped) {
    if (!seen.has(url)) {
      seen.add(url);
      scrapedUrls.push(url);
    }
  }
  if (scrapedUrls.length) yield scrapedUrls.slice(0, 4);

  const attempts = [
    () => searchGet("pinterest",   { query }, 8_000),
    () => get("/search/pinterest", { query }, 8_000),
    () => davidGet("/search/pinterest", { query }, 8_000),
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const urls = [];
      for (const item of resultItems(data)) {
        const url = imageUrlFrom(item);
        if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
      }
      if (urls.length) yield urls.slice(0, 4);
    } catch { /* try next */ }
  }
}
export { searchPinterestImages };

async function downloadImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(url, {
      headers: IMAGE_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 15 * 1024 * 1024) throw new Error("image too large");

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
      throw new Error("invalid image size");
    }

    const isImage = contentType.startsWith("image/")
      || buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" // PNG
      || buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) // JPEG
      || buffer.subarray(0, 6).toString() === "GIF89a"
      || buffer.subarray(0, 6).toString() === "GIF87a"
      || buffer.subarray(0, 4).toString() === "RIFF"; // WebP
    if (!isImage) throw new Error("not an image");

    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export default {
  name: "pinterest",
  description: "Search Pinterest images by keyword",
  category: "search",
  usage: ".pinterest <keywords>",
  aliases: ["pin", "pinsearch"],
  cooldown: 8,

  async run({ sock, msg, text }) {
    const jid = msg.key.remoteJid;

    if (!text) {
      return sock.sendMessage(jid, {
        text:
`📌 *Pinterest Image Search*

Usage: *.pinterest <keywords>*

Examples:
• *.pinterest anime wallpaper*
• *.pinterest sakura art*
• *.pinterest demon slayer*`,
      }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, {
        text: `🔍 Searching Pinterest for *"${text}"*...`,
      }, { quoted: msg });

      let sent = 0;
      for await (const imageUrls of searchPinterestImages(text)) {
        let providerSent = 0;
        for (const imageUrl of imageUrls.slice(0, 2)) {
          try {
            const image = await downloadImage(imageUrl);
            await sock.sendMessage(jid, { image }, { quoted: msg });
            sent++;
            providerSent++;
          } catch (error) {
            console.warn(`[pinterest] skipped image: ${error.message}`);
          }
        }
        if (providerSent) break;
      }

      if (!sent) {
        await sock.sendMessage(jid, {
          text: "❌ No usable Pinterest images found.",
        }, { quoted: msg });
      }

    } catch (err) {
      await sock.sendMessage(jid, {
        text: `❌ ${err.message}`,
      }, { quoted: msg });
    }
  },
};
