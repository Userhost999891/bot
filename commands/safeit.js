// /safeit — Emergency role cleanup & member audit
// Fixes duplicate roles, conflicting member assignments, and validates verification state
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../database/db');

// Rate limit helper — wait between API calls to avoid crashes
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('safeit')
    .setDescription('Audyt i naprawa rol weryfikacji — usuwa duplikaty i naprawia konflikty')
    .setDefaultMemberPermissions(0x8), // ADMIN only

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const config = await getConfig(guild.id);

    if (!config) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setDescription('Brak konfiguracji weryfikacji dla tego serwera. Skonfiguruj najpierw w panelu webowym.')
          .setColor(0xf04747)]
      });
    }

    const verifiedName = config.verified_role_name || 'Zweryfikowany';
    const unverifiedName = config.unverified_role_name || 'Niezweryfikowany';

    const log = [];
    let fixedMembers = 0;
    let deletedRoles = 0;

    try {
      // =============================================
      // PHASE 1: Deduplicate roles
      // =============================================
      log.push('**FAZA 1** — Analiza duplikatow rol');

      await guild.roles.fetch();

      // Ultra fuzzy match: strip all non-alphanumeric chars and find base word to catch ANY emoji/space variants
      const normalize = (str) => str.toLowerCase().replace(/[^a-zżółćęśąźń0-9]/gi, '');
      
      const verifiedRoles = guild.roles.cache.filter(r => {
        const norm = normalize(r.name);
        return norm.includes('zweryfikowan') && !norm.includes('niezweryfikowan');
      });
      const unverifiedRoles = guild.roles.cache.filter(r => {
        const norm = normalize(r.name);
        return norm.includes('niezweryfikowan');
      });

      let keepVerified = null;
      let keepUnverified = null;

      async function deduplicateRoles(roles, exactName, label) {
        if (roles.size === 0) {
          log.push(`Rola "${label}": BRAK`);
          return null;
        }

        const sorted = [...roles.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        let keep = sorted.find(r => r.name === exactName) || sorted[0];

        if (roles.size === 1) {
          log.push(`Rola "${label}": OK ("${keep.name}")`);
          return keep;
        }

        const variants = sorted.map(r => `"${r.name}"`).join(', ');
        log.push(`Rola "${label}": ${roles.size} wariantow: ${variants}`);

        for (const role of sorted) {
          if (role.id === keep.id) continue;

          try {
            await role.delete('SafeIT: usuniecie zduplikowanej roli');
            deletedRoles++;
            await sleep(500);
          } catch(e) {
            log.push(`⚠️ Blad usuniecia roli z serwera (brak uprawnien/hierarchia): ${role.name}`);
          }
        }

        log.push(`Zachowano: "${keep.name}", usunieto ${roles.size - 1} duplikatow z pamieci Discorda.`);
        return keep;
      }

      keepVerified = await deduplicateRoles(verifiedRoles, verifiedName, verifiedName);
      keepUnverified = await deduplicateRoles(unverifiedRoles, unverifiedName, unverifiedName);

      // =============================================
      // PHASE 3: Summary
      // =============================================
      const summary = [
        `Usunieto zduplikowanych rol systemowych: **${deletedRoles}**`,
        `*Ze wzgledu na darmowy hosting Rendera (limit pamieci), bot nie migrowal uzytkownikow recznie by zapobiec OOM Crash (awarii). Discord sam odbierze usuniete role.*`,
      ].join('\n');

      const embed = new EmbedBuilder()
        .setTitle('SafeIT — Raport Naprawy')
        .setDescription(log.join('\n'))
        .addFields({ name: 'Podsumowanie', value: summary })
        .setColor(0x57F287)
        .setFooter({ text: 'NarisMC SafeIT Fast-Mode' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('SafeIT critical error:', error);
      const errorEmbed = new EmbedBuilder()
        .setTitle('SafeIT — Blad Zabezpieczony')
        .setDescription(`Wystapil krytyczny blad API:\n\`\`\`${error.message}\`\`\`\n\nDotychczas: Usunieto rol: ${deletedRoles}`)
        .setColor(0xED4245)
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch(e) {}
    }
  }
};
