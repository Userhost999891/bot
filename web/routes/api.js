// API routes for verification + guild management (ported + extended)
const express = require('express');
const { 
  getConfig, setConfig, 
  getTicketConfig, setTicketConfig, getTicketCategories,
  getAnnouncementsConfig, setAnnouncementsConfig,
  getRewardServers, addRewardServer, updateRewardServer, deleteRewardServer,
  getTTTConfig, setTTTConfig
} = require('../../database/db');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');


function authMiddleware(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

async function adminParamMiddleware(req, res, next) {
  const userGuilds = req.session?.user?.guilds || [];
  const g = userGuilds.find(g => g.id === req.params.id);
  if (!g) return res.status(403).json({ error: 'Brak uprawnień do tego serwera' });

  let isAdmin = g.owner === true;
  try {
    if (!isAdmin && g.permissions) {
      isAdmin = (BigInt(g.permissions) & 8n) === 8n;
    }
  } catch (e) {}

  if (!isAdmin) return res.status(403).json({ error: 'Wymagane uprawnienia administratora' });
  next();
}

module.exports = function(discordClient) {
  const router = express.Router();

  // Get guilds where bot is present AND user has admin perms
  router.get('/guilds', authMiddleware, async (req, res) => {
    // Odświeżanie serwerów w locie żeby uniknąć wylogowywania (UX fix)
    if (req.session.accessToken) {
      try {
        const fetch = require('node-fetch');
        const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
          headers: { Authorization: `Bearer ${req.session.accessToken}` }
        });
        if (guildsResponse.ok) {
          const freshGuilds = await guildsResponse.json();
          if (Array.isArray(freshGuilds)) {
            req.session.user.guilds = freshGuilds;
          }
        }
      } catch (e) {
        // Zignoruj i użyj cache jeśli nie siądzie internet
      }
    }

    const userGuilds = req.session.user.guilds || [];
    const botGuilds = discordClient.guilds.cache;

    const manageable = userGuilds.filter(g => {
      // Prawidłowe sprawdzanie uprawnień BigInt + Weryfikacja czy jest właścicielem
      let isAdmin = g.owner === true;
      try {
        if (!isAdmin && g.permissions) {
          isAdmin = (BigInt(g.permissions) & 8n) === 8n;
        }
      } catch (e) {}

      const botIn = botGuilds.has(g.id);
      return isAdmin && botIn;
    }).map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
    }));

    res.json(manageable);
  });

  // Get channels for a guild
  router.get('/guild/:id/channels', authMiddleware, async (req, res) => {
    try {
      const guild = discordClient.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      await guild.channels.fetch();
      const channels = guild.channels.cache
        .filter(c => c.type === 0) // TEXT channels
        .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || 'Brak kategorii' }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(channels);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get categories (Discord channel categories) for a guild
  router.get('/guild/:id/categories', authMiddleware, async (req, res) => {
    try {
      const guild = discordClient.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      await guild.channels.fetch();
      const categories = guild.channels.cache
        .filter(c => c.type === 4) // GUILD_CATEGORY
        .map(c => ({ id: c.id, name: c.name }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      res.json(categories);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get roles for a guild
  router.get('/guild/:id/roles', authMiddleware, async (req, res) => {
    try {
      const guild = discordClient.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      await guild.roles.fetch();
      const roles = guild.roles.cache
        .filter(r => r.name !== '@everyone')
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
        .sort((a, b) => b.position - a.position);

      res.json(roles);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get verification config
  router.get('/guild/:id/config', authMiddleware, async (req, res) => {
    const config = await getConfig(req.params.id);
    res.json(config || {
      guild_id: req.params.id,
      verification_channel_id: null,
      verified_role_name: 'Zweryfikowany',
      unverified_role_name: 'Niezweryfikowany',
      visible_channels: []
    });
  });

  // Save verification config
  router.post('/guild/:id/config', authMiddleware, async (req, res) => {
    try {
      const { verification_channel_id, verified_role_name, unverified_role_name, visible_channels } = req.body;

      await setConfig(req.params.id, {
        verification_channel_id,
        verified_role_name,
        unverified_role_name,
        visible_channels: visible_channels || []
      });

      res.json({ success: true, message: 'Konfiguracja zapisana!' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'DB Error: ' + e.message });
    }
  });

  // Create roles
  router.post('/guild/:id/create-roles', authMiddleware, async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const config = await getConfig(req.params.id);
    const verifiedName = config?.verified_role_name || 'Zweryfikowany';
    const unverifiedName = config?.unverified_role_name || 'Niezweryfikowany';

    const created = [];
    const updated = [];

    try {
      let verifiedRole = guild.roles.cache.find(r => r.name === verifiedName);
      if (!verifiedRole) {
        verifiedRole = await guild.roles.create({
          name: verifiedName,
          color: '#2ecc71',
          reason: 'NarisMC Core - Verification System'
        });
        created.push(verifiedName);
      }

      let unverifiedRole = guild.roles.cache.find(r => r.name === unverifiedName);
      if (!unverifiedRole) {
        unverifiedRole = await guild.roles.create({
          name: unverifiedName,
          color: '#e74c3c',
          permissions: [],
          reason: 'NarisMC Core - Verification System'
        });
        created.push(unverifiedName);
      } else {
        await unverifiedRole.setPermissions([], 'Usunięcie uprawnień z roli Niezweryfikowany');
        updated.push(unverifiedName);
      }

      const messages = [];
      if (created.length) messages.push(`Utworzono role: ${created.join(', ')}`);
      if (updated.length) messages.push(`Zaktualizowano role: ${updated.join(', ')}`);
      res.json({ success: true, created, message: messages.join('. ') || 'Role już istnieją!' });
    } catch (error) {
      console.error('Error creating roles:', error);
      res.status(500).json({ error: 'Nie można utworzyć ról. Sprawdź uprawnienia bota.' });
    }
  });

  // Setup channel permissions
  router.post('/guild/:id/setup-permissions', authMiddleware, async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const config = await getConfig(req.params.id);
    if (!config) return res.status(400).json({ error: 'Brak konfiguracji' });

    const unverifiedRole = guild.roles.cache.find(r => r.name === config.unverified_role_name);
    const verifiedRole = guild.roles.cache.find(r => r.name === config.verified_role_name);

    if (!unverifiedRole || !verifiedRole) {
      return res.status(400).json({ error: 'Najpierw utwórz role!' });
    }

    try {
      const visibleChannels = config.visible_channels || [];

      const everyonePerms = new PermissionsBitField(guild.roles.everyone.permissions.bitfield);
      everyonePerms.remove('ViewChannel');
      await guild.roles.everyone.setPermissions(everyonePerms.bitfield, 'System weryfikacji - ukrycie kanałów');

      const verifiedPerms = new PermissionsBitField(verifiedRole.permissions.bitfield);
      verifiedPerms.add('ViewChannel');
      verifiedPerms.add('SendMessages');
      verifiedPerms.add('ReadMessageHistory');
      verifiedPerms.add('Connect');
      verifiedPerms.add('Speak');
      await verifiedRole.setPermissions(verifiedPerms.bitfield, 'System weryfikacji - dostęp po weryfikacji');

      await unverifiedRole.setPermissions([], 'System weryfikacji - brak uprawnień');

      let processed = 0;
      let errors = 0;

      for (const [, channel] of guild.channels.cache) {
        if (channel.isThread && channel.isThread()) continue;

        try {
          if (visibleChannels.includes(channel.id) || channel.id === config.verification_channel_id) {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
              ViewChannel: true,
              ReadMessageHistory: true,
              SendMessages: channel.id === config.verification_channel_id ? false : null
            });
            processed++;
          }
        } catch (channelError) {
          errors++;
          console.error(`❌ Błąd: ${channel.name}: ${channelError.message}`);
        }
      }

      res.json({
        success: true,
        message: `Gotowe! ${processed} kanałów ustawionych jako widoczne.${errors ? ` ${errors} błędów.` : ''}`
      });
    } catch (error) {
      console.error('Error setting permissions:', error);
      res.status(500).json({ error: 'Nie można ustawić uprawnień.' });
    }
  });

  // Send verification message
  router.post('/guild/:id/send-verification', authMiddleware, async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const config = await getConfig(req.params.id);
    if (!config || !config.verification_channel_id) {
      return res.status(400).json({ error: 'Najpierw skonfiguruj kanał weryfikacji!' });
    }

    const channel = guild.channels.cache.get(config.verification_channel_id);
    if (!channel) {
      return res.status(404).json({ error: 'Kanał weryfikacji nie istnieje!' });
    }

    try {
      const embed = new EmbedBuilder()
        .setTitle('🔒〢Weryfikacja')
        .setDescription(
          '**Witaj na serwerze!**\n\n' +
          'Aby uzyskać dostęp do wszystkich kanałów, musisz się zweryfikować.\n' +
          'Kliknij przycisk poniżej i rozwiąż proste zadanie.\n\n' +
          '> 🧠〢Możesz dostać pytanie z dodawania lub tekst do przepisania.\n' +
          '> ✅〢Po poprawnej odpowiedzi otrzymasz rolę i dostęp do serwera!'
        )
        .setColor(0x5865F2)
        .setFooter({ text: 'NarisMC • System Weryfikacji' })
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('🔓〢Zweryfikuj się')
          .setStyle(ButtonStyle.Success)
      );

      const msg = await channel.send({ embeds: [embed], components: [button] });
      await setConfig(req.params.id, { verification_message_id: msg.id });

      res.json({ success: true, message: 'Wiadomość weryfikacyjna wysłana!' });
    } catch (error) {
      console.error('Error sending verification message:', error);
      res.status(500).json({ error: 'Nie można wysłać wiadomości.' });
    }
  });

  // Get client ID for invite
  router.get('/client-id', async (req, res) => {
    res.json({ clientId: process.env.DISCORD_CLIENT_ID });
  });

  // Guild stats for dashboard
  router.get('/guild/:id/stats', authMiddleware, async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    try {
      const members = await guild.members.fetch();
      const online = members.filter(m => m.presence?.status === 'online' || m.presence?.status === 'idle' || m.presence?.status === 'dnd').size;
      const bots = members.filter(m => m.user.bot).size;
      const channels = guild.channels.cache.filter(c => c.type === 0).size;
      const roles = guild.roles.cache.size - 1;

      res.json({
        memberCount: guild.memberCount,
        online,
        bots,
        channels,
        roles,
        boostLevel: guild.premiumTier,
        boostCount: guild.premiumSubscriptionCount || 0,
        icon: guild.iconURL({ size: 128 }) || null,
        banner: guild.bannerURL({ size: 512 }) || null,
        botAvatar: discordClient.user.displayAvatarURL({ size: 64 }),
        botName: discordClient.user.username
      });
    } catch (e) {
      res.json({ memberCount: guild.memberCount, online: 0, bots: 0, channels: 0, roles: 0 });
    }
  });

  // TTT Leaderboard
  router.get('/guild/:id/ttt-leaderboard', authMiddleware, async (req, res) => {
    const { getTTTLeaderboard } = require('../../database/db');
    const leaderboard = await getTTTLeaderboard(req.params.id, 10);

    // Add usernames
    const guild = discordClient.guilds.cache.get(req.params.id);
    const enriched = [];
    for (const entry of leaderboard) {
      let username = 'Nieznany';
      try {
        const member = await guild?.members.fetch(entry.user_id);
        username = member?.user?.username || 'Nieznany';
      } catch(e) {}
      enriched.push({ ...entry, username });
    }

    res.json(enriched);
  });

  // =============================
  // TIC-TAC-TOE CONFIGURATION
  // =============================
  router.get('/guild/:id/ttt', authMiddleware, async (req, res) => {
    try {
      const config = await getTTTConfig(req.params.id) || {};
      res.json(config);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Database error' });
    }
  });

  router.post('/guild/:id/ttt', authMiddleware, adminParamMiddleware, async (req, res) => {
    try {
      await setTTTConfig(req.params.id, req.body);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Database error' });
    }
  });

  router.post('/guild/:id/send-ttt-panel', authMiddleware, adminParamMiddleware, async (req, res) => {
    try {
      const guild = discordClient.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Bot is not on this server' });

      const config = await getTTTConfig(req.params.id);
      if (!config || !config.channel_id) return res.status(400).json({ error: 'Configuration incomplete' });

      const channel = guild.channels.cache.get(config.channel_id);
      if (!channel) return res.status(400).json({ error: 'Tic-Tac-Toe channel not found on server' });

      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('⛋ Strefa Kółko i Krzyżyk')
        .setDescription('Wybierz z kim chcesz zmierzyć się w klasycznej grze w Kółko i Krzyżyk. Bot rozstawi nową planszę natychmiastowo!')
        .setColor(0x5865F2)
        .addFields({ name: '▤ Opcje Gry', value: '⚙️ **Z Botem**: Walka z zaprogramowanym algorytmem bota NarisMC.\n☍ **Losowy Gracz**: Dołącz do kolejki i poczekaj na wolnego przeciwnika!' })
        .setFooter({ text: 'NarisMC • Matchmaking', iconURL: guild.iconURL() });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ttt_queue_bot')
          .setLabel('Walcz z Botem')
          .setEmoji('⚙️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ttt_queue_player')
          .setLabel('Graj z Graczem')
          .setEmoji('☍')
          .setStyle(ButtonStyle.Success)
      );

      // Try deleting old message if it exists
      if (config.message_id) {
        try {
          const oldMsg = await channel.messages.fetch(config.message_id);
          if (oldMsg) await oldMsg.delete();
        } catch(e) {}
      }

      const sentMsg = await channel.send({ embeds: [embed], components: [row] });
      await setTTTConfig(req.params.id, { message_id: sentMsg.id });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message || 'Error sending panel' });
    }
  });

  return router;
};
