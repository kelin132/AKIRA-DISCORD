export function isMediaContent(content) {
  return content && ["document", "image", "video", "audio"].some(
    (key) => content[key] !== undefined,
  );
}

function toAttachment(value, fileName) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { attachment: Buffer.from(value), name: fileName };
  }
  if (value && typeof value === "object" && typeof value.url === "string") {
    return { attachment: value.url, name: fileName };
  }
  return { attachment: value, name: fileName };
}

/**
 * Convert Baileys-style media into the discord.js payload shape.
 * URL objects must be flattened to attachment URLs; passing the original
 * `{ url }` object creates a nested attachment that Discord cannot render.
 */
export function toDiscordPayload(content) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return content;

  if (content.text && !isMediaContent(content)) return { content: content.text };

  const payload = {};
  if (content.text) payload.content = content.text;
  if (content.caption) payload.content = content.caption;

  if (content.document !== undefined) {
    payload.files = [toAttachment(content.document, content.fileName || "file.bin")];
  } else if (content.image !== undefined) {
    payload.files = [toAttachment(content.image, content.fileName || "image.png")];
  } else if (content.video !== undefined) {
    payload.files = [toAttachment(content.video, content.fileName || "video.mp4")];
  } else if (content.audio !== undefined) {
    payload.files = [toAttachment(content.audio, content.fileName || "audio.mp3")];
  }

  return Object.keys(payload).length ? payload : content;
}