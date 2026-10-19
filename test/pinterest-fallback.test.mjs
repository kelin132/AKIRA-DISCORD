import test from "node:test";
import assert from "node:assert/strict";
import pinterest from "../plugins/download/pin.js";

test("Pinterest uses a provider fallback when scraped image URLs are dead", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const pathname = new URL(String(input)).pathname;
    calls.push(pathname);
    if (pathname.includes("BaseSearchResource")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ resource_response: { data: { results: [{ images: { orig: { url: "https://images.example/dead.jpg" } } }] } } }),
      };
    }
    if (pathname.endsWith("/dead.jpg")) return { ok: false, status: 404 };
    if (pathname.endsWith("/pinterest")) {
      return { ok: true, status: 200, json: async () => ({ results: [{ url: "https://images.example/live.jpg" }] }) };
    }
    if (pathname.endsWith("/live.jpg")) {
      return { ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };
    }
    throw new Error("unexpected URL");
  };
  try {
    const messages = [];
    await pinterest.run({
      sock: { sendMessage: async (_, payload) => messages.push(payload) },
      msg: { key: { remoteJid: "discord-channel" } },
      text: "anime wallpaper",
    });
    assert.ok(messages.some(message => Buffer.isBuffer(message.image)));
    assert.ok(calls.some(path => path.endsWith("/dead.jpg")));
    assert.ok(calls.some(path => path.endsWith("/live.jpg")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
