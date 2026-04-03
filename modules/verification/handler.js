// Verification handler — role assignment logic
const { getConfig, getSavedRoles, deleteSavedRoles } = require('../../database/db');

async function handleVerification(interaction, guild) {
  const { EmbedBuilder } = require('discord.js');
  const config = await getConfig(guild.id);
  if (!config) {
    return interaction.reply({ 
      embeds: [new EmbedBuilder().setDescription('❌〢Weryfikacja nie jest skonfigurowana na tym serwerze.').setColor(0xf04747)], 
      ephemeral: true 
    });
  }

  const member = interaction.member || await guild.members.fetch(interaction.user.id);

  const verifiedRole = guild.roles.cache.find(r => r.name === config.verified_role_name);
  if (!verifiedRole) {
    return interaction.reply({ 
      embeds: [new EmbedBuilder().setDescription('❌〢Rola zweryfikowanego nie istnieje! Skontaktuj się z administratorem.').setColor(0xf04747)], 
      ephemeral: true 
    });
  }

  if (member.roles.cache.has(verifiedRole.id)) {
    return interaction.reply({ 
      embeds: [new EmbedBuilder().setDescription('✅〢Jesteś już zweryfikowany!').setColor(0x43b581)], 
      ephemeral: true 
    });
  }

  return null;
}

async function assignVerifiedRole(interaction, guild) {
  const config = await getConfig(guild.id);
  if (!config) return false;

  // Always fully fetch to prevent any cache issues or missing member data
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return false;

  const verifiedRole = guild.roles.cache.find(r => r.name === config.verified_role_name);
  const unverifiedRole = guild.roles.cache.find(r => r.name === config.unverified_role_name);

  if (!verifiedRole) {
    await interaction.reply({ content: '❌〢Rola zweryfikowanego nie istnieje! Skontaktuj się z administracją serwera, bo bot nie ma poprawnie ustawionych ról.', ephemeral: true });
    return false;
  }

  try {
    // Add verified role unconditionally
    await member.roles.add(verifiedRole, 'Weryfikacja przeszła pomyślnie');

    // Remove unverified unconditionally without checking cache, catch just in case it doesn't exist on user
    if (unverifiedRole) {
      await member.roles.remove(unverifiedRole, 'Użytkownik się zweryfikował').catch(() => {});
    }

    const savedRoleIds = await getSavedRoles(guild.id, member.user.id);
    if (savedRoleIds && savedRoleIds.length > 0) {
      let restored = 0;
      for (const roleId of savedRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role && !member.roles.cache.has(roleId)) {
          try {
            await member.roles.add(role, 'Przywrócenie zapisanej roli po weryfikacji');
            restored++;
          } catch (e) {
            console.error(`Nie można przywrócić roli ${role.name}:`, e.message);
          }
        }
      }
      await deleteSavedRoles(guild.id, member.user.id);
      console.log(`✅ Przywrócono ${restored} zapisanych ról dla ${member.user.tag}`);
    } else {
      const graczRole = guild.roles.cache.find(r => r.name === '💎・Gracz' || r.name.toLowerCase().includes('gracz'));
      if (graczRole && !member.roles.cache.has(graczRole.id)) {
        await member.roles.add(graczRole, 'Nowy gracz po weryfikacji');
      }
    }

    return true;
  } catch (error) {
    console.error('Error assigning roles:', error);
    return false;
  }
}

module.exports = { handleVerification, assignVerifiedRole };
