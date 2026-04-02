// Rewards API — multi-server management
const express = require('express');
const { getRewardServers, addRewardServer, updateRewardServer, deleteRewardServer } = require('../../database/mysql');
const { refreshChannelCache, setupRewardChannelPerms } = require('../../modules/rewards/handler');

function authMiddleware(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

module.exports = function(discordClient) {
  const router = express.Router();

  // Get all reward servers for a guild
  router.get('/guild/:id/servers', authMiddleware, async (req, res) => {
    try {
      const servers = await getRewardServers(req.params.id);
      res.json(servers);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Add a new reward server
  router.post('/guild/:id/servers', authMiddleware, async (req, res) => {
    try {
      const { server_id, server_name, channel_id } = req.body;
      if (!server_id || !server_name || !channel_id) {
        return res.status(400).json({ error: 'Wypełnij wszystkie pola!' });
      }

      // Validate server_id format (lowercase, no spaces)
      if (!/^[a-z0-9_-]{2,32}$/.test(server_id)) {
        return res.status(400).json({ error: 'ID serwera: małe litery, cyfry, - lub _ (2-32 znaki)' });
      }

      await addRewardServer(req.params.id, server_id, server_name, channel_id);
      await refreshChannelCache();

      // Setup channel permissions (no history)
      const guild = discordClient.guilds.cache.get(req.params.id);
      if (guild) await setupRewardChannelPerms(guild, channel_id);

      res.json({ success: true, message: `Serwer "${server_name}" dodany!` });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Ten ID serwera lub kanał jest już używany!' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // Update a reward server
  router.put('/guild/:id/servers/:serverId', authMiddleware, async (req, res) => {
    try {
      const { server_name, channel_id } = req.body;
      if (!server_name || !channel_id) return res.status(400).json({ error: 'Wypełnij pola!' });

      await updateRewardServer(req.params.serverId, server_name, channel_id);
      await refreshChannelCache();

      const guild = discordClient.guilds.cache.get(req.params.id);
      if (guild) await setupRewardChannelPerms(guild, channel_id);

      res.json({ success: true, message: 'Serwer zaktualizowany!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Delete a reward server
  router.delete('/guild/:id/servers/:serverId', authMiddleware, async (req, res) => {
    try {
      await deleteRewardServer(req.params.serverId);
      await refreshChannelCache();
      res.json({ success: true, message: 'Serwer usunięty!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
