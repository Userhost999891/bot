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

      const verifiedNameLower = verifiedName.toLowerCase();
      const unverifiedNameLower = unverifiedName.toLowerCase();

      const verifiedRoles = guild.roles.cache.filter(r => r.name.toLowerCase().includes(verifiedNameLower));
      const unverifiedRoles = guild.roles.cache.filter(r => r.name.toLowerCase().includes(unverifiedNameLower));

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

        // Fetch members once
        await guild.members.fetch();

        for (const role of sorted) {
          if (role.id === keep.id) continue;

          const membersWithDupe = guild.members.cache.filter(m => m.roles.cache.has(role.id));
          for (const [, member] of membersWithDupe) {
            try {
              if (!member.roles.cache.has(keep.id)) {
                await member.roles.add(keep, 'SafeIT: migracja na glowna role');
                await sleep(400); // throttle
              }
              // EXPLICITLY remove the duplicate role from the user!
              if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role, 'SafeIT: usuniecie duplikatu');
                fixedMembers++;
                await sleep(400);
              }
            } catch(e) {}
          }
          try {
            await role.delete('SafeIT: duplikat');
            deletedRoles++;
            await sleep(500);
          } catch(e) {
            log.push(`⚠️ Zabrano duplikat graczom, ale usuniecie roli na serwerze odrzucone (brak permisji/hierarchia): ${role.name}`);
          }
        }

        log.push(`Zachowano: "${keep.name}", usunieto ${roles.size - 1}`);
        return keep;
      }

      keepVerified = await deduplicateRoles(verifiedRoles, verifiedName, verifiedName);
      keepUnverified = await deduplicateRoles(unverifiedRoles, unverifiedName, unverifiedName);

      // =============================================
      // PHASE 2: Audit members
      // =============================================
      log.push('');
      log.push('**FAZA 2** — Audyt uzytkownikow');

      await guild.members.fetch();

      let conflictBoth = 0;
      let noRole = 0;
      let alreadyClean = 0;
      let opCount = 0;

      const members = guild.members.cache.filter(m => !m.user.bot);

      for (const [, member] of members) {
        const hasVerified = keepVerified ? member.roles.cache.has(keepVerified.id) : false;
        const hasUnverified = keepUnverified ? member.roles.cache.has(keepUnverified.id) : false;

        if (hasVerified && hasUnverified) {
          try {
            await member.roles.remove(keepUnverified, 'SafeIT: konflikt');
            conflictBoth++;
            fixedMembers++;
            opCount++;
            if (opCount % 5 === 0) await sleep(1000); // throttle every 5 ops
          } catch(e) {}
          continue;
        }

        if (!hasVerified && !hasUnverified && keepUnverified) {
          try {
            await member.roles.add(keepUnverified, 'SafeIT: brak roli');
            noRole++;
            fixedMembers++;
            opCount++;
            if (opCount % 5 === 0) await sleep(1000);
          } catch(e) {}
          continue;
        }

        alreadyClean++;
      }

      log.push(`Konflikt (oba role): ${conflictBoth}`);
      log.push(`Brak roli: ${noRole}`);
      log.push(`Poprawni: ${alreadyClean}`);

      // =============================================
      // PHASE 3: Summary
      // =============================================
      const summary = [
        `Usunieto duplikatow rol: **${deletedRoles}**`,
        `Naprawionych uzytkownikow: **${fixedMembers}**`,
        `Przeskanowano: **${members.size}**`,
      ].join('\n');

      const embed = new EmbedBuilder()
        .setTitle('SafeIT — Raport')
        .setDescription(log.join('\n'))
        .addFields({ name: 'Podsumowanie', value: summary })
        .setColor(deletedRoles > 0 || fixedMembers > 0 ? 0xFEE75C : 0x57F287)
        .setFooter({ text: 'NarisMC SafeIT' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('SafeIT critical error:', error);
      const errorEmbed = new EmbedBuilder()
        .setTitle('SafeIT — Blad')
        .setDescription(`Wystapil blad podczas audytu:\n\`\`\`${error.message}\`\`\`\n\nDotychczasowy postep:\n${log.join('\n')}\n\nUsunieto rol: ${deletedRoles}\nNaprawiono: ${fixedMembers}`)
        .setColor(0xED4245)
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch(e) {
        console.error('SafeIT: cannot send error reply:', e.message);
      }
    }
  }
};
