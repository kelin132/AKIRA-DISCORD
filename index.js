import { Collection } from "discord.js";

export const plugins = new Collection();
export const commands = new Collection();

/**
 * Route interaction events (Buttons, Select Menus, Slash Commands)
 * directly to matching plugin handlers.
 */
export async function routeDiscordInteraction(client, interaction, prefix, ownerId) {
  // 1. Acknowledge buttons and select menus to beat Discord's 3-second deadline
  let autoDeferred = false;
  if (interaction.isButton() || interaction.isAnySelectMenu()) {
    if (!interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply({ ephemeral: true });
        autoDeferred = true;
      } catch (err) {
        // Ignore if already acknowledged by an external handler
      }
    }
  }

  // 2. Pass interaction to plugins that export an onInteraction handler
  for (const plugin of plugins.values()) {
    if (typeof plugin.onInteraction === "function") {
      try {
        await plugin.onInteraction({ interaction, client, prefix, ownerId, autoDeferred });
      } catch (error) {
        console.error(`[pluginManager] Interaction error in plugin ${plugin.name || "unknown"}:`, error);

        const errorMessage = "❌ An error occurred while executing this interaction.";
        
        // Safely reply without throwing InteractionAlreadyReplied
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(async () => {
            await interaction.editReply({ content: errorMessage }).catch(() => {});
          });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
        }
      }
    }
  }
}
