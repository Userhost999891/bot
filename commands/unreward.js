const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { removeReward, getRewardServers } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unreward')
    .setDescription('Cofa odebranie nagrody dla danego gracza, umożliwiając mu ponowne odebranie')
    .addStringOption(option =>
      option.setName('nick')
        .setDescription('Nick gracza w Minecraft')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('serwer')
        .setDescription('Wybierz konkretny serwer (jeśli puste, cofa ze wszystkich)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    try {
      const servers = await getRewardServers(interaction.guild.id);
      if (!servers || servers.length === 0) {
        return interaction.respond([]);
      }

      const filtered = servers.filter(choice =>
        choice.server_name.toLowerCase().includes(focusedValue.toLowerCase()) ||
        choice.server_id.toLowerCase().includes(focusedValue.toLowerCase())
      );

      await interaction.respond(
        filtered.slice(0, 25).map(choice => ({
          name: choice.server_name,
          value: choice.server_id
        }))
      );
    } catch (err) {
      console.error('Błąd autocomplete /unreward:', err);
      try {
        await interaction.respond([]);
      } catch (e) {}
    }
  },

  async execute(interaction) {
    const nick = interaction.options.getString('nick');
    const serverId = interaction.options.getString('serwer');

    try {
      let serverName = null;
      if (serverId) {
        const servers = await getRewardServers(interaction.guild.id);
        const targetServer = servers.find(s => s.server_id === serverId);
        if (targetServer) {
          serverName = targetServer.server_name;
        }
      }

      const count = await removeReward(nick, serverId);

      const embed = new EmbedBuilder()
        .setTitle('🎁〢Cofnięcie nagrody')
        .setColor(0x5865F2)
        .setTimestamp();

      if (count > 0) {
        if (serverId) {
          embed.setDescription(`✅〢Cofnięto odebranie nagrody dla gracza **${nick}** na serwerze **${serverName || serverId}**.\n\nMoże on teraz odebrać nagrodę ponownie!`);
        } else {
          embed.setDescription(`✅〢Cofnięto odebranie nagrody dla gracza **${nick}** ze **wszystkich** trybów/serwerów.\n\nUsuniętych wpisów: **${count}**.\nGracz może teraz odebrać nagrody ponownie!`);
        }
      } else {
        if (serverId) {
          embed.setDescription(`❌〢Gracz **${nick}** nie ma żadnych zapisanych odebranych nagród na serwerze **${serverName || serverId}**.`);
          embed.setColor(0xf04747);
        } else {
          embed.setDescription(`❌〢Gracz **${nick}** nie ma żadnych zapisanych odebranych nagród w bazie danych.`);
          embed.setColor(0xf04747);
        }
      }

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Błąd wykonania /unreward:', err);
      return interaction.reply({ content: '❌〢Wystąpił błąd podczas usuwania nagrody z bazy danych.', ephemeral: true });
    }
  }
};
