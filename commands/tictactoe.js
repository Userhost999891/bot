// /tictactoe command — Play Tic-Tac-Toe
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { activeGames, createGame, buildBoardComponents, buildGameEmbed } = require('../modules/tictactoe/handler');
const { getTTTStats, getTTTLeaderboard } = require('../database/db');

// Pending challenges
const pendingChallenges = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('🎮 Zagraj w Kółko i Krzyżyk!')
    .addSubcommand(sub =>
      sub.setName('bot')
        .setDescription('Zagraj z botem NarisMC')
    )
    .addSubcommand(sub =>
      sub.setName('gracz')
        .setDescription('Wyzwij innego gracza!')
        .addUserOption(opt =>
          opt.setName('przeciwnik')
            .setDescription('Kogo chcesz wyzwać? (puste = losowy gracz online)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('ranking')
        .setDescription('Zobacz ranking kółko i krzyżyk!')
    )
    .addSubcommand(sub =>
      sub.setName('statystyki')
        .setDescription('Zobacz swoje statystyki')
    ),

  pendingChallenges,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'bot') {
      return startBotGame(interaction);
    } else if (sub === 'gracz') {
      return challengePlayer(interaction);
    } else if (sub === 'ranking') {
      return showLeaderboard(interaction);
    } else if (sub === 'statystyki') {
      return showStats(interaction);
    }
  }
};

async function startBotGame(interaction) {
  const gameId = `ttt_${interaction.user.id}_${Date.now()}`;
  const game = createGame(interaction.user.id, 'bot', true);
  activeGames.set(gameId, game);

  const embed = buildGameEmbed(game, null);
  const components = buildBoardComponents(game, gameId);

  await interaction.reply({ embeds: [embed], components });
}

async function challengePlayer(interaction) {
  let opponent = interaction.options.getUser('przeciwnik');

  if (!opponent) {
    // Pick a random online member
    const members = await interaction.guild.members.fetch();
    const online = members.filter(m => 
      !m.user.bot && 
      m.id !== interaction.user.id && 
      (m.presence?.status === 'online' || m.presence?.status === 'idle' || m.presence?.status === 'dnd')
    );

    if (online.size === 0) {
      // Fallback: just pick any non-bot member
      const nonBot = members.filter(m => !m.user.bot && m.id !== interaction.user.id);
      if (nonBot.size === 0) {
        return interaction.reply({ content: '❌〢Nie mogę znaleźć żadnego gracza na serwerze!', ephemeral: true });
      }
      opponent = nonBot.random().user;
    } else {
      opponent = online.random().user;
    }
  }

  if (opponent.bot) {
    return interaction.reply({ content: '❌〢Nie możesz wyzwać bota! Użyj `/tictactoe bot` żeby zagrać z AI.', ephemeral: true });
  }

  if (opponent.id === interaction.user.id) {
    return interaction.reply({ content: '❌〢Nie możesz wyzwać samego siebie!', ephemeral: true });
  }

  const challengeId = `ttt_challenge_${interaction.user.id}_${Date.now()}`;
  pendingChallenges.set(challengeId, {
    challenger: interaction.user.id,
    opponent: opponent.id,
    guildId: interaction.guild.id,
    timestamp: Date.now()
  });

  const embed = new EmbedBuilder()
    .setTitle('🎮〢Wyzwanie — Kółko i Krzyżyk!')
    .setDescription(
      `${interaction.user} wyzwał ${opponent} na grę w Kółko i Krzyżyk!\n\n` +
      `${opponent}, czy akceptujesz wyzwanie?`
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Wyzwanie wygasa za 60 sekund' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ttt_accept_${challengeId}`)
      .setLabel('✅ Akceptuj')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ttt_decline_${challengeId}`)
      .setLabel('❌ Odrzuć')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({ embeds: [embed], components: [row] });

  // Auto-expire after 60s
  setTimeout(() => {
    if (pendingChallenges.has(challengeId)) {
      pendingChallenges.delete(challengeId);
    }
  }, 60000);
}

async function showLeaderboard(interaction) {
  const leaderboard = await getTTTLeaderboard(interaction.guild.id, 10);

  if (leaderboard.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏆〢Ranking Kółko i Krzyżyk')
        .setDescription('Brak danych! Zagraj swoją pierwszą grę komendą `/tictactoe bot`')
        .setColor(0x5865F2)
      ],
      ephemeral: true
    });
  }

  const lines = [];
  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
    const total = entry.wins + entry.losses + entry.draws;
    const winRate = total > 0 ? Math.round((entry.wins / total) * 100) : 0;
    lines.push(`${medal} <@${entry.user_id}> — **${entry.wins}**W / ${entry.losses}L / ${entry.draws}D (${winRate}%)`);
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆〢Ranking Kółko i Krzyżyk')
    .setDescription(lines.join('\n'))
    .setColor(0xf1c40f)
    .setFooter({ text: 'NarisMC • Kółko i Krzyżyk' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function showStats(interaction) {
  const stats = await getTTTStats(interaction.guild.id, interaction.user.id);
  const total = stats.wins + stats.losses + stats.draws;
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle('📊〢Twoje statystyki')
    .setDescription(
      `**Wygrane:** ${stats.wins} 🏆\n` +
      `**Przegrane:** ${stats.losses} 💀\n` +
      `**Remisy:** ${stats.draws} 🤝\n` +
      `**Razem gier:** ${total}\n` +
      `**Win Rate:** ${winRate}%`
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'NarisMC • Kółko i Krzyżyk' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
