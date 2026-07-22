// NarisMC Core Bot — Database Module (MySQL)
const mysql = require('mysql2/promise');

let pool = null;

async function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });

  try {
    // === REWARDS TABLES ===
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS reward_servers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        server_id VARCHAR(32) NOT NULL,
        server_name VARCHAR(64) NOT NULL,
        channel_id VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_server (guild_id, server_id),
        UNIQUE KEY unique_channel (guild_id, channel_id)
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rewards_pending (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(16) NOT NULL,
        discord_id VARCHAR(20) NOT NULL,
        discord_tag VARCHAR(50),
        guild_id VARCHAR(20) NOT NULL,
        server_id VARCHAR(32) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_player_server (player_name, server_id)
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rewards_claimed (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(16) NOT NULL,
        server_id VARCHAR(32) NOT NULL,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_claim (player_name, server_id)
      )
    `);

    // === CONFIG TABLES (Migrated from SQLite) ===
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id VARCHAR(20) PRIMARY KEY,
        verification_channel_id VARCHAR(20),
        verified_role_name VARCHAR(100) DEFAULT 'Zweryfikowany',
        unverified_role_name VARCHAR(100) DEFAULT 'Niezweryfikowany',
        verified_role_id VARCHAR(20) DEFAULT NULL,
        unverified_role_id VARCHAR(20) DEFAULT NULL,
        visible_channels TEXT,
        verification_message_id VARCHAR(20),
        boost_channel_id VARCHAR(20),
        reward_bypass_ids TEXT DEFAULT NULL,
        lobby_channel_id VARCHAR(20) DEFAULT NULL
      )
    `);
    try {
      await pool.execute(`
        ALTER TABLE guild_config ADD COLUMN boost_channel_id VARCHAR(20) DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę boost_channel_id do guild_config.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }
    try {
      await pool.execute(`
        ALTER TABLE guild_config ADD COLUMN reward_bypass_ids TEXT DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę reward_bypass_ids do guild_config.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }
    try {
      await pool.execute(`
        ALTER TABLE guild_config ADD COLUMN lobby_channel_id VARCHAR(20) DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę lobby_channel_id do guild_config.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }
    try {
      await pool.execute(`
        ALTER TABLE guild_config ADD COLUMN verified_role_id VARCHAR(20) DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę verified_role_id do guild_config.');
    } catch (e) {}
    try {
      await pool.execute(`
        ALTER TABLE guild_config ADD COLUMN unverified_role_id VARCHAR(20) DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę unverified_role_id do guild_config.');
    } catch (e) {}
    try {
      await pool.execute(`
        ALTER TABLE rewards_pending DROP INDEX unique_player
      `);
      console.log('✅ Migracja: Usunięto przestarzały indeks unique_player z rewards_pending.');
    } catch (e) {
      // Ignoruj błąd jeśli indeks nie istnieje lub został już usunięty
    }
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS saved_roles (
        guild_id VARCHAR(20),
        user_id VARCHAR(20),
        role_ids TEXT,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_config (
        guild_id VARCHAR(20) PRIMARY KEY,
        ticket_channel_id VARCHAR(20),
        support_role_id VARCHAR(20),
        ticket_message_id VARCHAR(20),
        log_channel_id VARCHAR(20),
        next_ticket_number INT DEFAULT 1,
        max_tickets INT DEFAULT 50
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ticket_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        emoji VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '📋',
        description VARCHAR(255) DEFAULT '',
        discord_category_id VARCHAR(20),
        color VARCHAR(20) DEFAULT '#5865F2',
        sort_order INT DEFAULT 0
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS active_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        channel_id VARCHAR(20) UNIQUE NOT NULL,
        user_id VARCHAR(20) NOT NULL,
        category_name VARCHAR(100),
        claimed_by VARCHAR(20),
        ticket_number INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    // Migracja: konwersja active_tickets na utf8mb4 (dla istniejących tabel)
    try {
      await pool.execute(`ALTER TABLE active_tickets CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (e) {
      // Ignoruj jeśli już skonwertowane
    }
    try {
      await pool.execute(`
        ALTER TABLE active_tickets ADD COLUMN mc_nick VARCHAR(16) DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę mc_nick do active_tickets.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }
    try {
      await pool.execute(`
        ALTER TABLE ticket_categories ADD COLUMN requires_mc_nick TINYINT(1) DEFAULT 0
      `);
      console.log('✅ Migracja: Dodano kolumnę requires_mc_nick do ticket_categories.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }
    try {
      await pool.execute(`
        ALTER TABLE ticket_config ADD COLUMN support_role_ids TEXT DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę support_role_ids do ticket_config.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS pending_commands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(16) NOT NULL,
        command TEXT NOT NULL,
        source VARCHAR(50) DEFAULT 'discord',
        guild_id VARCHAR(20),
        status ENUM('pending','executed','failed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        executed_at TIMESTAMP NULL
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS announcements_config (
        guild_id VARCHAR(20) PRIMARY KEY,
        default_channel_id VARCHAR(20),
        default_color VARCHAR(20) DEFAULT '#5865F2',
        footer_text VARCHAR(100) DEFAULT 'NarisMC'
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tictactoe_stats (
        guild_id VARCHAR(20) NOT NULL,
        user_id VARCHAR(20) NOT NULL,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        draws INT DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tictactoe_config (
        guild_id VARCHAR(20) PRIMARY KEY,
        channel_id VARCHAR(20),
        message_id VARCHAR(20)
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS guild_backups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        name VARCHAR(120) NOT NULL,
        created_by VARCHAR(20),
        created_by_tag VARCHAR(64),
        role_count INT DEFAULT 0,
        channel_count INT DEFAULT 0,
        member_count INT DEFAULT 0,
        data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_guild (guild_id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    try {
      await pool.execute(`
        ALTER TABLE reward_servers ADD COLUMN clink VARCHAR(64) DEFAULT NULL
      `);
      console.log('✅ Migracja: Dodano kolumnę clink do reward_servers.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }
    try {
      await pool.execute(`
        ALTER TABLE guild_backups ADD COLUMN member_count INT DEFAULT 0
      `);
      console.log('✅ Migracja: Dodano kolumnę member_count do guild_backups.');
    } catch (e) {
      // Ignoruj błąd jeśli kolumna już istnieje
    }

    // Ensure utf8mb4 conversion for dynamic discord inputs containing emojis
    const tables = ['guild_config', 'ticket_config', 'announcements_config', 'reward_servers', 'ticket_categories'];
    for (const tableName of tables) {
      try {
        await pool.execute(`ALTER TABLE ${tableName} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      } catch(e) {}
    }

    // Ensure connection is OK
    await pool.query('SELECT 1');

    console.log('✅ Baza MySQL uruchomiona. Tabele konfiguracyjne załadowane.');
  } catch (error) {
    console.error('❌ Błąd startu MySQL:', error.message);
  }

  return pool;
}

// =====================
// VERIFICATION FUNCTIONS
// =====================
async function getConfig(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM guild_config WHERE guild_id = ?', [guildId]);
  if (rows.length > 0) {
    if (rows[0].visible_channels) {
      try { rows[0].visible_channels = JSON.parse(rows[0].visible_channels); } catch (e) { rows[0].visible_channels = []; }
    } else {
      rows[0].visible_channels = [];
    }
    return rows[0];
  }
  return null;
}

async function setConfig(guildId, config) {
  const p = await getPool();
  const existing = await getConfig(guildId);
  const channelsStr = config.visible_channels ? JSON.stringify(config.visible_channels) : '[]';

  if (existing) {
    const boostChannel = config.boost_channel_id !== undefined ? (config.boost_channel_id || null) : existing.boost_channel_id;
    const rewardBypassIds = config.reward_bypass_ids !== undefined ? (config.reward_bypass_ids || null) : existing.reward_bypass_ids;
    const lobbyChannel = config.lobby_channel_id !== undefined ? (config.lobby_channel_id || null) : existing.lobby_channel_id;
    const verifiedRoleId = config.verified_role_id !== undefined ? (config.verified_role_id || null) : existing.verified_role_id;
    const unverifiedRoleId = config.unverified_role_id !== undefined ? (config.unverified_role_id || null) : existing.unverified_role_id;

    await p.execute(`
      UPDATE guild_config SET
        verification_channel_id = COALESCE(?, verification_channel_id),
        verified_role_name = COALESCE(?, verified_role_name),
        unverified_role_name = COALESCE(?, unverified_role_name),
        verified_role_id = ?,
        unverified_role_id = ?,
        visible_channels = COALESCE(?, visible_channels),
        verification_message_id = COALESCE(?, verification_message_id),
        boost_channel_id = ?,
        reward_bypass_ids = ?,
        lobby_channel_id = ?
      WHERE guild_id = ?
    `, [
      config.verification_channel_id || null,
      config.verified_role_name || null,
      config.unverified_role_name || null,
      verifiedRoleId,
      unverifiedRoleId,
      config.visible_channels ? channelsStr : null,
      config.verification_message_id || null,
      boostChannel,
      rewardBypassIds,
      lobbyChannel,
      guildId
    ]);
  } else {
    await p.execute(`
      INSERT INTO guild_config (guild_id, verification_channel_id, verified_role_name, unverified_role_name, verified_role_id, unverified_role_id, visible_channels, verification_message_id, boost_channel_id, reward_bypass_ids, lobby_channel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      guildId,
      config.verification_channel_id || null,
      config.verified_role_name || 'Zweryfikowany',
      config.unverified_role_name || 'Niezweryfikowany',
      config.verified_role_id || null,
      config.unverified_role_id || null,
      channelsStr,
      config.verification_message_id || null,
      config.boost_channel_id || null,
      config.reward_bypass_ids || null,
      config.lobby_channel_id || null
    ]);
  }
}

async function getAllConfigs() {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM guild_config');
  return rows.map(r => {
    if (r.visible_channels) {
      try { r.visible_channels = JSON.parse(r.visible_channels); } catch (e) { r.visible_channels = []; }
    }
    return r;
  });
}

async function saveUserRoles(guildId, userId, roleIds) {
  const p = await getPool();
  await p.execute(
    'INSERT INTO saved_roles (guild_id, user_id, role_ids) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_ids = ?',
    [guildId, userId, JSON.stringify(roleIds), JSON.stringify(roleIds)]
  );
}

async function getSavedRoles(guildId, userId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT role_ids FROM saved_roles WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (rows.length > 0 && rows[0].role_ids) {
    try { return JSON.parse(rows[0].role_ids); } catch(e) { return null; }
  }
  return null;
}

async function deleteSavedRoles(guildId, userId) {
  const p = await getPool();
  await p.execute('DELETE FROM saved_roles WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// =====================
// TICKET FUNCTIONS
// =====================
async function getTicketConfig(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM ticket_config WHERE guild_id = ?', [guildId]);
  return rows.length > 0 ? rows[0] : null;
}

async function setTicketConfig(guildId, config) {
  const p = await getPool();
  const existing = await getTicketConfig(guildId);

  // support_role_ids przechowujemy jako JSON-owa tablica ID ról
  const roleIdsJson = config.support_role_ids !== undefined
    ? JSON.stringify(Array.isArray(config.support_role_ids) ? config.support_role_ids : [])
    : undefined;

  if (existing) {
    // Nadpisujemy tylko pola jawnie przekazane — undefined zachowuje starą wartość,
    // a pusta wartość (null/'') faktycznie czyści pole (COALESCE na to nie pozwalał)
    const ticketChannelId = config.ticket_channel_id !== undefined ? (config.ticket_channel_id || null) : existing.ticket_channel_id;
    const supportRoleId = config.support_role_id !== undefined ? (config.support_role_id || null) : existing.support_role_id;
    const supportRoleIds = roleIdsJson !== undefined ? roleIdsJson : existing.support_role_ids;
    const ticketMessageId = config.ticket_message_id !== undefined ? (config.ticket_message_id || null) : existing.ticket_message_id;
    const logChannelId = config.log_channel_id !== undefined ? (config.log_channel_id || null) : existing.log_channel_id;

    await p.execute(`
      UPDATE ticket_config SET
        ticket_channel_id = ?,
        support_role_id = ?,
        support_role_ids = ?,
        ticket_message_id = ?,
        log_channel_id = ?
      WHERE guild_id = ?
    `, [ticketChannelId, supportRoleId, supportRoleIds, ticketMessageId, logChannelId, guildId]);
  } else {
    await p.execute(`
      INSERT INTO ticket_config (guild_id, ticket_channel_id, support_role_id, support_role_ids, ticket_message_id, log_channel_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      guildId,
      config.ticket_channel_id || null,
      config.support_role_id || null,
      roleIdsJson || null,
      config.ticket_message_id || null,
      config.log_channel_id || null
    ]);
  }
}

async function getNextTicketNumber(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT next_ticket_number FROM ticket_config WHERE guild_id = ?', [guildId]);
  const num = rows.length > 0 ? rows[0].next_ticket_number : 1;
  if (rows.length === 0) {
    await p.execute('INSERT IGNORE INTO ticket_config (guild_id, next_ticket_number) VALUES (?, ?)', [guildId, num + 1]);
  } else {
    await p.execute('UPDATE ticket_config SET next_ticket_number = ? WHERE guild_id = ?', [num + 1, guildId]);
  }
  return num;
}

async function getTicketCategories(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY sort_order ASC', [guildId]);
  return rows;
}

async function addTicketCategory(guildId, category) {
  const p = await getPool();
  await p.execute(`
    INSERT INTO ticket_categories (guild_id, name, emoji, description, discord_category_id, color, sort_order, requires_mc_nick)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    guildId,
    category.name,
    category.emoji || '📋',
    category.description || '',
    category.discord_category_id || null,
    category.color || '#5865F2',
    category.sort_order || 0,
    category.requires_mc_nick ? 1 : 0
  ]);
}

async function updateTicketCategory(id, category) {
  const p = await getPool();
  await p.execute(`
    UPDATE ticket_categories SET
      name = COALESCE(?, name),
      emoji = COALESCE(?, emoji),
      description = COALESCE(?, description),
      discord_category_id = COALESCE(?, discord_category_id),
      color = COALESCE(?, color),
      sort_order = COALESCE(?, sort_order),
      requires_mc_nick = ?
    WHERE id = ?
  `, [
    category.name || null,
    category.emoji || null,
    category.description || null,
    category.discord_category_id || null,
    category.color || null,
    category.sort_order != null ? category.sort_order : null,
    category.requires_mc_nick != null ? (category.requires_mc_nick ? 1 : 0) : 0,
    id
  ]);
}

async function deleteTicketCategory(id) {
  const p = await getPool();
  await p.execute('DELETE FROM ticket_categories WHERE id = ?', [id]);
}

async function createActiveTicket(guildId, channelId, userId, categoryName, ticketNumber, mcNick = null) {
  const p = await getPool();
  await p.execute(`
    INSERT INTO active_tickets (guild_id, channel_id, user_id, category_name, ticket_number, mc_nick)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [guildId, channelId, userId, categoryName, ticketNumber, mcNick]);
}

async function getActiveTicket(channelId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM active_tickets WHERE channel_id = ?', [channelId]);
  return rows.length > 0 ? rows[0] : null;
}

async function countActiveTickets(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT COUNT(*) as count FROM active_tickets WHERE guild_id = ?', [guildId]);
  return rows[0].count;
}

async function countUserActiveTickets(guildId, userId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT COUNT(*) as count FROM active_tickets WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return rows[0].count;
}

async function getLastUserTicketTime(guildId, userId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT created_at FROM active_tickets WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', [guildId, userId]);
  return rows.length > 0 ? rows[0].created_at : null;
}

async function claimTicket(channelId, userId) {
  const p = await getPool();
  // Warunek claimed_by IS NULL chroni przed równoczesnym odebraniem przez dwie osoby
  const [result] = await p.execute(
    'UPDATE active_tickets SET claimed_by = ? WHERE channel_id = ? AND claimed_by IS NULL',
    [userId, channelId]
  );
  return result.affectedRows > 0;
}

async function forceClaimTicket(channelId, userId) {
  const p = await getPool();
  // Wersja bez warunku — nadpisuje istniejący claim (komenda /force-odbierzticket)
  await p.execute('UPDATE active_tickets SET claimed_by = ? WHERE channel_id = ?', [userId, channelId]);
}

async function deleteActiveTicket(channelId) {
  const p = await getPool();
  await p.execute('DELETE FROM active_tickets WHERE channel_id = ?', [channelId]);
}

async function getActiveTicketChannelIds(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT channel_id FROM active_tickets WHERE guild_id = ?', [guildId]);
  return rows.map(r => r.channel_id);
}

// =====================
// ANNOUNCEMENTS FUNCTIONS
// =====================
async function getAnnouncementsConfig(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM announcements_config WHERE guild_id = ?', [guildId]);
  return rows.length > 0 ? rows[0] : null;
}

async function setAnnouncementsConfig(guildId, config) {
  const p = await getPool();
  const existing = await getAnnouncementsConfig(guildId);
  if (existing) {
    await p.execute(`
      UPDATE announcements_config SET
        default_channel_id = COALESCE(?, default_channel_id),
        default_color = COALESCE(?, default_color),
        footer_text = COALESCE(?, footer_text)
      WHERE guild_id = ?
    `, [
      config.default_channel_id || null,
      config.default_color || null,
      config.footer_text || null,
      guildId
    ]);
  } else {
    await p.execute(`
      INSERT INTO announcements_config (guild_id, default_channel_id, default_color, footer_text)
      VALUES (?, ?, ?, ?)
    `, [
      guildId,
      config.default_channel_id || null,
      config.default_color || '#5865F2',
      config.footer_text || 'NarisMC'
    ]);
  }
}

// =====================
// TIC-TAC-TOE FUNCTIONS
// =====================
async function getTTTStats(guildId, userId) {
  const p = await getPool();
  let [rows] = await p.execute('SELECT * FROM tictactoe_stats WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (rows.length === 0) {
    await p.execute('INSERT INTO tictactoe_stats (guild_id, user_id) VALUES (?, ?)', [guildId, userId]);
    return { guild_id: guildId, user_id: userId, wins: 0, losses: 0, draws: 0 };
  }
  return rows[0];
}

async function updateTTTStats(guildId, userId, result) {
  const p = await getPool();
  await getTTTStats(guildId, userId); // Ensure exists
  if (result === 'win') {
    await p.execute('UPDATE tictactoe_stats SET wins = wins + 1 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  } else if (result === 'loss') {
    await p.execute('UPDATE tictactoe_stats SET losses = losses + 1 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  } else {
    await p.execute('UPDATE tictactoe_stats SET draws = draws + 1 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  }
}

async function getTTTLeaderboard(guildId, limit = 10) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM tictactoe_stats WHERE guild_id = ? ORDER BY wins DESC LIMIT ?', [guildId, limit]);
  return rows;
}

async function getTTTConfig(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM tictactoe_config WHERE guild_id = ?', [guildId]);
  return rows.length > 0 ? rows[0] : null;
}

async function setTTTConfig(guildId, config) {
  const p = await getPool();
  const existing = await getTTTConfig(guildId);
  if (existing) {
    await p.execute(`
      UPDATE tictactoe_config SET
        channel_id = COALESCE(?, channel_id),
        message_id = COALESCE(?, message_id)
      WHERE guild_id = ?
    `, [
      config.channel_id || null,
      config.message_id || null,
      guildId
    ]);
  } else {
    await p.execute(`
      INSERT INTO tictactoe_config (guild_id, channel_id, message_id)
      VALUES (?, ?, ?)
    `, [
      guildId,
      config.channel_id || null,
      config.message_id || null
    ]);
  }
}

// === REWARD SERVERS (multi-server config) ===
async function getRewardServers(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM reward_servers WHERE guild_id = ? ORDER BY server_name', [guildId]);
  return rows;
}
async function addRewardServer(guildId, serverId, serverName, channelId, clink = null) {
  const p = await getPool();
  await p.execute(
    'INSERT INTO reward_servers (guild_id, server_id, server_name, channel_id, clink) VALUES (?, ?, ?, ?, ?)',
    [guildId, serverId, serverName, channelId, clink]
  );
}
async function updateRewardServer(id, serverName, channelId, clink = null) {
  const p = await getPool();
  await p.execute('UPDATE reward_servers SET server_name = ?, channel_id = ?, clink = ? WHERE id = ?', [serverName, channelId, clink, id]);
}
async function getRewardServerByClink(clink) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM reward_servers WHERE clink = ?', [clink]);
  return rows.length > 0 ? rows[0] : null;
}
async function deleteRewardServer(id) {
  const p = await getPool();
  await p.execute('DELETE FROM reward_servers WHERE id = ?', [id]);
}
async function getAllRewardChannels() {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM reward_servers');
  return rows;
}
async function getServerByChannel(channelId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM reward_servers WHERE channel_id = ?', [channelId]);
  return rows.length > 0 ? rows[0] : null;
}
async function hasClaimedReward(playerName, serverId) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT 1 FROM rewards_pending WHERE player_name = ? AND server_id = ?',
    [playerName.toLowerCase(), serverId]
  );
  return rows.length > 0;
}
async function addPendingReward(playerName, discordId, discordTag, guildId, serverId) {
  const p = await getPool();
  await p.execute(
    'INSERT INTO rewards_pending (player_name, discord_id, discord_tag, guild_id, server_id) VALUES (?, ?, ?, ?, ?)',
    [playerName.toLowerCase(), discordId, discordTag, guildId, serverId]
  );
}
async function getPendingRewards(serverId) {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT rp.player_name, rp.discord_id, rp.discord_tag
     FROM rewards_pending rp
     WHERE rp.server_id = ?
     AND NOT EXISTS (
       SELECT 1 FROM rewards_claimed rc
       WHERE rc.player_name = rp.player_name AND rc.server_id = rp.server_id
     )`,
    [serverId]
  );
  return rows;
}
async function markRewardClaimed(playerName, serverId) {
  const p = await getPool();
  await p.execute(
    'INSERT IGNORE INTO rewards_claimed (player_name, server_id) VALUES (?, ?)',
    [playerName.toLowerCase(), serverId]
  );
}
async function removeReward(playerName, serverId) {
  const p = await getPool();
  const nick = playerName.toLowerCase();
  let removed = 0;
  if (serverId) {
    const [r1] = await p.execute('DELETE FROM rewards_pending WHERE player_name = ? AND server_id = ?', [nick, serverId]);
    const [r2] = await p.execute('DELETE FROM rewards_claimed WHERE player_name = ? AND server_id = ?', [nick, serverId]);
    removed = (r1.affectedRows || 0) + (r2.affectedRows || 0);
  } else {
    const [r1] = await p.execute('DELETE FROM rewards_pending WHERE player_name = ?', [nick]);
    const [r2] = await p.execute('DELETE FROM rewards_claimed WHERE player_name = ?', [nick]);
    removed = (r1.affectedRows || 0) + (r2.affectedRows || 0);
  }
  return removed;
}

// =====================
// PENDING COMMANDS (Discord → MC)
// =====================
async function addPendingCommand(playerName, command, guildId, source = 'discord') {
  const p = await getPool();
  await p.execute(
    'INSERT INTO pending_commands (player_name, command, source, guild_id) VALUES (?, ?, ?, ?)',
    [playerName, command, source, guildId]
  );
}

async function getPendingCommandsList() {
  const p = await getPool();
  const [rows] = await p.execute('SELECT * FROM pending_commands WHERE status = "pending" ORDER BY created_at ASC');
  return rows;
}

async function markCommandExecuted(id) {
  const p = await getPool();
  await p.execute('UPDATE pending_commands SET status = "executed", executed_at = NOW() WHERE id = ?', [id]);
}

async function markCommandFailed(id) {
  const p = await getPool();
  await p.execute('UPDATE pending_commands SET status = "failed", executed_at = NOW() WHERE id = ?', [id]);
}

// =====================
// BACKUP FUNCTIONS
// =====================
async function createBackupRecord(guildId, name, data, meta = {}) {
  const p = await getPool();
  const [result] = await p.execute(
    `INSERT INTO guild_backups (guild_id, name, created_by, created_by_tag, role_count, channel_count, member_count, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guildId,
      name,
      meta.createdBy || null,
      meta.createdByTag || null,
      meta.roleCount || 0,
      meta.channelCount || 0,
      meta.memberCount || 0,
      JSON.stringify(data)
    ]
  );
  return result.insertId;
}

// Lista backupów bez ciężkiego pola `data` (do widoku listy)
async function getBackups(guildId) {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT id, guild_id, name, created_by, created_by_tag, role_count, channel_count, member_count, created_at
     FROM guild_backups WHERE guild_id = ? ORDER BY created_at DESC`,
    [guildId]
  );
  return rows;
}

async function getBackup(guildId, backupId) {
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT * FROM guild_backups WHERE id = ? AND guild_id = ?',
    [backupId, guildId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  try { row.data = JSON.parse(row.data); } catch (e) { row.data = null; }
  return row;
}

async function deleteBackup(guildId, backupId) {
  const p = await getPool();
  const [result] = await p.execute(
    'DELETE FROM guild_backups WHERE id = ? AND guild_id = ?',
    [backupId, guildId]
  );
  return result.affectedRows > 0;
}

async function countBackups(guildId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT COUNT(*) as count FROM guild_backups WHERE guild_id = ?', [guildId]);
  return rows[0].count;
}

module.exports = {
  getPool,
  // Verification
  getConfig, setConfig, getAllConfigs,
  saveUserRoles, getSavedRoles, deleteSavedRoles,
  // Tickets
  getTicketConfig, setTicketConfig, getNextTicketNumber,
  getTicketCategories, addTicketCategory, updateTicketCategory, deleteTicketCategory,
  createActiveTicket, getActiveTicket, countActiveTickets, countUserActiveTickets, getLastUserTicketTime, claimTicket, forceClaimTicket, deleteActiveTicket, getActiveTicketChannelIds,
  // Announcements
  getAnnouncementsConfig, setAnnouncementsConfig,
  // Tic-Tac-Toe
  getTTTStats, updateTTTStats, getTTTLeaderboard,
  getTTTConfig, setTTTConfig,
  // Rewards
  getRewardServers, addRewardServer, updateRewardServer, deleteRewardServer, getRewardServerByClink,
  getAllRewardChannels, getServerByChannel,
  hasClaimedReward, addPendingReward, getPendingRewards, markRewardClaimed, removeReward,
  // Pending Commands
  addPendingCommand, getPendingCommandsList, markCommandExecuted, markCommandFailed,
  // Backups
  createBackupRecord, getBackups, getBackup, deleteBackup, countBackups
};
