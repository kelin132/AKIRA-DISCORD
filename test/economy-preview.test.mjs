import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEconomyLinkPreview,
  getEconomyPreviewConfig,
} from "../lib/economyPreview.mjs";
import { toDiscordPayload } from "../lib/discordPayload.mjs";

test("daily rewards use the AIDORU destination", async () => {
  const url = "https://aidoru.zone.id/journey";
  const config = getEconomyPreviewConfig("daily");
  const preview = await buildEconomyLinkPreview("daily");

  assert.equal(config?.url, url);
  assert.equal(preview?.["canonical-url"], url);
  assert.equal(preview?.["matched-text"], url);
  assert.ok(Buffer.isBuffer(preview?.jpegThumbnail));
  assert.equal(getEconomyPreviewConfig("weekly"), null);
  assert.equal(getEconomyPreviewConfig("monthly"), null);
});

test("reward text with a link preview becomes a clickable Discord image embed", async () => {
  const preview = await buildEconomyLinkPreview("daily");
  const payload = toDiscordPayload(
    {
      text: "🎁 Daily reward claimed: +$50K",
      linkPreview: preview,
    },
    { command: "daily", accentColor: "#FFD166" },
  );
  const embed = payload.embeds[0].toJSON();

  assert.equal(embed.title, "🎁 AIDORU Daily Rewards");
  assert.equal(embed.url, "https://aidoru.zone.id/journey");
  assert.equal(embed.image.url, "attachment://aidoru-preview.jpg");
  assert.equal(payload.files[0].name, "aidoru-preview.jpg");
});