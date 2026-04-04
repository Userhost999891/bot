// /safeit — Emergency role cleanup & member audit
// Fixes duplicate roles, conflicting member assignments, and validates verification state
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('safeit')
    .setDescription('Audyt i naprawa ról weryfikacji — usuwa duplikaty i naprawia konflikty')
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

    // =============================================
    // PHASE 1: Deduplicate roles with the same name
    // =============================================
    log.push('**FAZA 1** — Analiza duplikatów ról');

    await guild.roles.fetch();

    const verifiedRoles = guild.roles.cache.filter(r => r.name === verifiedName);
    const unverifiedRoles = guild.roles.cache.filter(r => r.name === unverifiedName);

    let keepVerified = null;
    let keepUnverified = null;

    // Keep the oldest role (lowest position = created first), delete the rest
    if (verifiedRoles.size > 1) {
      const sorted = [...verifiedRoles.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      keepVerified = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        // Before deleting, migrate members from the duplicate role to the kept one
        const membersWithDupe = guild.members.cache.filter(m => m.roles.cache.has(sorted[i].id));
        for (const [, member] of membersWithDupe) {
          try {
            if (!member.roles.cache.has(keepVerified.id)) {
              await member.roles.add(keepVerified, 'SafeIT: migracja z duplikatu roli');
            }
          } catch(e) {}
        }
        try {
          await sorted[i].delete('SafeIT: usuwanie duplikatu roli');
          deletedRoles++;
        } catch(e) {
          log.push(`Nie mozna usunac roli duplikatu: ${sorted[i].name} (${sorted[i].id})`);
        }
      }
      log.push(`Rola "${verifiedName}": znaleziono ${verifiedRoles.size} duplikatow, zachowano 1, usunieto ${verifiedRoles.size - 1}`);
    } else if (verifiedRoles.size === 1) {
      keepVerified = verifiedRoles.first();
      log.push(`Rola "${verifiedName}": OK (1 instancja)`);
    } else {
      log.push(`Rola "${verifiedName}": BRAK — nie istnieje na serwerze`);
    }

    if (unverifiedRoles.size > 1) {
      const sorted = [...unverifiedRoles.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      keepUnverified = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const membersWithDupe = guild.members.cache.filter(m => m.roles.cache.has(sorted[i].id));
        for (const [, member] of membersWithDupe) {
          try {
            if (!member.roles.cache.has(keepUnverified.id)) {
              await member.roles.add(keepUnverified, 'SafeIT: migracja z duplikatu roli');
            }
          } catch(e) {}
        }
        try {
          await sorted[i].delete('SafeIT: usuwanie duplikatu roli');
          deletedRoles++;
        } catch(e) {
          log.push(`Nie mozna usunac roli duplikatu: ${sorted[i].name} (${sorted[i].id})`);
        }
      }
      log.push(`Rola "${unverifiedName}": znaleziono ${unverifiedRoles.size} duplikatow, zachowano 1, usunieto ${unverifiedRoles.size - 1}`);
    } else if (unverifiedRoles.size === 1) {
      keepUnverified = unverifiedRoles.first();
      log.push(`Rola "${unverifiedName}": OK (1 instancja)`);
    } else {
      log.push(`Rola "${unverifiedName}": BRAK — nie istnieje na serwerze`);
    }

    // =============================================
    // PHASE 2: Audit every member
    // =============================================
    log.push('');
    log.push('**FAZA 2** — Audyt uzytkownikow');

    await guild.members.fetch();

    let conflictBoth = 0;    // has both verified + unverified
    let duplicateRoles = 0;  // has same role twice (already handled by phase 1)
    let noRole = 0;          // has neither verified nor unverified
    let alreadyClean = 0;

    for (const [, member] of guild.members.cache) {
      if (member.user.bot) continue; // skip bots

      const hasVerified = keepVerified ? member.roles.cache.has(keepVerified.id) : false;
      const hasUnverified = keepUnverified ? member.roles.cache.has(keepUnverified.id) : false;

      // CONFLICT: User has BOTH roles
      if (hasVerified && hasUnverified) {
        // User is verified (has the verified role), so remove unverified
        try {
          await member.roles.remove(keepUnverified, 'SafeIT: konflikt — uzytkownik ma zweryfikowanego, usuwam niezweryfikowanego');
          conflictBoth++;
          fixedMembers++;
        } catch(e) {}
        continue;
      }

      // NO ROLE: User has neither (except bots)
      if (!hasVerified && !hasUnverified && keepUnverified) {
        try {
          await member.roles.add(keepUnverified, 'SafeIT: brak roli — przypisano niezweryfikowanego');
          noRole++;
          fixedMembers++;
        } catch(e) {}
        continue;
      }

      alreadyClean++;
    }

    log.push(`Konflikt (oba role): ${conflictBoth} naprawionych`);
    log.push(`Brak zadnej roli: ${noRole} naprawionych`);
    log.push(`Poprawni uzytkownicy: ${alreadyClean}`);

    // =============================================
    // PHASE 3: Summary
    // =============================================
    const summary = [
      `Usunieto duplikatow rol: **${deletedRoles}**`,
      `Naprawionych uzytkownikow: **${fixedMembers}**`,
      `Przeskanowano czlonkow: **${guild.members.cache.filter(m => !m.user.bot).size}**`,
    ].join('\n');

    const embed = new EmbedBuilder()
      .setTitle('SafeIT — Raport audytu')
      .setDescription(log.join('\n'))
      .addFields({ name: 'Podsumowanie', value: summary })
      .setColor(deletedRoles > 0 || fixedMembers > 0 ? 0xFEE75C : 0x57F287)
      .setFooter({ text: 'NarisMC SafeIT' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
