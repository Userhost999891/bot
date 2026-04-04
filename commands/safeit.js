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
    log.push('**FAZA 1** — Analiza duplikatow rol');

    await guild.roles.fetch();

    // Fuzzy match: find all roles that contain the verified/unverified name (case-insensitive)
    const verifiedNameLower = verifiedName.toLowerCase();
    const unverifiedNameLower = unverifiedName.toLowerCase();

    const verifiedRoles = guild.roles.cache.filter(r => r.name.toLowerCase().includes(verifiedNameLower));
    const unverifiedRoles = guild.roles.cache.filter(r => r.name.toLowerCase().includes(unverifiedNameLower));

    let keepVerified = null;
    let keepUnverified = null;

    // Helper: process a group of duplicate roles
    // Prefers exact name match as the one to keep, otherwise oldest
    async function deduplicateRoles(roles, exactName, label) {
      if (roles.size === 0) {
        log.push(`Rola "${label}": BRAK — nie istnieje na serwerze`);
        return null;
      }

      const sorted = [...roles.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      // Prefer exact match as the one to keep
      let keep = sorted.find(r => r.name === exactName) || sorted[0];

      if (roles.size === 1) {
        log.push(`Rola "${label}": OK (1 instancja: "${keep.name}")`);
        return keep;
      }

      // Log all found variants
      const variants = sorted.map(r => `"${r.name}" (${r.id})`).join(', ');
      log.push(`Rola "${label}": znaleziono ${roles.size} wariantow: ${variants}`);

      // Fetch all members to migrate properly
      await guild.members.fetch();

      for (const role of sorted) {
        if (role.id === keep.id) continue; // skip the one we keep

        const membersWithDupe = guild.members.cache.filter(m => m.roles.cache.has(role.id));
        for (const [, member] of membersWithDupe) {
          try {
            if (!member.roles.cache.has(keep.id)) {
              await member.roles.add(keep, `SafeIT: migracja z "${role.name}" na "${keep.name}"`);
            }
          } catch(e) {}
        }
        try {
          await role.delete(`SafeIT: usuwanie duplikatu/wariantu roli "${role.name}"`);
          deletedRoles++;
        } catch(e) {
          log.push(`Nie mozna usunac roli: ${role.name} (${role.id})`);
        }
      }

      log.push(`Zachowano: "${keep.name}" (${keep.id}), usunieto ${roles.size - 1} duplikatow`);
      return keep;
    }

    keepVerified = await deduplicateRoles(verifiedRoles, verifiedName, verifiedName);
    keepUnverified = await deduplicateRoles(unverifiedRoles, unverifiedName, unverifiedName);

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
