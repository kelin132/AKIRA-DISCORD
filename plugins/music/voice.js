import {
  adjustMusicVolume,
  enqueueMusic,
  getMusicQueue,
  joinMusic,
  leaveMusic,
  setMusicVolume,
  skipMusic,
  stopMusic,
} from "../../lib/discordMusic.mjs";

function helpText() {
  return [
    "🎵 Voice commands",
    "",
    ".voice join",
    ".voice play <song or YouTube URL>",
    ".voice queue",
    ".voice skip",
    ".voice volume <0-100>",
    ".voice volume up|down",
    ".voice stop",
    ".voice leave",
  ].join("\n");
}

function voiceChannelFor(message) {
  return message?.member?.voice?.channel || null;
}

export default {
  name: "voice",
  aliases: ["vc", "queue", "skip", "volume"],
  category: "music",
  discordTitle: "🎵 Voice",
  discordAccentColor: "#5865F2",
  description: "Play music in a Discord voice channel",
  usage: ".voice play <song>",

  async run({ sock, msg, args, cmd, discord }) {
    const message = discord?.message;
    const jid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

    if (!message?.guild) return reply("🎵 Voice music is only available inside a Discord server.");

    const action = ["queue", "skip", "volume"].includes(cmd)
      ? cmd
      : (args.shift() || "help").toLowerCase();

    if (action === "help") return reply(helpText());

    if (action === "join") {
      const channel = voiceChannelFor(message);
      if (!channel) return reply("Join a voice channel first, then use `.voice join`.");
      await joinMusic(message.guild, channel);
      return reply(`✅ Joined **${channel.name}**.`);
    }

    if (action === "play") {
      const channel = voiceChannelFor(message);
      if (!channel) return reply("Join a voice channel first, then use `.voice play <song>`.");
      const query = args.join(" ").trim();
      if (!query) return reply("Usage: `.voice play <song or YouTube URL>`");

      const result = await enqueueMusic(
        message.guild,
        channel,
        query,
        message.author?.username || "",
      );
      const location = result.state.current?.url === result.track.url && result.position <= 1
        ? "Now playing"
        : `Added to queue at position ${result.position}`;
      return reply(`✅ ${location}: **${result.track.title}**${result.track.duration ? ` (${result.track.duration})` : ""}`);
    }

    if (action === "queue") {
      const queue = getMusicQueue(message.guild.id);
      if (!queue.current && !queue.queue.length) return reply("The voice queue is empty.");
      const lines = ["🎵 Voice queue", `🔊 Volume: ${queue.volume}%`, ""];
      if (queue.current) lines.push(`▶️ Now: ${queue.current.title}`);
      queue.queue.slice(0, 20).forEach((track, index) => {
        lines.push(`${index + 1}. ${track.title}`);
      });
      if (queue.queue.length > 20) lines.push(`…and ${queue.queue.length - 20} more.`);
      return reply(lines.join("\n"));
    }

    if (action === "skip") {
      return reply(skipMusic(message.guild.id) ? "⏭️ Skipped. Playing the next song." : "Nothing is playing right now.");
    }

    if (action === "volume") {
      const value = args[0]?.toLowerCase();
      const volume = value === "up" || value === "down"
        ? adjustMusicVolume(message.guild.id, value)
        : setMusicVolume(message.guild.id, Number(value));
      if (volume === null) return reply("Nothing is connected to voice yet. Use `.voice join` first.");
      if (!Number.isFinite(volume)) return reply("Usage: `.voice volume <0-100>` or `.voice volume up|down`");
      return reply(`🔊 Volume set to **${volume}%**.`);
    }

    if (action === "stop") {
      return reply(stopMusic(message.guild.id) ? "⏹️ Playback stopped and the queue was cleared." : "Nothing is playing right now.");
    }

    if (action === "leave") {
      return reply(leaveMusic(message.guild.id) ? "👋 Left the voice channel." : "I am not in a voice channel.");
    }

    return reply(helpText());
  },
};