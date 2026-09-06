import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { Readable } from "node:stream";
import yts from "yt-search";
import { fetchAudio } from "../plugins/download/play.js";

let play = null;
try {
  const playModule = await import("play-dl");
  play = playModule.default ?? playModule;
} catch {
  // play-dl is optional because the download-provider fallback can still
  // resolve and stream audio when the package is unavailable.
}

const guildStates = new Map();
const DEFAULT_VOLUME = 70;
const VOLUME_STEP = 10;

function stateFor(guild) {
  let state = guildStates.get(guild.id);
  if (state) return state;

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  state = {
    guildId: guild.id,
    guild,
    player,
    connection: null,
    channelId: null,
    queue: [],
    current: null,
    currentResource: null,
    currentSource: null,
    loading: false,
    volume: DEFAULT_VOLUME,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    cleanupSource(state);
    state.current = null;
    state.currentResource = null;
    void playNext(state);
  });

  player.on("error", (error) => {
    console.error(`[music:${guild.id}] playback failed:`, error.message);
    cleanupSource(state);
    state.current = null;
    state.currentResource = null;
    void playNext(state);
  });

  guildStates.set(guild.id, state);
  return state;
}

async function resolveTrack(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) throw new Error("Enter a song name or YouTube URL.");

  let result;
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    // YouTube may block metadata requests even when a provider can still
    // return an audio stream. Keep the URL usable and enrich it when possible.
    result = { title: trimmed, url: trimmed, duration: "" };
    try {
      if (play) {
        const info = await play.video_basic_info(trimmed);
        result.title = info.video_details.title || result.title;
        result.url = info.video_details.url || result.url;
        result.duration = info.video_details.durationRaw || result.duration;
      }
    } catch (error) {
      console.warn(`[music] YouTube metadata lookup blocked; using fallback providers: ${error.message}`);
    }
  } else {
    let match;
    if (play) {
      try {
        const results = await play.search(trimmed, {
          limit: 1,
          source: { youtube: "video" },
        });
        match = results[0];
      } catch (error) {
        console.warn(`[music] play-dl search failed; trying yt-search: ${error.message}`);
      }
    }
    if (!match) {
      const fallback = await yts(trimmed);
      match = fallback.videos?.[0];
    }
    if (!match?.url) throw new Error("No matching song was found.");
    result = {
      title: match.title,
      url: match.url,
      duration: match.durationRaw || "",
    };
  }

  return result;
}

function cleanupSource(state) {
  state.currentSource?.cleanup?.();
  state.currentSource = null;
}

async function createAudioSource(track) {
  if (play) {
    try {
      const source = await play.stream(track.url, {
        quality: 2,
        discordPlayerCompatibility: true,
      });

      const cleanup = () => {
        source.stream.destroy?.();
      };

      return {
        stream: source.stream,
        inputType: source.type,
        cleanup,
      };
    } catch (error) {
      console.warn(`[music] play-dl stream blocked; trying audio download providers: ${error.message}`);
    }
  }

  const fallback = await fetchAudio(track.url, track.title);
  if (!fallback?.buffer) {
    throw new Error("Audio providers returned no playable stream.");
  }

  const stream = Readable.from([fallback.buffer]);
  const cleanup = () => {
    stream.destroy?.();
  };

  return {
    stream,
    inputType: StreamType.Arbitrary,
    cleanup,
  };
}

async function connectToChannel(state, channel) {
  if (state.connection && state.channelId === channel.id) return;

  state.connection?.destroy();
  state.connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  state.channelId = channel.id;
  state.connection.subscribe(state.player);

  await entersState(state.connection, VoiceConnectionStatus.Ready, 15_000);
}

async function playNext(state, { throwOnFailure = false } = {}) {
  if (state.loading || state.current || !state.queue.length) return;

  state.loading = true;
  const track = state.queue.shift();

  try {
    const source = await createAudioSource(track);
    const resource = createAudioResource(source.stream, {
      inputType: source.inputType,
      inlineVolume: true,
    });

    resource.volume?.setVolume(state.volume / 100);
    state.current = track;
    state.currentResource = resource;
    state.currentSource = source;
    state.player.play(resource);
  } catch (error) {
    console.error(`[music:${state.guildId}] could not start "${track.title}":`, error.message);
    cleanupSource(state);
    state.current = null;
    state.currentResource = null;
    if (throwOnFailure) {
      state.queue.unshift(track);
      throw error;
    }
    void playNext(state).catch((nextError) => {
      console.error(`[music:${state.guildId}] could not continue playback:`, nextError.message);
    });
  } finally {
    state.loading = false;
  }
}

export async function joinMusic(guild, channel) {
  const state = stateFor(guild);
  await connectToChannel(state, channel);
  return state;
}

export async function enqueueMusic(guild, channel, query, requestedBy = "") {
  const state = stateFor(guild);
  await connectToChannel(state, channel);
  const track = await resolveTrack(query);
  state.queue.push({ ...track, requestedBy });
  await playNext(state, { throwOnFailure: true });
  return { state, track, position: state.queue.length + (state.current ? 1 : 0) };
}

export function getMusicQueue(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return { current: null, queue: [], volume: DEFAULT_VOLUME };
  return {
    current: state.current,
    queue: [...state.queue],
    volume: state.volume,
  };
}

export function skipMusic(guildId) {
  const state = guildStates.get(guildId);
  if (!state?.current) return false;
  state.player.stop();
  return true;
}

export function stopMusic(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return false;
  state.queue = [];
  cleanupSource(state);
  state.player.stop(true);
  state.current = null;
  state.currentResource = null;
  return true;
}

export function setMusicVolume(guildId, value) {
  const state = guildStates.get(guildId) || null;
  if (!state) return null;
  const volume = Math.max(0, Math.min(100, Math.round(Number(value))));
  if (!Number.isFinite(volume)) return state.volume;
  state.volume = volume;
  state.currentResource?.volume?.setVolume(volume / 100);
  return volume;
}

export function leaveMusic(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return false;
  state.queue = [];
  cleanupSource(state);
  state.player.stop(true);
  state.connection?.destroy();
  guildStates.delete(guildId);
  return true;
}

export function adjustMusicVolume(guildId, direction) {
  const state = guildStates.get(guildId);
  if (!state) return null;
  return setMusicVolume(
    guildId,
    state.volume + (direction === "down" ? -VOLUME_STEP : VOLUME_STEP),
  );
}