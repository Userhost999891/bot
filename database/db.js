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
        visible_channels TEXT,
        verification_message_id VARCHAR(20)
      )
    `);
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
    await p.execute(`
      UPDATE guild_config SET
        verification_channel_id = COALESCE(?, verification_channel_id),
        verified_role_name = COALESCE(?, verified_role_name),
        unverified_role_name = COALESCE(?, unverified_role_name),
        visible_channels = COALESCE(?, visible_channels),
        verification_message_id = COALESCE(?, verification_message_id)
      WHERE guild_id = ?
    `, [
      config.verification_channel_id || null,
      config.verified_role_name || null,
      config.unverified_role_name || null,
      channelsStr,
      config.verification_message_id || null,
      guildId
    ]);
  } else {
    await p.execute(`
      INSERT INTO guild_config (guild_id, verification_channel_id, verified_role_name, unverified_role_name, visible_channels, verification_message_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      guildId,
      config.verification_channel_id || null,
      config.verified_role_name || 'Zweryfikowany',
      config.unverified_role_name || 'Niezweryfikowany',
      channelsStr,
      config.verification_message_id || null
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
  if (existing) {
    await p.execute(`
      UPDATE ticket_config SET
        ticket_channel_id = COALESCE(?, ticket_channel_id),
        support_role_id = COALESCE(?, support_role_id),
        ticket_message_id = COALESCE(?, ticket_message_id),
        log_channel_id = COALESCE(?, log_channel_id)
      WHERE guild_id = ?
    `, [
      config.ticket_channel_id || null,
      config.support_role_id || null,
      config.ticket_message_id || null,
      config.log_channel_id || null,
      guildId
    ]);
  } else {
    await p.execute(`
      INSERT INTO ticket_config (guild_id, ticket_channel_id, support_role_id, ticket_message_id, log_channel_id)
      VALUES (?, ?, ?, ?, ?)
    `, [
      guildId,
      config.ticket_channel_id || null,
      config.support_role_id || null,
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
    INSERT INTO ticket_categories (guild_id, name, emoji, description, discord_category_id, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    guildId,
    category.name,
    category.emoji || '📋',
    category.description || '',
    category.discord_category_id || null,
    category.color || '#5865F2',
    category.sort_order || 0
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
      sort_order = COALESCE(?, sort_order)
    WHERE id = ?
  `, [
    category.name || null,
    category.emoji || null,
    category.description || null,
    category.discord_category_id || null,
    category.color || null,
    category.sort_order != null ? category.sort_order : null,
    id
  ]);
}

async function deleteTicketCategory(id) {
  const p = await getPool();
  await p.execute('DELETE FROM ticket_categories WHERE id = ?', [id]);
}

async function createActiveTicket(guildId, channelId, userId, categoryName, ticketNumber) {
  const p = await getPool();
  await p.execute(`
    INSERT INTO active_tickets (guild_id, channel_id, user_id, category_name, ticket_number)
    VALUES (?, ?, ?, ?, ?)
  `, [guildId, channelId, userId, categoryName, ticketNumber]);
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
  await p.execute('UPDATE active_tickets SET claimed_by = ? WHERE channel_id = ?', [userId, channelId]);
}

async function deleteActiveTicket(channelId) {
  const p = await getPool();
  await p.execute('DELETE FROM active_tickets WHERE channel_id = ?', [channelId]);
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
async function addRewardServer(guildId, serverId, serverName, channelId) {
  const p = await getPool();
  await p.execute(
    'INSERT INTO reward_servers (guild_id, server_id, server_name, channel_id) VALUES (?, ?, ?, ?)',
    [guildId, serverId, serverName, channelId]
  );
}
async function updateRewardServer(id, serverName, channelId) {
  const p = await getPool();
  await p.execute('UPDATE reward_servers SET server_name = ?, channel_id = ? WHERE id = ?', [serverName, channelId, id]);
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

module.exports = {
  getPool,
  // Verification
  getConfig, setConfig, getAllConfigs,
  saveUserRoles, getSavedRoles, deleteSavedRoles,
  // Tickets
  getTicketConfig, setTicketConfig, getNextTicketNumber,
  getTicketCategories, addTicketCategory, updateTicketCategory, deleteTicketCategory,
  createActiveTicket, getActiveTicket, countActiveTickets, countUserActiveTickets, getLastUserTicketTime, claimTicket, deleteActiveTicket,
  // Announcements
  getAnnouncementsConfig, setAnnouncementsConfig,
  // Tic-Tac-Toe
  getTTTStats, updateTTTStats, getTTTLeaderboard,
  getTTTConfig, setTTTConfig,
  // Rewards
  getRewardServers, addRewardServer, updateRewardServer, deleteRewardServer,
  getAllRewardChannels, getServerByChannel,
  hasClaimedReward, addPendingReward, getPendingRewards, markRewardClaimed
};
