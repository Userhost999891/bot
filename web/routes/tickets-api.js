// Tickets API routes
const express = require('express');
const {
  getTicketConfig, setTicketConfig,
  getTicketCategories, addTicketCategory, updateTicketCategory, deleteTicketCategory
} = require('../../database/db');
const { sendTicketPanel } = require('../../modules/tickets/handler');
const { authMiddleware, adminParamMiddleware } = require('./middleware');

module.exports = function(discordClient) {
  const router = express.Router();

  // Wszystkie endpointy per-serwer wymagają admina tego serwera
  router.use('/guild/:id', authMiddleware, adminParamMiddleware);

  // Get ticket config
  router.get('/guild/:id/config', authMiddleware, async (req, res) => {
    const config = await getTicketConfig(req.params.id);
    if (!config) {
      return res.json({
        guild_id: req.params.id,
        ticket_channel_id: null,
        support_role_id: null,
        support_role_ids: [],
        log_channel_id: null
      });
    }

    // Zwracamy support_role_ids zawsze jako tablicę (fallback na starą pojedynczą rolę)
    let roleIds = [];
    if (config.support_role_ids) {
      try {
        const parsed = JSON.parse(config.support_role_ids);
        if (Array.isArray(parsed)) roleIds = parsed;
      } catch (e) {}
    }
    if (roleIds.length === 0 && config.support_role_id) {
      roleIds = [config.support_role_id];
    }
    res.json({ ...config, support_role_ids: roleIds });
  });

  // Save ticket config
  router.post('/guild/:id/config', authMiddleware, async (req, res) => {
    const { ticket_channel_id, support_role_id, support_role_ids, log_channel_id } = req.body;
    try {
      let roleIds;
      if (support_role_ids !== undefined) {
        roleIds = (Array.isArray(support_role_ids) ? support_role_ids : [])
          .filter(id => typeof id === 'string' && /^\d{5,25}$/.test(id));
      }

      await setTicketConfig(req.params.id, {
        ticket_channel_id,
        // Legacy pole trzymamy zsynchronizowane z pierwszą zaznaczoną rolą
        support_role_id: roleIds !== undefined ? (roleIds[0] || null) : support_role_id,
        support_role_ids: roleIds,
        log_channel_id
      });
      res.json({ success: true, message: 'Konfiguracja ticketów zapisana!' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'DB Error: ' + e.message });
    }
  });

  // Get ticket categories
  router.get('/guild/:id/categories', authMiddleware, async (req, res) => {
    const categories = await getTicketCategories(req.params.id);
    res.json(categories);
  });

  // Add ticket category
  router.post('/guild/:id/categories', authMiddleware, async (req, res) => {
    const { name, emoji, description, discord_category_id, color, requires_mc_nick } = req.body;
    if (!name) return res.status(400).json({ error: 'Nazwa kategorii jest wymagana!' });

    const categories = await getTicketCategories(req.params.id);
    await addTicketCategory(req.params.id, {
      name, emoji, description, discord_category_id, color,
      sort_order: categories.length,
      requires_mc_nick: !!requires_mc_nick
    });

    res.json({ success: true, message: `Kategoria "${name}" dodana!` });
  });

  // Update ticket category
  router.put('/guild/:id/categories/:catId', authMiddleware, async (req, res) => {
    const { name, emoji, description, discord_category_id, color, requires_mc_nick } = req.body;
    await updateTicketCategory(parseInt(req.params.catId), { 
      name, emoji, description, discord_category_id, color, 
      requires_mc_nick: !!requires_mc_nick 
    });
    res.json({ success: true, message: 'Kategoria zaktualizowana!' });
  });

  // Delete ticket category
  router.delete('/guild/:id/categories/:catId', authMiddleware, async (req, res) => {
    await deleteTicketCategory(parseInt(req.params.catId));
    res.json({ success: true, message: 'Kategoria usunięta!' });
  });

  // Send ticket panel to channel
  router.post('/guild/:id/send-panel', authMiddleware, async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const config = await getTicketConfig(req.params.id);
    if (!config || !config.ticket_channel_id) {
      return res.status(400).json({ error: 'Najpierw skonfiguruj kanał ticketów!' });
    }

    const channel = guild.channels.cache.get(config.ticket_channel_id);
    if (!channel) {
      return res.status(404).json({ error: 'Kanał ticketów nie istnieje!' });
    }

    try {
      const result = await sendTicketPanel(channel, guild);
      if (result.success) {
        await setTicketConfig(req.params.id, { ticket_message_id: result.messageId });
        res.json({ success: true, message: 'Panel ticketów wysłany!' });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error('Error sending ticket panel:', error);
      res.status(500).json({ error: 'Nie można wysłać panelu.' });
    }
  });

  return router;
};
