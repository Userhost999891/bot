// /force-odbierzticket — wymusza przejęcie ticketa, nawet jeśli ktoś inny już go odebrał
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveTicket, getTicketConfig, forceClaimTicket } = require('../database/db');
const { isTicketStaff } = require('../modules/tickets/handler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('force-odbierzticket')
    .setDescription('Przejmuje ticket na siłę — nawet jeśli ktoś inny już go odebrał'),

  async execute(interaction) {
    await interaction.deferReply();

    const ticket = await getActiveTicket(interaction.channel.id);
    if (!ticket) {
      try { await interaction.deleteReply(); } catch (e) {}
      return interaction.followUp({ content: '❌〢Ta komenda działa tylko na kanale ticketa!', ephemeral: true });
    }

    // Tylko administracja/support — inaczej każdy mógłby przejmować tickety
    const ticketConfig = await getTicketConfig(interaction.guild.id);
    if (!isTicketStaff(interaction.member, ticketConfig)) {
      try { await interaction.deleteReply(); } catch (e) {}
      return interaction.followUp({ content: '⛔〢Tylko administracja może przejmować tickety!', ephemeral: true });
    }

    if (ticket.claimed_by === interaction.user.id) {
      try { await interaction.deleteReply(); } catch (e) {}
      return interaction.followUp({ content: '📋〢Ten ticket jest już odebrany przez Ciebie!', ephemeral: true });
    }

    await forceClaimTicket(interaction.channel.id, interaction.user.id);

    const embed = new EmbedBuilder()
      .setDescription(
        ticket.claimed_by
          ? `📋〢${interaction.user} przejął ten ticket! (wcześniej odebrany przez <@${ticket.claimed_by}>)`
          : `📋〢${interaction.user} odebrał ten ticket.`
      )
      .setColor(0x43b581)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
