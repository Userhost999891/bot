// Moduł Lobby — wiadomość powitalna przy dołączeniu na serwer
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { getConfig } = require('../../database/db');

/**
 * Wysyła wiadomość powitalną na kanał lobby po dołączeniu nowego użytkownika.
 * @param {import('discord.js').GuildMember} member - Nowy członek serwera
 */
async function sendWelcomeMessage(member) {
  const guild = member.guild;

  const config = await getConfig(guild.id);
  if (!config || !config.lobby_channel_id) return;

  const channel = guild.channels.cache.get(config.lobby_channel_id);
  if (!channel) return;

  const username = member.user.globalName || member.user.username;

  const embed = new EmbedBuilder()
    .setTitle('👋〢Witamy na serwerze!')
    .setDescription(
      `Witamy Cię **${username}** na naszym oficjalnym serwerze Discord **NarisMC**! 🎉\n\n` +
      `Cieszymy się, że do nas dołączyłeś! Mamy nadzieję, że znajdziesz tutaj świetną społeczność i mnóstwo zabawy.\n\n` +
      `> 🎮〢Sprawdź nasze kanały i baw się dobrze!\n` +
      `> 📜〢Zapoznaj się z regulaminem serwera.\n` +
      `> ✅〢Zweryfikuj się, aby uzyskać dostęp do wszystkich kanałów!\n\n` +
      `Zweryfikuj się i zapoznaj z regulaminem serwera! \n\n` +
      `Życzymy miłej zabawy! 💜`
    )
    .setColor(0x5865F2)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setFooter({ text: `NarisMC • Lobby`, iconURL: guild.iconURL({ size: 64 }) })
    .setTimestamp();

  // Przyciski: Regulamin i Weryfikacja (linki do kanałów)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('📜・regulamin-dc')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guild.id}/1480249904025833563`),
    new ButtonBuilder()
      .setLabel('✅・weryfikacja')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guild.id}/1480249763856388266`)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

module.exports = { sendWelcomeMessage };
