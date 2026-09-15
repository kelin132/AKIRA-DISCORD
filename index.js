import { Collection } from "discord.js";

export const plugins = new Collection();
export const commands = new Collection();

/**
 * Route interaction events (Buttons, Select Menus, Slash Commands)
 * directly to matching plugin handlers.
 */
export async function routeDiscordInteraction(client, interaction, prefix, ownerId) {
  // Only route component interactions
  if (!interaction.isButton() && !interaction.isAnySelectMenu()) return;

  const customId = interaction.customId || "";

  // 1. Find the specific target plugin for this customId
  // Matches plugins named in customId (e.g., "create_support_ticket" or "ticket:create")
  const targetPlugin = plugins.find((plugin) => {
    if (typeof plugin.onInteraction !== "function") return false;

    // Check if plugin exports a customId predicate or prefix matching rules
    if (typeof plugin.matchesInteraction === "function") {
      return plugin.matchesInteraction(customId);
    }

    const pluginName = (plugin.name || "").toLowerCase();
    return customId.startsWith(`${pluginName}:`) || customId.startsWith(`${pluginName}_`);
  });

  // Fallback to general interaction handlers if no target plugin matched explicitly
  const handlerPlugins = targetPlugin 
    ? [targetPlugin] 
    : plugins.filter((p) => typeof p.onInteraction === "function").values();

  // 2. Acknowledge only if a matching plugin is ready to process it
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch {
      // Already acknowledged elsewhere
    }
  }

  // 3. Execute matching plugin handler
  for (const plugin of handlerPlugins) {
    try {
      const handled = await plugin.onInteraction({ interaction, client, prefix, ownerId });
      
      // Stop looping if the plugin explicitly handled the interaction
      if (handled !== false) break; 
    } catch (error) {
      console.error(`[pluginManager] Interaction error in plugin ${plugin.name || "unknown"}:`, error);

      const errorMessage = "❌ An error occurred while executing this interaction.";
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(async () => {
          await interaction.editReply({ content: errorMessage }).catch(() => {});
        });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
      }
      break;
    }
  }
}
