// Stable Twemoji thumbnails keep economy embeds compact without shipping
// another binary asset with every bot deployment.
const TWEMOJI_BASE =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";

export const ECONOMY_THUMBNAILS = Object.freeze({
  fish: `${TWEMOJI_BASE}/1f41f.png`,
  dig: `${TWEMOJI_BASE}/1fa93.png`,
  daily: `${TWEMOJI_BASE}/1f381.png`,
});