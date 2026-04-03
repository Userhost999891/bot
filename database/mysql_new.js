// MySQL connection pool for rewards system
const mysql = require('mysql2/promise');
const crypto = require('crypto');

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
    connectionLimit: 5,
    queueLimit: 0
  });

  try {
    // Reward servers — each guild can have multiple MC servers
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

    // Pending rewards — now with server_id
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rewards_pending (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(16) NOT NULL,
        discord_id VARCHAR(20) NOT NULL,
        discord_tag VARCHAR(50),
        guild_id VARCHAR(20) NOT NULL,
        server_id VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_player_server (player_name, server_id)
      )
    `);

    // Per-server claim tracking (MC plugin marks when given)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rewards_claimed (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(16) NOT NULL,
        server_id VARCHAR(32) NOT NULL,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_claim (player_name, server_id)
      )
    `);

    // Add server_id column to rewards_pending if missing (migration)
    try {
      await pool.execute(`ALTER TABLE rewards_pending ADD COLUMN server_id VARCHAR(32) NOT NULL DEFAULT 'default'`);
    } catch (e) { /* already exists */ }

    console.log('✅ MySQL połączony — tabele nagród gotowe!');
  } catch (error) {
    console.error('❌ MySQL błąd:', error.message);
  }

  return pool;
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

// === REWARDS ===

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
  getRewardServers, addRewardServer, updateRewardServer, deleteRewardServer,
  getAllRewardChannels, getServerByChannel,
  hasClaimedReward, addPendingReward, getPendingRewards, markRewardClaimed
};


/* MIGRATION START */

