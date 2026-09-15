import { Collection } from "discord.js";

export const plugins = new Collection();
export const commands = new Collection();

/**
 * Route interaction events (Buttons, Select Menus, Slash Commands)
 * directly to matching plugin handlers.
 */
export async function routeDiscordInteraction(client, interaction, prefix, ownerId) {
  // 1. Immediately acknowledge buttons and select menus to prevent the 3-second timeout error
  if (interaction.isButton() || interaction.isAnySelectMenu()) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }
  }

  // 2. Pass interaction to plugins that export an onInteraction handler
  for (const plugin of plugins.values()) {
    if (typeof plugin.onInteraction === "function") {
      try {
        await plugin.onInteraction({ interaction, client, prefix, ownerId });
      } catch (error) {
        console.error(`[pluginManager] Interaction error in plugin ${plugin.name || "unknown"}:`, error);

        const errorMessage = "❌ An error occurred while executing this interaction.";
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorMessage }).catch(() => {});
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
        }
      }
    }
  }
}
