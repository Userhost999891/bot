const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('../database/db');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const oldBoost = oldMember.premiumSince;
    const newBoost = newMember.premiumSince;

    // Detect if member started boosting
    if (!oldBoost && newBoost) {
      const guild = newMember.guild;
      try {
        const config = await getConfig(guild.id);
        if (!config || !config.boost_channel_id) return;

        const channel = guild.channels.cache.get(config.boost_channel_id);
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setTitle('✨ NOWY SERVER BOOST! ✨')
          .setDescription(
            `💜 Użytkownik **${newMember.user}** właśnie ulepszył nasz serwer!\n\n` +
            `> **Dziękujemy bardzo za wsparcie serwera!** 🥰\n` +
            `> Nagrody za ulepszenie odbierzesz na kanale z nagrodami!\n\n` +
            `• 🔮 Aktualnie na serwerze jest: **${guild.premiumSubscriptionCount || 0}** ulepszeń`
          )
          .setColor(0xf47fff)
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `${guild.name} • Ulepszenia` })
          .setTimestamp();

        await channel.send({ content: `🎉 **Dziękujemy za ulepszenie serwera!** ${newMember.user}`, embeds: [embed] });
      } catch (err) {
        console.error('Error handling guildMemberUpdate boost event:', err);
      }
    }
  }
};
