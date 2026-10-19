import test from "node:test";
import assert from "node:assert/strict";
import { searchPinterestImages } from "../plugins/download/pin.js";

test("Pinterest falls back quickly when scraping fails and stops after provider results", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const pathname = new URL(String(input)).pathname;
    calls.push(pathname);
    if (pathname.includes("BaseSearchResource")) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: [{ image: { url: "https://images.example/pin.jpg" } }] }),
    };
  };
  try {
    const results = await searchPinterestImages("anime wallpaper");
    assert.deepEqual(results, ["https://images.example/pin.jpg"]);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].endsWith("/pinterest"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
