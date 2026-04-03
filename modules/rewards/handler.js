// Rewards module — listens for nicks on configured channels, saves to MySQL per server
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { hasClaimedReward, addPendingReward, getAllRewardChannels, getServerByChannel } = require('../../database/db');

// Cache: channel_id → { server_id, server_name, guild_id }
let rewardChannels = new Map();

async function loadRewardChannels() {
  try {
    const servers = await getAllRewardChannels();
    rewardChannels.clear();
    for (const srv of servers) {
      rewardChannels.set(srv.channel_id, {
        server_id: srv.server_id,
        server_name: srv.server_name,
        guild_id: srv.guild_id
      });
    }
    console.log(`🎁 Załadowano ${rewardChannels.size} kanałów nagród (${new Set([...rewardChannels.values()].map(v => v.server_id)).size} serwerów)`);
  } catch (e) {
    console.error('Błąd ładowania kanałów nagród:', e.message);
  }
}

function isRewardChannel(channelId) {
  return rewardChannels.has(channelId);
}

function getChannelServer(channelId) {
  return rewardChannels.get(channelId);
}

async function refreshChannelCache() {
  await loadRewardChannels();
}

/**
 * Setup reward channel permissions — no message history for @everyone
 */
async function setupRewardChannelPerms(guild, channelId) {
  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ReadMessageHistory: false,
      ViewChannel: true,
      SendMessages: true,
    });
  } catch (e) {
    console.error('Błąd uprawnień kanału nagród:', e.message);
  }
}

/**
 * Handle a message on a reward channel
 */
async function handleRewardMessage(message) {
  if (message.author.bot) return;
  if (!isRewardChannel(message.channel.id)) return;

  const serverInfo = getChannelServer(message.channel.id);
  if (!serverInfo) return;

  const playerName = message.content.trim();

  // Validate nick
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(playerName)) {
    const hint = new EmbedBuilder()
      .setDescription('❌〢Wpisz poprawny nick Minecraft (3-16 znaków).')
      .setColor(0xf04747);
    const reply = await message.reply({ embeds: [hint] });
    setTimeout(() => { try { reply.delete(); message.delete(); } catch(e) {} }, 5000);
    return;
  }

  try {
    const alreadyClaimed = await hasClaimedReward(playerName, serverInfo.server_id);

    if (alreadyClaimed) {
      const embed = new EmbedBuilder()
        .setDescription(`❌〢Gracz **${playerName}** już otrzymał nagrodę na **${serverInfo.server_name}**!`)
        .setColor(0xf04747);
      const reply = await message.reply({ embeds: [embed] });
      setTimeout(() => { try { reply.delete(); message.delete(); } catch(e) {} }, 8000);
      return;
    }

    // Save with server_id
    await addPendingReward(
      playerName,
      message.author.id,
      message.author.tag || message.author.username,
      message.guild.id,
      serverInfo.server_id
    );

    const embed = new EmbedBuilder()
      .setDescription(
        `✅〢Gracz **${playerName}** otrzymał nagrodę na **${serverInfo.server_name}**!\n\n` +
        `> 🎮〢Wejdź na serwer **${serverInfo.server_name}**\n` +
        `> 🎁〢Nagroda zostanie nadana automatycznie gdy będziesz online!`
      )
      .setColor(0x43b581)
      .setFooter({ text: `NarisMC • ${serverInfo.server_name}` })
      .setTimestamp();

    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => { try { reply.delete(); message.delete(); } catch(e) {} }, 15000);

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const embed = new EmbedBuilder()
        .setDescription(`❌〢Gracz **${playerName}** już otrzymał nagrodę na **${serverInfo.server_name}**!`)
        .setColor(0xf04747);
      const reply = await message.reply({ embeds: [embed] });
      setTimeout(() => { try { reply.delete(); message.delete(); } catch(e) {} }, 8000);
    } else {
      console.error('Error handling reward:', error);
      await message.reply({ content: '❌〢Wystąpił błąd. Spróbuj ponownie.' });
    }
  }
}

module.exports = { loadRewardChannels, isRewardChannel, handleRewardMessage, refreshChannelCache, setupRewardChannelPerms };
