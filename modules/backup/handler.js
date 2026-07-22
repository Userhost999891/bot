// Backup / Restore całej struktury serwera Discord (role, kanały, kategorie, uprawnienia)
const { ChannelType, OverwriteType, PermissionsBitField } = require('discord.js');

const BACKUP_VERSION = 3;

// Typy kanałów, które umiemy odtworzyć
const RESTORABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum
]);

/**
 * Zbiera pełny snapshot serwera do obiektu JSON.
 */
async function createBackup(guild) {
  // Odśwież cache ról i kanałów
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});

  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id) // pomijamy @everyone jako osobny wpis (trzymany niżej)
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      position: r.position,
      permissions: r.permissions.bitfield.toString(),
      mentionable: r.mentionable,
      managed: r.managed,
      icon: r.iconURL() || null
    }));

  // @everyone trzymamy osobno — jego uprawnienia też chcemy odtworzyć
  const everyone = guild.roles.everyone;

  const serializeOverwrites = (channel) => {
    return channel.permissionOverwrites.cache.map(ow => ({
      id: ow.id,
      type: ow.type, // 0 = rola, 1 = użytkownik
      allow: ow.allow.bitfield.toString(),
      deny: ow.deny.bitfield.toString()
    }));
  };

  const channels = guild.channels.cache
    .filter(c => RESTORABLE_CHANNEL_TYPES.has(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      position: c.rawPosition,
      parentId: c.parentId || null,
      parentName: c.parent ? c.parent.name : null,
      topic: c.topic || null,
      nsfw: typeof c.nsfw === 'boolean' ? c.nsfw : false,
      rateLimitPerUser: c.rateLimitPerUser || 0,
      bitrate: c.bitrate || null,
      userLimit: c.userLimit || null,
      permissionOverwrites: serializeOverwrites(c)
    }));

  // Mapa członek -> jego role (do późniejszego przywrócenia ról tym samym osobom po ID)
  await guild.members.fetch().catch(() => {});
  const members = guild.members.cache
    .map(m => ({
      id: m.id,
      tag: m.user ? m.user.tag : null,
      // tylko role przypisywalne — bez @everyone i bez ról zarządzanych przez integracje
      roles: m.roles.cache
        .filter(r => r.id !== guild.id && !r.managed)
        .map(r => r.id)
    }))
    .filter(m => m.roles.length > 0); // zapisujemy tylko członków, którzy mają jakieś role

  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name,
      iconURL: guild.iconURL({ size: 256 }) || null,
      afkTimeout: guild.afkTimeout,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter
    },
    everyone: {
      permissions: everyone.permissions.bitfield.toString()
    },
    roles,
    channels,
    members
  };
}

/**
 * Waliduje kształt wgranego pliku backupu.
 */
function validateBackup(data) {
  if (!data || typeof data !== 'object') return 'Plik nie jest poprawnym backupem.';
  if (!Array.isArray(data.roles) || !Array.isArray(data.channels)) {
    return 'Backup nie zawiera listy ról lub kanałów.';
  }
  if (!data.version) return 'Backup nie ma numeru wersji.';
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Odtwarza strukturę z backupu — dodaje brakujące role/kanały i nakłada uprawnienia.
 * Domyślnie NIE usuwa niczego, co już istnieje na serwerze.
 *
 * options.deleteExtra — jeśli true, usuwa kanały i role (nie-zarządzane), których nie ma w backupie.
 */
async function restoreBackup(guild, data, options = {}) {
  const summary = {
    rolesCreated: 0, rolesUpdated: 0, rolesSkipped: 0,
    channelsCreated: 0, channelsUpdated: 0, channelsSkipped: 0,
    membersUpdated: 0, membersSkipped: 0,
    deleted: 0,
    errors: []
  };

  const me = guild.members.me;
  const myTopPosition = me ? me.roles.highest.position : 0;

  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});

  // === 1. ROLE ===
  // Mapowanie: stare ID roli z backupu -> aktualne ID roli na serwerze
  const roleMap = new Map();
  roleMap.set(data.guild?.id ? data.guild.id : '@everyone', guild.id);

  // Odtwarzamy od najniższej pozycji do najwyższej, żeby hierarchia wychodziła sensownie
  const rolesAscending = [...data.roles].sort((a, b) => a.position - b.position);

  for (const rb of rolesAscending) {
    // Ról zarządzanych przez integracje (boty, boost) nie da się tworzyć ręcznie
    if (rb.managed) {
      const existing = guild.roles.cache.find(r => r.name === rb.name && r.managed);
      if (existing) roleMap.set(rb.id, existing.id);
      summary.rolesSkipped++;
      continue;
    }

    let role = guild.roles.cache.find(r => r.name === rb.name && r.id !== guild.id && !r.managed);

    try {
      if (role) {
        // Aktualizujemy tylko role, które bot może edytować (poniżej swojej najwyższej roli)
        if (role.position < myTopPosition) {
          await role.edit({
            color: rb.color,
            hoist: rb.hoist,
            mentionable: rb.mentionable,
            permissions: BigInt(rb.permissions || '0')
          }).catch(e => { throw e; });
          summary.rolesUpdated++;
        } else {
          summary.rolesSkipped++;
        }
        roleMap.set(rb.id, role.id);
      } else {
        role = await guild.roles.create({
          name: rb.name,
          color: rb.color,
          hoist: rb.hoist,
          mentionable: rb.mentionable,
          permissions: BigInt(rb.permissions || '0'),
          reason: 'Przywracanie backupu — NarisMC Core'
        });
        roleMap.set(rb.id, role.id);
        summary.rolesCreated++;
        await sleep(120); // łagodny rate-limit
      }
    } catch (e) {
      summary.errors.push(`Rola "${rb.name}": ${e.message}`);
    }
  }

  // Uprawnienia @everyone
  try {
    if (data.everyone?.permissions) {
      await guild.roles.everyone.setPermissions(BigInt(data.everyone.permissions), 'Przywracanie backupu');
    }
  } catch (e) {
    summary.errors.push(`@everyone: ${e.message}`);
  }

  // Pomocnik: przetłumacz nadpisania uprawnień z backupu na aktualne ID
  const translateOverwrites = (overwrites) => {
    const result = [];
    for (const ow of overwrites || []) {
      if (ow.type === OverwriteType.Role) {
        // @everyone
        if (ow.id === data.guild?.id) {
          result.push({ id: guild.id, type: OverwriteType.Role, allow: BigInt(ow.allow), deny: BigInt(ow.deny) });
          continue;
        }
        const newId = roleMap.get(ow.id);
        if (newId) {
          result.push({ id: newId, type: OverwriteType.Role, allow: BigInt(ow.allow), deny: BigInt(ow.deny) });
        }
        // rola której nie odtworzono — pomijamy nadpisanie
      } else {
        // nadpisanie dla użytkownika — tylko jeśli nadal jest na serwerze
        if (guild.members.cache.has(ow.id)) {
          result.push({ id: ow.id, type: OverwriteType.Member, allow: BigInt(ow.allow), deny: BigInt(ow.deny) });
        }
      }
    }
    return result;
  };

  // === 2. KATEGORIE (muszą powstać przed kanałami, bo są rodzicami) ===
  const categoryMap = new Map(); // stare ID kategorii -> aktualny kanał-kategoria
  const backupCategories = data.channels.filter(c => c.type === ChannelType.GuildCategory);

  for (const cb of backupCategories) {
    let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === cb.name);
    try {
      if (!cat) {
        cat = await guild.channels.create({
          name: cb.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: translateOverwrites(cb.permissionOverwrites),
          reason: 'Przywracanie backupu — NarisMC Core'
        });
        summary.channelsCreated++;
        await sleep(120);
      } else {
        await cat.permissionOverwrites.set(translateOverwrites(cb.permissionOverwrites)).catch(() => {});
        summary.channelsUpdated++;
      }
      categoryMap.set(cb.id, cat);
    } catch (e) {
      summary.errors.push(`Kategoria "${cb.name}": ${e.message}`);
    }
  }

  // === 3. POZOSTAŁE KANAŁY ===
  const nonCategories = data.channels.filter(c => c.type !== ChannelType.GuildCategory);

  for (const cb of nonCategories) {
    const parent = cb.parentId ? categoryMap.get(cb.parentId) : null;

    // Dopasuj istniejący kanał po nazwie, typie i tej samej kategorii-rodzicu
    let channel = guild.channels.cache.find(c =>
      c.type === cb.type &&
      c.name === cb.name &&
      (c.parentId || null) === (parent ? parent.id : null)
    );

    const createOpts = {
      name: cb.name,
      type: cb.type,
      parent: parent ? parent.id : undefined,
      reason: 'Przywracanie backupu — NarisMC Core'
    };
    if (cb.topic) createOpts.topic = cb.topic;
    if (cb.nsfw) createOpts.nsfw = cb.nsfw;
    if (cb.rateLimitPerUser) createOpts.rateLimitPerUser = cb.rateLimitPerUser;
    if (cb.type === ChannelType.GuildVoice || cb.type === ChannelType.GuildStageVoice) {
      if (cb.bitrate) createOpts.bitrate = Math.min(cb.bitrate, guild.maximumBitrate || 96000);
      if (cb.userLimit) createOpts.userLimit = cb.userLimit;
    }

    try {
      if (!channel) {
        createOpts.permissionOverwrites = translateOverwrites(cb.permissionOverwrites);
        channel = await guild.channels.create(createOpts);
        summary.channelsCreated++;
        await sleep(120);
      } else {
        // Kanał istnieje — aktualizujemy tylko uprawnienia (nie ruszamy treści kanału)
        await channel.permissionOverwrites.set(translateOverwrites(cb.permissionOverwrites)).catch(() => {});
        summary.channelsUpdated++;
      }
    } catch (e) {
      summary.errors.push(`Kanał "${cb.name}": ${e.message}`);
    }
  }

  // === 3b. ROLE CZŁONKÓW — ponadawaj role tym samym osobom (po ID użytkownika) ===
  if (Array.isArray(data.members) && data.members.length) {
    await guild.members.fetch().catch(() => {});
    for (const mb of data.members) {
      const member = guild.members.cache.get(mb.id);
      if (!member) { summary.membersSkipped++; continue; } // osoby już nie ma na serwerze

      // Zmapuj stare ID ról na aktualne i odfiltruj: nieistniejące, nad botem, zarządzane, już posiadane
      const roleIds = (mb.roles || [])
        .map(oldId => roleMap.get(oldId))
        .filter(newId => {
          if (!newId) return false;
          const role = guild.roles.cache.get(newId);
          return role && !role.managed && role.position < myTopPosition && !member.roles.cache.has(newId);
        });

      if (roleIds.length === 0) { summary.membersSkipped++; continue; }

      try {
        await member.roles.add([...new Set(roleIds)], 'Przywracanie backupu — role członków');
        summary.membersUpdated++;
        await sleep(150); // członków bywa dużo — łagodniejszy rate-limit
      } catch (e) {
        summary.errors.push(`Członek ${mb.tag || mb.id}: ${e.message}`);
      }
    }
  }

  // === 4. OPCJONALNE USUWANIE TEGO, CZEGO NIE MA W BACKUPIE ===
  if (options.deleteExtra) {
    const backupChannelNames = new Set(data.channels.map(c => `${c.type}:${c.name}`));
    for (const [, channel] of guild.channels.cache) {
      if (!RESTORABLE_CHANNEL_TYPES.has(channel.type)) continue;
      if (!backupChannelNames.has(`${channel.type}:${channel.name}`)) {
        try { await channel.delete('Przywracanie backupu — usuwanie nadmiarowych'); summary.deleted++; await sleep(120); }
        catch (e) { summary.errors.push(`Usuwanie #${channel.name}: ${e.message}`); }
      }
    }

    const backupRoleNames = new Set(data.roles.map(r => r.name));
    for (const [, role] of guild.roles.cache) {
      if (role.id === guild.id || role.managed) continue;
      if (role.position >= myTopPosition) continue; // nie ruszaj ról nad botem
      if (!backupRoleNames.has(role.name)) {
        try { await role.delete('Przywracanie backupu — usuwanie nadmiarowych'); summary.deleted++; await sleep(120); }
        catch (e) { summary.errors.push(`Usuwanie roli ${role.name}: ${e.message}`); }
      }
    }
  }

  return summary;
}

module.exports = { createBackup, restoreBackup, validateBackup, BACKUP_VERSION };
