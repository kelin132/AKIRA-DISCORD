  async onInteraction({ interaction, client }) {
    if (!interaction.isButton() || interaction.customId !== "create_support_ticket") return;

    // 1. Instantly acknowledge the interaction within Discord's 3-second window
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (err) {
      console.error("[ticket] Failed to defer interaction:", err);
      return;
    }

    // 2. Perform the database operations and channel creation
    try {
      const res = await handleTicketCreation(interaction.guild, interaction.member, client);
      
      if (res.error) {
        return await interaction.editReply({ content: res.error });
      }

      return await interaction.editReply({
        content: `✅ Your private support ticket has been opened: <#${res.channelId}>`,
      });
    } catch (err) {
      console.error("[ticket] Interaction handling error:", err);
      return await interaction.editReply({
        content: "❌ An unexpected error occurred while creating your ticket.",
      }).catch(() => {});
    }
  },
