const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getPool } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore-emergency')
    .setDescription('AWARYJNE PRZYWRÓCENIE RÓL WSZYSTKICH GRACZY po przypadkowym /unverify')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const p = await getPool();
      const [rows] = await p.execute('SELECT user_id, role_ids FROM saved_roles WHERE guild_id = ?', [interaction.guild.id]);
      
      if (rows.length === 0) {
        return interaction.followUp({ content: 'Nie znaleziono żadnych zapisanych ról dla tego serwera w bazie danych.' });
      }

      let restored = 0;
      let errors = 0;

      for (const row of rows) {
        try {
          const member = await interaction.guild.members.fetch(row.user_id);
          const roleIds = JSON.parse(row.role_ids);
          
          if (roleIds && roleIds.length > 0) {
            for (const rId of roleIds) {
              const roleObj = interaction.guild.roles.cache.get(rId);
              if (roleObj) {
                await member.roles.add(roleObj, 'Awaryjne przywrócenie ról');
              }
            }
          }
          restored++;
        } catch(e) {
          errors++;
          console.error(`Nie mogłem przywrócić ról dla ${row.user_id}:`, e.message);
        }
      }

      // Po przywróceniu, warto też ściągnąć ewentualną rolę "Niezweryfikowany"
      // ale dla bezpieczeństwa skupiamy się tylko na uratowaniu sytuacji (oddaniu tego co zniknęło).

      return interaction.followUp({ content: `✅〢Operacja awaryjna zakończona.\nPrzywrócono role **${restored}** użytkownikom.\nBłędy u **${errors}** osób (np. wyszli z serwera).` });

    } catch (err) {
      console.error(err);
      return interaction.followUp({ content: '❌〢Krytyczny błąd podczas łączenia z bazą lub przywracania ról.' });
    }
  }
};
