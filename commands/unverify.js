// /unverify command — removes verification from users
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveUserRoles } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Zabiera weryfikację użytkownikowi lub wszystkim')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Użytkownik do cofnięcia weryfikacji (zostaw puste aby cofnąć WSZYSTKIM)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const config = getConfig(interaction.guild.id);
    if (!config || !config.unverified_role_name || !config.verified_role_name) {
      return interaction.reply({ content: '❌〢System nie jest w pełni skonfigurowany.', ephemeral: true });
    }

    const unverifiedRole = interaction.guild.roles.cache.find(r => r.name === config.unverified_role_name);
    const verifiedRole = interaction.guild.roles.cache.find(r => r.name === config.verified_role_name);

    if (!unverifiedRole || !verifiedRole) {
      return interaction.reply({ content: '❌〢Role weryfikacji nie istnieją w konfiguracji serwera.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');

    if (targetUser) {
      try {
        const member = await interaction.guild.members.fetch(targetUser.id);

        const roleIds = member.roles.cache
          .filter(r => r.name !== '@everyone' && r.id !== unverifiedRole.id)
          .map(r => r.id);

        if (roleIds.length > 0) {
          saveUserRoles(interaction.guild.id, member.user.id, roleIds);
        }

        const rolesToRemove = member.roles.cache.filter(r => r.name !== '@everyone');
        for (const [, role] of rolesToRemove) {
          await member.roles.remove(role, 'Cofnięcie weryfikacji - zapisano role');
        }

        await member.roles.add(unverifiedRole, 'Cofnięcie weryfikacji przez admina');

        return interaction.reply({
          content: `✅〢Cofnięto weryfikację dla gracza ${targetUser}. Zapisano **${roleIds.length}** ról do przywrócenia.`
        });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌〢Nie udało się cofnąć weryfikacji tego gracza.', ephemeral: true });
      }
    } else {
      await interaction.deferReply();
      try {
        const members = await interaction.guild.members.fetch();
        let count = 0;
        let savedCount = 0;

        for (const [, member] of members) {
          if (member.user.bot) continue;

          const hasOtherRoles = member.roles.cache.some(r => r.name !== '@everyone' && r.id !== unverifiedRole.id);
          if (!hasOtherRoles && member.roles.cache.has(unverifiedRole.id)) continue;

          const roleIds = member.roles.cache
            .filter(r => r.name !== '@everyone' && r.id !== unverifiedRole.id)
            .map(r => r.id);

          if (roleIds.length > 0) {
            saveUserRoles(interaction.guild.id, member.user.id, roleIds);
            savedCount++;
          }

          const rolesToRemove = member.roles.cache.filter(r => r.name !== '@everyone');
          for (const [, role] of rolesToRemove) {
            try {
              await member.roles.remove(role, 'Masowe cofnięcie weryfikacji - zapisano role');
            } catch (e) {
              console.error(`Nie można usunąć roli ${role.name} od ${member.user.tag}:`, e.message);
            }
          }

          await member.roles.add(unverifiedRole, 'Masowe cofnięcie weryfikacji');
          count++;
        }

        return interaction.followUp({
          content: `✅〢Masowa akcja zakończona!\n` +
                   `📋〢Cofnięto weryfikację u **${count}** graczy.\n` +
                   `💾〢Zapisano role **${savedCount}** graczy — zostaną przywrócone po weryfikacji.`
        });
      } catch (err) {
        console.error(err);
        return interaction.followUp({ content: '❌〢Wystąpił błąd podczas masowego cofania weryfikacji.' });
      }
    }
  }
};
