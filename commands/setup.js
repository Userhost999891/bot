// /setup command — sends verification or ticket panel messages
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getConfig, setConfig } = require('../database/db');
const { sendTicketPanel } = require('../modules/tickets/handler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Konfiguruj moduły bota')
    .addStringOption(option =>
      option.setName('modul')
        .setDescription('Który moduł ustawić')
        .setRequired(true)
        .addChoices(
          { name: 'Weryfikacja', value: 'verification' },
          { name: 'Tickety', value: 'tickets' }
        )
    )
    .setDefaultMemberPermissions(0x8),

  async execute(interaction) {
    const module = interaction.options.getString('modul');

    if (module === 'verification') {
      const config = getConfig(interaction.guild.id);

      if (!config || !config.verification_channel_id) {
        return interaction.reply({
          content: '❌〢Najpierw skonfiguruj kanał weryfikacji w panelu webowym!',
          ephemeral: true
        });
      }

      const channel = interaction.guild.channels.cache.get(config.verification_channel_id);
      if (!channel) {
        return interaction.reply({
          content: '❌〢Skonfigurowany kanał weryfikacji nie istnieje!',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🔒〢Weryfikacja')
        .setDescription(
          '**Witaj na serwerze!**\n\n' +
          'Aby uzyskać dostęp do wszystkich kanałów, musisz się zweryfikować.\n' +
          'Kliknij przycisk poniżej i rozwiąż proste zadanie.\n\n' +
          '> 🧠〢Możesz dostać pytanie z dodawania lub tekst do przepisania.\n' +
          '> ✅〢Po poprawnej odpowiedzi otrzymasz rolę i dostęp do serwera!'
        )
        .setColor(0x5865F2)
        .setFooter({ text: 'NarisMC • System Weryfikacji' })
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('🔓〢Zweryfikuj się')
          .setStyle(ButtonStyle.Success)
      );

      const msg = await channel.send({ embeds: [embed], components: [button] });
      setConfig(interaction.guild.id, { verification_message_id: msg.id });

      await interaction.reply({
        content: `✅〢Wiadomość weryfikacyjna została wysłana na kanał ${channel}!`,
        ephemeral: true
      });

    } else if (module === 'tickets') {
      const result = await sendTicketPanel(interaction.channel, interaction.guild);

      if (result.success) {
        const { setTicketConfig } = require('../database/db');
        setTicketConfig(interaction.guild.id, { ticket_channel_id: interaction.channel.id, ticket_message_id: result.messageId });

        await interaction.reply({
          content: '✅〢Panel ticketów został wysłany!',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌〢${result.message}`,
          ephemeral: true
        });
      }
    }
  }
};
