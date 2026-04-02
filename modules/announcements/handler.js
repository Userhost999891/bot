// Announcements handler — send embeds to channels
const { EmbedBuilder } = require('discord.js');
const { toSmallCaps } = require('../../utils/smallcaps');

/**
 * Send an announcement embed to a channel
 * @param {Guild} guild 
 * @param {string} channelId 
 * @param {object} options - { title, content, color, footer, useSmallCaps }
 */
async function sendAnnouncement(guild, channelId, options) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    return { success: false, message: 'Kanał nie istnieje!' };
  }

  const title = options.useSmallCaps !== false ? toSmallCaps(options.title || '') : (options.title || '');
  const content = options.content || '';
  const color = parseInt((options.color || '#5865F2').replace('#', ''), 16);
  const footer = options.footer || toSmallCaps('NarisMC');

  const embed = new EmbedBuilder()
    .setDescription(content)
    .setColor(color)
    .setFooter({ text: footer })
    .setTimestamp();

  if (title) {
    embed.setTitle(title);
  }

  try {
    await channel.send({ embeds: [embed] });
    return { success: true, message: 'Ogłoszenie wysłane!' };
  } catch (error) {
    console.error('Error sending announcement:', error);
    return { success: false, message: `Błąd: ${error.message}` };
  }
}

module.exports = { sendAnnouncement };
