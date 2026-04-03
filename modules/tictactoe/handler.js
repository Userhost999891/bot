// NarisMC Core — Tic-Tac-Toe Game Handler
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTTTStats, updateTTTStats, getTTTLeaderboard } = require('../../database/db');

// Active games stored in memory
const activeGames = new Map();

// Matchmaking queues per guild: guildId -> [userId1, userId2...]
const matchmakingQueue = new Map();

const EMPTY = '⬛';
const X_MARK = '❌';
const O_MARK = '⭕';

// Win conditions (indices)
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6]             // diags
];

function createGame(player1Id, player2Id, isBot = false) {
  return {
    board: Array(9).fill(null),
    player1: player1Id,   // X
    player2: player2Id,   // O
    currentTurn: player1Id,
    isBot,
    startedAt: Date.now(),
    finished: false
  };
}

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every(cell => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return null;
}

function getBotMove(board, difficulty = 0.7) {
  // Bot uses minimax but with a chance to make a mistake
  if (Math.random() > difficulty) {
    // Random move (mistake)
    const empty = board.map((v, i) => v === null ? i : -1).filter(i => i !== -1);
    return empty[Math.floor(Math.random() * empty.length)];
  }
  
  // Minimax for optimal move
  let bestScore = -Infinity;
  let bestMove = -1;
  
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = 'O';
      const score = minimax(board, 0, false);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }
  
  return bestMove;
}

function minimax(board, depth, isMaximizing) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === 'O') return 10 - depth;
    if (result.winner === 'X') return depth - 10;
    return 0; // draw
  }
  
  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, depth + 1, false));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, depth + 1, true));
        board[i] = null;
      }
    }
    return best;
  }
}

function buildBoardComponents(game, gameId, disabled = false) {
  const rows = [];
  for (let row = 0; row < 3; row++) {
    const actionRow = new ActionRowBuilder();
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const cell = game.board[idx];
      
      let style = ButtonStyle.Secondary;
      let label = '‎'; // invisible character
      let emoji = undefined;
      
      if (cell === 'X') {
        emoji = '❌';
        style = ButtonStyle.Primary;
      } else if (cell === 'O') {
        emoji = '⭕';
        style = ButtonStyle.Danger;
      }
      
      const btn = new ButtonBuilder()
        .setCustomId(`ttt_move_${gameId}_${idx}`)
        .setStyle(style)
        .setDisabled(disabled || cell !== null);
      
      if (emoji) {
        btn.setEmoji(emoji);
      } else {
        btn.setLabel(label);
      }
      
      actionRow.addComponents(btn);
    }
    rows.push(actionRow);
  }
  return rows;
}

function buildGameEmbed(game, result, guildMembers) {
  const embed = new EmbedBuilder()
    .setTitle('🎮〢Kółko i Krzyżyk')
    .setColor(result ? (result.winner === 'draw' ? 0xfaa61a : 0x43b581) : 0x5865F2);

  const p1Name = game.isBot && game.player2 === 'bot' 
    ? `<@${game.player1}>` 
    : `<@${game.player1}>`;
  const p2Name = game.isBot ? '🤖 Bot NarisMC' : `<@${game.player2}>`;

  if (result) {
    if (result.winner === 'draw') {
      embed.setDescription(`${p1Name} ${X_MARK} vs ${p2Name} ${O_MARK}\n\n🤝 **Remis!**`);
      embed.setColor(0xfaa61a);
    } else if (result.winner === 'X') {
      embed.setDescription(`${p1Name} ${X_MARK} vs ${p2Name} ${O_MARK}\n\n🏆 **${p1Name} wygrywa!**`);
      embed.setColor(0x43b581);
    } else {
      embed.setDescription(`${p1Name} ${X_MARK} vs ${p2Name} ${O_MARK}\n\n🏆 **${p2Name} wygrywa!**`);
      embed.setColor(0xf04747);
    }
  } else {
    const currentName = game.currentTurn === game.player1 ? p1Name : p2Name;
    const currentMark = game.currentTurn === game.player1 ? X_MARK : O_MARK;
    embed.setDescription(
      `${p1Name} ${X_MARK} vs ${p2Name} ${O_MARK}\n\n` +
      `Tura: ${currentName} ${currentMark}`
    );
  }

  embed.setFooter({ text: 'NarisMC • Kółko i Krzyżyk' });
  embed.setTimestamp();

  return embed;
}

async function handleMove(interaction, gameId, position) {
  const game = activeGames.get(gameId);
  
  if (!game) {
    return interaction.reply({ content: '❌〢Ta gra już się zakończyła!', ephemeral: true });
  }

  if (game.currentTurn !== interaction.user.id) {
    return interaction.reply({ content: '❌〢To nie Twoja tura!', ephemeral: true });
  }

  if (game.board[position] !== null) {
    return interaction.reply({ content: '❌〢To pole jest już zajęte!', ephemeral: true });
  }

  // Player move
  const playerMark = game.currentTurn === game.player1 ? 'X' : 'O';
  game.board[position] = playerMark;

  let result = checkWinner(game.board);

  if (result) {
    return finishGame(interaction, gameId, game, result);
  }

  // Switch turn
  game.currentTurn = game.currentTurn === game.player1 ? game.player2 : game.player1;

  // Bot move
  if (game.isBot && game.currentTurn === game.player2) {
    // Calculate difficulty based on player stats
    const stats = await getTTTStats(interaction.guild.id, game.player1);
    const totalGames = stats.wins + stats.losses + stats.draws;
    // Adaptive: 50% mistake rate at start, goes down to 20% with more wins
    const difficulty = Math.min(0.8, 0.5 + (stats.wins * 0.03));
    
    const botPos = getBotMove([...game.board], difficulty);
    if (botPos !== -1 && botPos !== undefined) {
      game.board[botPos] = 'O';
    }

    result = checkWinner(game.board);
    if (result) {
      return finishGame(interaction, gameId, game, result);
    }

    game.currentTurn = game.player1;
  }

  const embed = buildGameEmbed(game, null);
  const components = buildBoardComponents(game, gameId);
  
  await interaction.update({ embeds: [embed], components });
}

async function finishGame(interaction, gameId, game, result) {
  game.finished = true;
  
  const guildId = interaction.guild.id;

  if (result.winner === 'draw') {
    await updateTTTStats(guildId, game.player1, 'draw');
    if (!game.isBot) await updateTTTStats(guildId, game.player2, 'draw');
  } else if (result.winner === 'X') {
    await updateTTTStats(guildId, game.player1, 'win');
    if (game.isBot) {
      // no bot stats
    } else {
      await updateTTTStats(guildId, game.player2, 'loss');
    }
  } else {
    await updateTTTStats(guildId, game.player1, 'loss');
    if (!game.isBot) await updateTTTStats(guildId, game.player2, 'win');
  }

  const embed = buildGameEmbed(game, result);
  const components = buildBoardComponents(game, gameId, true);

  // Show stats
  const stats1 = await getTTTStats(guildId, game.player1);
  embed.addFields({
    name: '📊 Statystyki',
    value: `<@${game.player1}>: ${stats1.wins}W/${stats1.losses}L/${stats1.draws}D` +
      (!game.isBot ? `\n<@${game.player2}>: ${await getTTTStats(guildId, game.player2).wins}W/${await getTTTStats(guildId, game.player2).losses}L/${await getTTTStats(guildId, game.player2).draws}D` : ''),
    inline: false
  });

  activeGames.delete(gameId);

  await interaction.update({ embeds: [embed], components });
}

module.exports = {
  activeGames,
  matchmakingQueue,
  createGame,
  buildBoardComponents,
  buildGameEmbed,
  handleMove,
  getTTTLeaderboard,
  EMPTY, X_MARK, O_MARK
};
