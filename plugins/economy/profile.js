import { getUser, requireRegistration } from "./database.js";
import { getProfilePic, resolveRole } from "../../lib/profileGen.mjs";
import { getLevelRole, getAllEarnedRoles, getLevelRoleLabel } from "../../lib/levelRoles.mjs";
import { getUser as getCardUser } from "../cards/db.js";
import { countTrainerPokemon } from "../../lib/pokemon/pokemonDb.mjs";
import { guildSystem } from "../../lib/guildSystem.js";
import { GYMS } from "../../lib/pokemon/gymData.mjs";
import { getTrainer } from "../../lib/pokemon/players.mjs";
import { EmbedBuilder } from "discord.js";

const xpForLevel = (level) => level * 100;

function withTimeout(promise, timeoutMs, fallback = null) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fmtDate(iso) {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return "Unknown"; }
}

function gymAchievementSummary(trainer) {
  const badges = Array.isArray(trainer?.badges) ? trainer.badges.map(String) : [];
  const rewards = trainer?.gymRewards && typeof trainer.gymRewards === "object"
    ? Object.keys(trainer.gymRewards)
    : [];
  const earnedIds = new Set(
    [...badges, ...rewards]
      .map((value) => value.trim().toLowerCase().replace(/-badge$/i, ""))
      .filter(Boolean),
  );
  const earnedGyms = GYMS.filter((gym) => earnedIds.has(gym.id));
  const explicitWins = [trainer?.gymWins, trainer?.gymBattleWins, trainer?.gymVictories]
    .map(Number)
    .find((value) => Number.isFinite(value) && value >= 0);
  const wins = explicitWins ?? earnedGyms.length;
  
  return {
    wins,
    completed: earnedGyms.length,
    total: GYMS.length,
    badges: earnedGyms.length ? earnedGyms.map((gym) => gym.badge).join(", ") : "None yet",
  };
}

export default {
  name: "profile",
  description: "View your economy profile card",
  category: "economy",
  usage: ".profile [@user]",
  aliases: ["me", "acc", "account", "p"],
  cooldown: 5,

  async run({ discord, sender, isOwner, isMod, isStaff }) {
    const { message } = discord;
    const targetUser = message.mentions.users.first() || message.author;
    const target = targetUser.id;

    // Use a special lookup for Discord users in the shared DB
    // For now, we'll try to find by discordId
    const [user, cardUser, pokemonCount, guild, trainer] = await Promise.all([
      getUser(target, true), // Pass true to indicate Discord ID lookup
      getCardUser(target, true),
      countTrainerPokemon(target, true),
      withTimeout(guildSystem.getUserPrimaryGuild(target, true), 2500),
      withTimeout(getTrainer(target, true), 2500),
    ]);

    if (!user && target === sender) {
        await message.reply("❌ You are not registered. Use `.register` to start!");
        return;
    }

    const level = user?.level ?? 1;
    const registeredName = user?.name || targetUser.username;
    const cardsOwned = cardUser?.totalCards ?? 0;
    
    const role = resolveRole({
      isOwner:    target === sender ? isOwner  : false,
      isMod:      target === sender ? isMod    : (user?.staffLevel >= 1),
      isStaff:    target === sender ? isStaff  : (user?.staffLevel >= 2),
      isPremium:  user?.isPremium,
      staffLevel: user?.staffLevel ?? 0,
    });

    const gymProgress = gymAchievementSummary(trainer);
    const profileAge = user?.age || "N/A";
    const profileBirthday = user?.birthday || "N/A";
    const profileBio = user?.bio || "No bio set.";

    const embed = new EmbedBuilder()
      .setTitle(`🌸 PROFILE: ${registeredName}`)
      .setColor("#FFB6C1")
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: "❀ Name", value: `\`${registeredName}\``, inline: true },
        { name: "❀ Age", value: `\`${profileAge}\``, inline: true },
        { name: "❀ Bday", value: `\`${profileBirthday}\``, inline: true },
        { name: "❀ Role", value: `\`${role}\``, inline: true },
        { name: "❀ Level", value: `\`${level}\``, inline: true },
        { name: "❀ Cards", value: `\`${cardsOwned}\``, inline: true },
        { name: "❀ Pokémon", value: `\`${pokemonCount}\``, inline: true },
        { name: "❀ Badges", value: `\`${gymProgress.completed}\``, inline: true },
        { name: "❀ Bio", value: profileBio }
      )
      .setFooter({ text: "Aidoru Community • https://aidoru.zone.id" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};
