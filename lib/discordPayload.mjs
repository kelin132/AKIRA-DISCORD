import { EmbedBuilder } from "discord.js";
import {
  discordCommandTitle,
  discordStateColor,
  normalizeDiscordFooter,
} from "./discordTheme.mjs";

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

function discordUserId(value) {
  const raw = String(value || "");
  if (raw.startsWith("discord:")) return raw.slice("discord:".length);
  return /^\d{5,}$/.test(raw) ? raw : "";
}

function mentionPayload(mentions) {
  const users = (Array.isArray(mentions) ? mentions : [])
    .map(discordUserId)
    .filter(Boolean);
  return users.length
    ? { content: users.map((id) => `<@${id}>`).join(" "), allowedMentions: { users } }
    : {};
}

function embedFooter(options = {}) {
  const footer = normalizeDiscordFooter(options.footer);
  return footer ? { footer } : {};
}

function embedTitle(content, options = {}) {
  return content.discordTitle || options.title || discordCommandTitle(options.command);
}

function textEmbed(content, options = {}) {
  const embed = new EmbedBuilder()
    .setColor(discordStateColor(content.text, options.accentColor))
    .setDescription(String(content.text || "").trim() || "\u200b");

  const title = embedTitle(content, options);
  if (title) embed.setTitle(String(title));
  if (options.author?.name) {
    embed.setAuthor({
      name: String(options.author.name),
      ...(options.author.iconURL ? { iconURL: options.author.iconURL } : {}),
    });
  }
  const { footer } = embedFooter(options);
  if (footer) embed.setFooter(footer);
  return embed;
}

function mediaEmbed(content, options, fileName) {
  const caption = content.caption || content.text;
  const embed = new EmbedBuilder()
    .setColor(discordStateColor(caption, options.accentColor))
    .setImage(`attachment://${fileName}`);

  const title = embedTitle(content, options);
  if (title) embed.setTitle(String(title));
  if (caption) embed.setDescription(String(caption).trim());

  const { footer } = embedFooter(options);
  if (footer) embed.setFooter(footer);
  return embed;
}

/**
 * Convert Baileys-style media into the discord.js payload shape.
 * URL objects must be flattened to attachment URLs; passing the original
 * `{ url }` object creates a nested attachment that Discord cannot render.
 */
export function toDiscordPayload(content, options = {}) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return content;

  if (content.text && !isMediaContent(content)) {
    return {
      ...mentionPayload(content.mentions),
      embeds: [textEmbed(content, {
        ...options,
        title: content.discordTitle || options.title,
        footer: content.discordFooter || options.footer,
      })],
    };
  }

  const payload = {};
  if (content.text) payload.content = content.text;
  if (content.caption) payload.content = content.caption;
  Object.assign(payload, mentionPayload(content.mentions));
  const mentionContent = /<@\d+>/.test(String(payload.content || ""))
    ? payload.content
    : "";

  if (content.document !== undefined) {
    payload.files = [toAttachment(content.document, content.fileName || "file.bin")];
  } else if (content.image !== undefined) {
    const fileName = content.fileName || "image.png";
    payload.files = [toAttachment(content.image, fileName)];
    if (options.embedMedia) {
      payload.embeds = [mediaEmbed(content, {
        ...options,
        title: content.discordTitle || options.title,
        footer: content.discordFooter || options.footer,
      }, fileName)];
      if (mentionContent) payload.content = mentionContent;
      else delete payload.content;
    }
  } else if (content.video !== undefined) {
    payload.files = [toAttachment(content.video, content.fileName || "video.mp4")];
  } else if (content.audio !== undefined) {
    payload.files = [toAttachment(content.audio, content.fileName || "audio.mp3")];
  }

  return Object.keys(payload).length ? payload : content;
}