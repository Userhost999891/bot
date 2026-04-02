// Announcements API routes
const express = require('express');
const { getAnnouncementsConfig, setAnnouncementsConfig } = require('../../database/db');
const { sendAnnouncement } = require('../../modules/announcements/handler');

function authMiddleware(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = function(discordClient) {
  const router = express.Router();

  // Get config
  router.get('/guild/:id/config', authMiddleware, (req, res) => {
    const config = getAnnouncementsConfig(req.params.id);
    res.json(config || {
      guild_id: req.params.id,
      default_channel_id: null,
      default_color: '#5865F2',
      footer_text: 'NarisMC'
    });
  });

  // Save config
  router.post('/guild/:id/config', authMiddleware, (req, res) => {
    const { default_channel_id, default_color, footer_text } = req.body;
    setAnnouncementsConfig(req.params.id, { default_channel_id, default_color, footer_text });
    res.json({ success: true, message: 'Konfiguracja ogłoszeń zapisana!' });
  });

  // Send announcement
  router.post('/guild/:id/send', authMiddleware, async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const { channel_id, title, content, color, footer, useSmallCaps } = req.body;

    if (!channel_id) return res.status(400).json({ error: 'Wybierz kanał!' });
    if (!content) return res.status(400).json({ error: 'Wpisz treść ogłoszenia!' });

    try {
      const result = await sendAnnouncement(guild, channel_id, {
        title, content, color, footer,
        useSmallCaps: useSmallCaps !== false
      });

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error('Error sending announcement:', error);
      res.status(500).json({ error: 'Nie można wysłać ogłoszenia.' });
    }
  });

  return router;
};
