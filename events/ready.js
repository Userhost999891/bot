// Ready event
const { ActivityType } = require('discord.js');

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
    console.log(`📡 Obsługuję ${client.guilds.cache.size} serwerów`);
    console.log(`🌐 Panel webowy: http://localhost:${process.env.PORT || 4000}`);

    // Przywróć status bota zapisany w panelu (fallback: domyślny)
    let status = { type: 'watching', text: 'NarisMC Core', presence: 'online' };
    if (process.env.MYSQL_HOST) {
      try {
        const { getBotSetting } = require('../database/db');
        const raw = await getBotSetting('bot_status');
        if (raw) status = { ...status, ...JSON.parse(raw) };
      } catch (e) {
        console.error('Nie udało się wczytać statusu bota z bazy:', e.message);
      }
    }
    try {
      client.user.setPresence({
        status: ['online', 'idle', 'dnd'].includes(status.presence) ? status.presence : 'online',
        activities: status.text ? [{ name: status.text, type: ACTIVITY_TYPES[status.type] ?? ActivityType.Watching }] : []
      });
    } catch (e) {
      console.error('Nie udało się ustawić statusu bota:', e.message);
    }
  }
};
