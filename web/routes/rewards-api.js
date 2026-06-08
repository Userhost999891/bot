// Rewards API — multi-server management
const express = require('express');
const { getRewardServers, addRewardServer, updateRewardServer, deleteRewardServer, getConfig, setConfig, removeReward } = require('../../database/db');
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
      const { server_id, server_name, channel_id, clink } = req.body;
      if (!server_id || !server_name || !channel_id) {
        return res.status(400).json({ error: 'Wypełnij wszystkie pola!' });
      }

      // Validate server_id format (lowercase, no spaces)
      if (!/^[a-z0-9_-]{2,32}$/.test(server_id)) {
        return res.status(400).json({ error: 'ID serwera: małe litery, cyfry, - lub _ (2-32 znaki)' });
      }

      await addRewardServer(req.params.id, server_id, server_name, channel_id, clink || null);
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
      const { server_name, channel_id, clink } = req.body;
      if (!server_name || !channel_id) return res.status(400).json({ error: 'Wypełnij pola!' });

      await updateRewardServer(req.params.serverId, server_name, channel_id, clink || null);
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

  // Send interactive reward panel to a Discord channel
  router.post('/guild/:id/send-reward-panel', authMiddleware, async (req, res) => {
    try {
      const { channel_id } = req.body;
      if (!channel_id) return res.status(400).json({ error: 'Wybierz kanał!' });

      const guild = discordClient.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Serwer nie znaleziony!' });

      const channel = guild.channels.cache.get(channel_id);
      if (!channel) return res.status(404).json({ error: 'Kanał nie znaleziony!' });

      const { sendRewardPanel } = require('../../modules/rewards/interactive');
      const result = await sendRewardPanel(channel, req.params.id);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ success: true, message: `Wiadomość interaktywna wysłana na #${channel.name}!` });
    } catch (e) {
      console.error('Send reward panel error:', e);
      res.status(500).json({ error: 'Błąd wysyłania: ' + e.message });
    }
  });

  // Get bypass config
  router.get('/guild/:id/bypass-config', authMiddleware, async (req, res) => {
    try {
      const config = await getConfig(req.params.id);
      res.json({ reward_bypass_ids: config ? config.reward_bypass_ids : '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Save bypass config
  router.post('/guild/:id/bypass-config', authMiddleware, async (req, res) => {
    try {
      const { reward_bypass_ids } = req.body;
      await setConfig(req.params.id, { reward_bypass_ids: reward_bypass_ids || '' });
      res.json({ success: true, message: 'Konfiguracja deweloperów zapisana!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Unreward gracz (Web version of /unreward)
  router.post('/guild/:id/unreward', authMiddleware, async (req, res) => {
    try {
      const { player_name, server_id } = req.body;
      if (!player_name) {
        return res.status(400).json({ error: 'Podaj nick gracza Minecraft!' });
      }

      const count = await removeReward(player_name, server_id || null);

      if (count > 0) {
        res.json({ success: true, message: `Pomyślnie cofnięto nagrodę dla ${player_name}! Usunięto ${count} wpis(y).` });
      } else {
        res.status(400).json({ error: `Nie znaleziono odebranych nagród dla gracza ${player_name} w bazie.` });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
