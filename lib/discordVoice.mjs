import { spawn } from "node:child_process";

let voiceModulePromise;
const activePlayers = new Map();
export const VOICE_STAY_MS = 10 * 60 * 60 * 1000;

async function getVoiceModule() {
  voiceModulePromise ??= import("@discordjs/voice");
  return voiceModulePromise;
}

export function normalizeVoiceVolume(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function clearLeaveTimer(state) {
  if (state.leaveTimer) clearTimeout(state.leaveTimer);
  state.leaveTimer = null;
}

function scheduleLeave(state) {
  clearLeaveTimer(state);
  state.leaveTimer = setTimeout(() => {
    stopDiscordVoice(state.guildId);
  }, VOICE_STAY_MS);
  state.leaveTimer.unref?.();
}

function killFfmpeg(ffmpeg) {
  if (ffmpeg && !ffmpeg.killed) ffmpeg.kill("SIGKILL");
}

function finishTrack(state, track, voiceModule) {
  if (state.stopped || state.current !== track) return;

  killFfmpeg(track?.ffmpeg);
  state.current = null;
  if (state.queue.length) {
    startTrack(state, state.queue.shift(), voiceModule);
  } else {
    scheduleLeave(state);
  }
}

function startTrack(state, track, voiceModule) {
  if (state.stopped) return;

  clearLeaveTimer(state);
  state.current = track;
  const { StreamType, createAudioResource } = voiceModule;
  const ffmpeg = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-vn",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-b:a",
    "128k",
    "-f",
    "ogg",
    "pipe:1",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  track.ffmpeg = ffmpeg;

  let ffmpegError = "";
  ffmpeg.stderr.on("data", (chunk) => {
    ffmpegError += String(chunk);
  });
  ffmpeg.once("error", (error) => {
    console.error("[discord voice] ffmpeg error:", error.message);
    finishTrack(state, track, voiceModule);
  });
  ffmpeg.once("close", (code) => {
    if (code && code !== 0 && !ffmpeg.killed) {
      console.error("[discord voice] ffmpeg exited:", code, ffmpegError.trim());
    }
  });
  ffmpeg.stdin.end(track.audioBuffer);

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.OggOpus,
    inlineVolume: true,
    metadata: { title: track.title },
  });
  resource.volume?.setVolume(state.volume);
  track.resource = resource;

  state.player.play(resource);
}

export async function stopDiscordVoice(guildId) {
  const key = String(guildId);
  const state = activePlayers.get(key);
  if (!state) return false;

  state.stopped = true;
  clearLeaveTimer(state);
  killFfmpeg(state.current?.ffmpeg);
  state.queue.length = 0;
  state.player.stop(true);
  state.connection.destroy();
  activePlayers.delete(key);
  return true;
}

export function getDiscordVoiceStatus(guildId) {
  const state = activePlayers.get(String(guildId));
  if (!state) return null;
  return {
    channelId: state.channel.id,
    volume: Math.round(state.volume * 100),
    playing: state.current?.title || null,
    queue: state.queue.map((track) => track.title),
  };
}

export function setDiscordVoiceVolume(guildId, value) {
  const volume = normalizeVoiceVolume(value);
  if (volume === null) return { ok: false, reason: "invalid-volume" };

  const state = activePlayers.get(String(guildId));
  if (!state) return { ok: false, reason: "not-playing" };

  state.volume = volume / 100;
  state.current?.resource?.volume?.setVolume(state.volume);
  return { ok: true, volume };
}

export function pauseDiscordVoice(guildId) {
  const state = activePlayers.get(String(guildId));
  if (!state?.current) return { ok: false, reason: "nothing-playing" };
  if (state.player.pause()) return { ok: true, title: state.current.title };
  return { ok: false, reason: "could-not-pause" };
}

export function resumeDiscordVoice(guildId) {
  const state = activePlayers.get(String(guildId));
  if (!state?.current) return { ok: false, reason: "nothing-playing" };
  if (state.player.unpause()) return { ok: true, title: state.current.title };
  return { ok: false, reason: "not-paused" };
}

export async function skipDiscordVoice(guildId) {
  const state = activePlayers.get(String(guildId));
  if (!state?.current) return { ok: false, reason: "nothing-playing" };

  const voiceModule = await getVoiceModule();
  const skipped = state.current.title;
  finishTrack(state, state.current, voiceModule);
  return {
    ok: true,
    skipped,
    next: state.current?.title || null,
  };
}

export async function playDiscordVoice({
  client,
  message,
  audioBuffer,
  title,
  enqueue = false,
}) {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    return { ok: false, reason: "not-in-voice" };
  }

  const permissions = voiceChannel.permissionsFor(client.user);
  if (
    !permissions?.has("Connect") ||
    !permissions?.has("Speak")
  ) {
    return { ok: false, reason: "missing-permissions", channel: voiceChannel };
  }

  const {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
  } = await getVoiceModule();
  const voiceModule = { StreamType, createAudioResource };
  const guildId = String(message.guildId);
  const existing = activePlayers.get(guildId);

  if (existing && enqueue && existing.channel.id === voiceChannel.id) {
    clearLeaveTimer(existing);
    existing.stopped = false;
    if (existing.current) {
      existing.queue.push({ audioBuffer, title });
      return {
        ok: true,
        queued: true,
        position: existing.queue.length + 1,
        channel: existing.channel,
        title,
      };
    }
    startTrack(existing, { audioBuffer, title }, voiceModule);
    return {
      ok: true,
      queued: false,
      channel: existing.channel,
      title,
    };
  }
  if (existing) await stopDiscordVoice(guildId);

  let connection;
  let lastConnectionError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      break;
    } catch (error) {
      lastConnectionError = error;
      connection.destroy();
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
    throw new Error(
      `Voice connection did not become ready: ${lastConnectionError?.message || "connection aborted"}`,
    );
  }

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
  const state = {
    guildId,
    channel: voiceChannel,
    connection,
    player,
    current: null,
    queue: [],
    volume: 1,
    leaveTimer: null,
    stopped: false,
  };
  activePlayers.set(guildId, state);
  player.on("error", (error) => {
    console.error("[discord voice] audio player error:", error.message);
    finishTrack(state, state.current, voiceModule);
  });
  player.on(AudioPlayerStatus.Idle, () => {
    finishTrack(state, state.current, voiceModule);
  });

  connection.subscribe(player);
  startTrack(state, { audioBuffer, title }, voiceModule);

  return {
    ok: true,
    channel: voiceChannel,
    title,
  };
}