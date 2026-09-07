/**
 * KELIN MD — .play2 command
 * Searches YouTube, downloads audio, and plays it in a Discord voice channel.
 */
import { downloadMediaBuffer } from "../../lib/omegaDownload.js";
import {
  getDiscordVoiceStatus,
  pauseDiscordVoice,
  playDiscordVoice,
  resumeDiscordVoice,
  setDiscordVoiceVolume,
  skipDiscordVoice,
  stopDiscordVoice,
} from "../../lib/discordVoice.mjs";
import { fetchAudio, sendBanner, ytSearch } from "./play.js";

function explainPlaybackError(error) {
  const message = String(error?.message || error || "");
  if (/abort|timed out|timeout/i.test(message)) {
    return "The audio provider timed out before the track finished downloading. Try the command again or use a YouTube URL.";
  }
  return "The audio provider did not return a playable track. Try again or use a YouTube URL.";
}

function voiceUsage() {
  return [
    "🔊 `.play2 <song>` — play a song",
    "➕ `.play2 add <song>` — add a song to the queue",
    "📋 `.play2 queue` — show the queue",
    "⏭️ `.play2 next` — skip to the next song",
    "🔉 `.play2 volume <0-100>` — set volume",
    "⏸️ `.play2 pause` / `.play2 resume`",
    "⏹️ `.play2 stop` — stop and leave voice",
    "ℹ️ `.play2 now` — show the current song",
  ].join("\n");
}

function sendText(sock, jid, msg, text) {
  return sock.sendMessage(jid, { text }, { quoted: msg });
}

function formatVoiceStatus(status) {
  const lines = [
    `🎵 Now playing: **${status.playing || "Nothing"}**`,
    `🔊 Volume: **${status.volume}%**`,
  ];
  if (status.queue.length) {
    lines.push(
      "",
      "📋 Queue:",
      ...status.queue.map((title, index) => `${index + 1}. ${title}`),
    );
  } else {
    lines.push("", "📋 Queue: empty");
  }
  return lines.join("\n");
}

export default {
  name: "play2",
  description: "Play and control YouTube audio in your Discord voice channel",
  category: "download",
  usage: ".play2 <song> | add <song> | queue | next | volume <0-100>",
  aliases: ["voiceplay", "vplay"],
  cooldown: 15,

  async run({ sock, msg, text, args, discord }) {
    const jid = msg.key.remoteJid;

    if (!discord?.message) {
      return sendText(sock, jid, msg, "🔊 `.play2` is only available from the Discord bot.");
    }

    const guildId = discord.message.guildId;
    if (!guildId) {
      return sendText(sock, jid, msg, "🔊 Join a Discord server voice channel to use `.play2`.");
    }

    const action = String(args?.[0] || "").toLowerCase();
    const actionText = args?.slice(1).join(" ").trim() || "";
    const status = () => getDiscordVoiceStatus(guildId);

    if (["help", "commands"].includes(action)) {
      return sendText(sock, jid, msg, voiceUsage());
    }

    if (["queue", "list"].includes(action) && !actionText) {
      const current = status();
      return sendText(sock, jid, msg, current ? formatVoiceStatus(current) : "📋 There is no active voice session.");
    }

    if (["now", "nowplaying", "np", "status"].includes(action)) {
      const current = status();
      return sendText(sock, jid, msg, current ? formatVoiceStatus(current) : "🎵 Nothing is playing.");
    }

    if (["next", "skip"].includes(action)) {
      const result = await skipDiscordVoice(guildId);
      if (!result.ok) return sendText(sock, jid, msg, "⏭️ Nothing is playing right now.");
      return sendText(
        sock,
        jid,
        msg,
        result.next
          ? `⏭️ Skipped **${result.skipped}**.\n🎵 Now playing **${result.next}**.`
          : `⏭️ Skipped **${result.skipped}**. The queue is empty; I’ll stay in voice for up to 10 hours.`,
      );
    }

    if (["pause", "resume", "unpause"].includes(action)) {
      const result = action === "pause"
        ? pauseDiscordVoice(guildId)
        : resumeDiscordVoice(guildId);
      if (!result.ok) {
        return sendText(
          sock,
          jid,
          msg,
          result.reason === "nothing-playing"
            ? "🎵 Nothing is playing right now."
            : action === "pause"
              ? "⏸️ Playback is already paused."
              : "▶️ Playback is not paused.",
        );
      }
      return sendText(sock, jid, msg, action === "pause"
        ? `⏸️ Paused **${result.title}**.`
        : `▶️ Resumed **${result.title}**.`);
    }

    if (["stop", "leave", "disconnect"].includes(action)) {
      const stopped = await stopDiscordVoice(guildId);
      return sendText(
        sock,
        jid,
        msg,
        stopped ? "⏹️ Playback stopped and I left the voice channel." : "🔊 There is no active voice session.",
      );
    }

    if (["volume", "vol"].includes(action)) {
      const requested = actionText.toLowerCase();
      const current = status();
      if (!current) return sendText(sock, jid, msg, "🔊 Nothing is playing. Start a song before changing volume.");
      if (!requested) return sendText(sock, jid, msg, `🔊 Current volume: **${current.volume}%**.\nUse \`.play2 volume <0-100>\` to change it.`);
      let value;
      if (requested === "down" || requested === "lower" || requested === "quieter") {
        value = current.volume - 10;
      } else if (requested === "up" || requested === "louder") {
        value = current.volume + 10;
      } else {
        value = Number(requested);
      }
      const result = setDiscordVoiceVolume(guildId, value);
      if (!result.ok) {
        return sendText(sock, jid, msg, "🔊 Usage: `.play2 volume <0-100>` or `.play2 volume down`.");
      }
      return sendText(sock, jid, msg, `🔊 Volume set to **${result.volume}%**.`);
    }

    const enqueue = ["add", "enqueue", "queue"].includes(action);
    const query = enqueue ? actionText : text.trim();
    if (!query || ["help", "commands"].includes(query.toLowerCase())) {
      return sendText(sock, jid, msg, `${voiceUsage()}\n\nExample: \`.play2 Shape of You\``);
    }

    try {
      const meta = await ytSearch(query);
      await sendBanner(sock, jid, msg, meta, enqueue ? "Adding to queue…" : "Connecting to voice channel…");

      const { dl, buffer, mimetype: returnedMimetype, title } = await fetchAudio(meta.url, meta.title);
      const trackTitle = title || meta.title;
      const file = buffer
        ? { buffer, mimetype: returnedMimetype || "audio/mpeg" }
        : await downloadMediaBuffer(dl);

      let voiceResult;
      try {
        voiceResult = await playDiscordVoice({
          client: discord.client,
          message: discord.message,
          audioBuffer: file.buffer,
          title: trackTitle,
          enqueue,
        });
      } catch (voiceError) {
        const voiceMessage = String(voiceError?.message || voiceError || "");
        console.error("[play2] voice playback failed:", voiceMessage);
        const reason = /opus module|opusscript|node-opus|@discordjs\/opus/i.test(voiceMessage)
          ? "The Discord Opus audio codec is unavailable."
          : /ffmpeg|spawn/i.test(voiceMessage)
            ? "FFmpeg could not start."
            : "The Discord voice session could not start.";
        return sock.sendMessage(jid, {
          text: `❌ I downloaded the audio, but could not start voice playback. ${reason} ` +
            "Please check the bot's Connect and Speak permissions and try again.",
        }, { quoted: msg });
      }

      if (!voiceResult.ok) {
        const message = voiceResult.reason === "not-in-voice"
          ? "🔊 Join a voice channel first, then run `.play2` again."
          : voiceResult.reason === "missing-permissions"
            ? "❌ I need **Connect** and **Speak** permissions in your voice channel."
            : "❌ I could not connect to that voice channel.";
        return sock.sendMessage(jid, { text: message }, { quoted: msg });
      }

      return sendText(
        sock,
        jid,
        msg,
        voiceResult.queued
          ? `➕ Added **${trackTitle}** to the queue at position **${voiceResult.position}**.`
          : `🎵 Now playing **${trackTitle}** in <#${voiceResult.channel.id}>`,
      );
    } catch (error) {
      console.error("[play2]", error.message);
      return sock.sendMessage(jid, {
        text: `❌ I could not start that track: ${explainPlaybackError(error)}`,
      }, { quoted: msg });
    }
  },
};