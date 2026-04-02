// NarisMC Core Bot — Database Module (SQLite)
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));

// === CREATE TABLES ===

// Verification config
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    verification_channel_id TEXT,
    verified_role_name TEXT DEFAULT 'Zweryfikowany',
    unverified_role_name TEXT DEFAULT 'Niezweryfikowany',
    visible_channels TEXT DEFAULT '[]',
    verification_message_id TEXT
  )
`);

// Saved roles (for /unverify restore)
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_roles (
    guild_id TEXT,
    user_id TEXT,
    role_ids TEXT,
    PRIMARY KEY (guild_id, user_id)
  )
`);

// Ticket system config
db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_config (
    guild_id TEXT PRIMARY KEY,
    ticket_channel_id TEXT,
    support_role_id TEXT,
    ticket_message_id TEXT,
    log_channel_id TEXT,
    next_ticket_number INTEGER DEFAULT 1,
    max_tickets INTEGER DEFAULT 50
  )
`);

// Ticket categories
db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📋',
    description TEXT DEFAULT '',
    discord_category_id TEXT,
    color TEXT DEFAULT '#5865F2',
    sort_order INTEGER DEFAULT 0
  )
`);

// Active tickets
db.exec(`
  CREATE TABLE IF NOT EXISTS active_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    category_name TEXT,
    claimed_by TEXT,
    ticket_number INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Announcements config
db.exec(`
  CREATE TABLE IF NOT EXISTS announcements_config (
    guild_id TEXT PRIMARY KEY,
    default_channel_id TEXT,
    default_color TEXT DEFAULT '#5865F2',
    footer_text TEXT DEFAULT 'NarisMC'
  )
`);

// Tic-Tac-Toe stats
db.exec(`
  CREATE TABLE IF NOT EXISTS tictactoe_stats (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )
`);

// =====================
// VERIFICATION FUNCTIONS
// =====================
function getConfig(guildId) {
  const row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (row && row.visible_channels) {
    row.visible_channels = JSON.parse(row.visible_channels);
  }
  return row;
}

function setConfig(guildId, config) {
  const existing = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);

  if (existing) {
    const stmt = db.prepare(`
      UPDATE guild_config SET
        verification_channel_id = COALESCE(?, verification_channel_id),
        verified_role_name = COALESCE(?, verified_role_name),
        unverified_role_name = COALESCE(?, unverified_role_name),
        visible_channels = COALESCE(?, visible_channels),
        verification_message_id = COALESCE(?, verification_message_id)
      WHERE guild_id = ?
    `);
    stmt.run(
      config.verification_channel_id || null,
      config.verified_role_name || null,
      config.unverified_role_name || null,
      config.visible_channels ? JSON.stringify(config.visible_channels) : null,
      config.verification_message_id || null,
      guildId
    );
  } else {
    const stmt = db.prepare(`
      INSERT INTO guild_config (guild_id, verification_channel_id, verified_role_name, unverified_role_name, visible_channels, verification_message_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      guildId,
      config.verification_channel_id || null,
      config.verified_role_name || 'Zweryfikowany',
      config.unverified_role_name || 'Niezweryfikowany',
      config.visible_channels ? JSON.stringify(config.visible_channels) : '[]',
      config.verification_message_id || null
    );
  }
}

function getAllConfigs() {
  return db.prepare('SELECT * FROM guild_config').all().map(row => {
    if (row.visible_channels) row.visible_channels = JSON.parse(row.visible_channels);
    return row;
  });
}

function saveUserRoles(guildId, userId, roleIds) {
  db.prepare(`INSERT OR REPLACE INTO saved_roles (guild_id, user_id, role_ids) VALUES (?, ?, ?)`).run(guildId, userId, JSON.stringify(roleIds));
}

function getSavedRoles(guildId, userId) {
  const row = db.prepare('SELECT role_ids FROM saved_roles WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? JSON.parse(row.role_ids) : null;
}

function deleteSavedRoles(guildId, userId) {
  db.prepare('DELETE FROM saved_roles WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

// =====================
// TICKET FUNCTIONS
// =====================
function getTicketConfig(guildId) {
  return db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
}

function setTicketConfig(guildId, config) {
  const existing = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
  if (existing) {
    db.prepare(`
      UPDATE ticket_config SET
        ticket_channel_id = COALESCE(?, ticket_channel_id),
        support_role_id = COALESCE(?, support_role_id),
        ticket_message_id = COALESCE(?, ticket_message_id),
        log_channel_id = COALESCE(?, log_channel_id)
      WHERE guild_id = ?
    `).run(
      config.ticket_channel_id || null,
      config.support_role_id || null,
      config.ticket_message_id || null,
      config.log_channel_id || null,
      guildId
    );
  } else {
    db.prepare(`
      INSERT INTO ticket_config (guild_id, ticket_channel_id, support_role_id, ticket_message_id, log_channel_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      guildId,
      config.ticket_channel_id || null,
      config.support_role_id || null,
      config.ticket_message_id || null,
      config.log_channel_id || null
    );
  }
}

function getNextTicketNumber(guildId) {
  const row = db.prepare('SELECT next_ticket_number FROM ticket_config WHERE guild_id = ?').get(guildId);
  const num = row ? row.next_ticket_number : 1;
  db.prepare('UPDATE ticket_config SET next_ticket_number = ? WHERE guild_id = ?').run(num + 1, guildId);
  return num;
}

function getTicketCategories(guildId) {
  return db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY sort_order ASC').all(guildId);
}

function addTicketCategory(guildId, category) {
  return db.prepare(`
    INSERT INTO ticket_categories (guild_id, name, emoji, description, discord_category_id, color, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    category.name,
    category.emoji || '📋',
    category.description || '',
    category.discord_category_id || null,
    category.color || '#5865F2',
    category.sort_order || 0
  );
}

function updateTicketCategory(id, category) {
  db.prepare(`
    UPDATE ticket_categories SET
      name = COALESCE(?, name),
      emoji = COALESCE(?, emoji),
      description = COALESCE(?, description),
      discord_category_id = COALESCE(?, discord_category_id),
      color = COALESCE(?, color),
      sort_order = COALESCE(?, sort_order)
    WHERE id = ?
  `).run(
    category.name || null,
    category.emoji || null,
    category.description || null,
    category.discord_category_id || null,
    category.color || null,
    category.sort_order != null ? category.sort_order : null,
    id
  );
}

function deleteTicketCategory(id) {
  db.prepare('DELETE FROM ticket_categories WHERE id = ?').run(id);
}

function createActiveTicket(guildId, channelId, userId, categoryName, ticketNumber) {
  db.prepare(`
    INSERT INTO active_tickets (guild_id, channel_id, user_id, category_name, ticket_number)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, categoryName, ticketNumber);
}

function getActiveTicket(channelId) {
  return db.prepare('SELECT * FROM active_tickets WHERE channel_id = ?').get(channelId);
}

function countActiveTickets(guildId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM active_tickets WHERE guild_id = ?').get(guildId);
  return row ? row.count : 0;
}

function countUserActiveTickets(guildId, userId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM active_tickets WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? row.count : 0;
}

function getLastUserTicketTime(guildId, userId) {
  const row = db.prepare('SELECT created_at FROM active_tickets WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(guildId, userId);
  return row ? row.created_at : null;
}

function claimTicket(channelId, userId) {
  db.prepare('UPDATE active_tickets SET claimed_by = ? WHERE channel_id = ?').run(userId, channelId);
}

function deleteActiveTicket(channelId) {
  db.prepare('DELETE FROM active_tickets WHERE channel_id = ?').run(channelId);
}

// =====================
// ANNOUNCEMENTS FUNCTIONS
// =====================
function getAnnouncementsConfig(guildId) {
  return db.prepare('SELECT * FROM announcements_config WHERE guild_id = ?').get(guildId);
}

function setAnnouncementsConfig(guildId, config) {
  const existing = db.prepare('SELECT * FROM announcements_config WHERE guild_id = ?').get(guildId);
  if (existing) {
    db.prepare(`
      UPDATE announcements_config SET
        default_channel_id = COALESCE(?, default_channel_id),
        default_color = COALESCE(?, default_color),
        footer_text = COALESCE(?, footer_text)
      WHERE guild_id = ?
    `).run(
      config.default_channel_id || null,
      config.default_color || null,
      config.footer_text || null,
      guildId
    );
  } else {
    db.prepare(`
      INSERT INTO announcements_config (guild_id, default_channel_id, default_color, footer_text)
      VALUES (?, ?, ?, ?)
    `).run(
      guildId,
      config.default_channel_id || null,
      config.default_color || '#5865F2',
      config.footer_text || 'NarisMC'
    );
  }
}

// =====================
// TIC-TAC-TOE FUNCTIONS
// =====================
function getTTTStats(guildId, userId) {
  let row = db.prepare('SELECT * FROM tictactoe_stats WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare('INSERT INTO tictactoe_stats (guild_id, user_id) VALUES (?, ?)').run(guildId, userId);
    row = { guild_id: guildId, user_id: userId, wins: 0, losses: 0, draws: 0 };
  }
  return row;
}

function updateTTTStats(guildId, userId, result) {
  getTTTStats(guildId, userId); // ensure row exists
  if (result === 'win') {
    db.prepare('UPDATE tictactoe_stats SET wins = wins + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  } else if (result === 'loss') {
    db.prepare('UPDATE tictactoe_stats SET losses = losses + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  } else {
    db.prepare('UPDATE tictactoe_stats SET draws = draws + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
}

function getTTTLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT * FROM tictactoe_stats WHERE guild_id = ? ORDER BY wins DESC LIMIT ?').all(guildId, limit);
}

module.exports = {
  db,
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
  getTTTStats, updateTTTStats, getTTTLeaderboard
};

