// Unified interaction handler — Verification + Tickets + TicTacToe + Commands
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { getRandomQuestion } = require('../modules/verification/questions');
const { handleVerification, assignVerifiedRole } = require('../modules/verification/handler');
const { handleTicketCreate, handleTicketClose, handleTicketClaim } = require('../modules/tickets/handler');
const { activeGames, handleMove, createGame, buildBoardComponents, buildGameEmbed } = require('../modules/tictactoe/handler');

const pendingQuestions = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    // BUTTON: Verification
    if (interaction.isButton() && interaction.customId === 'verify_button') {
      const result = await handleVerification(interaction, interaction.guild);
      if (result !== null) return;

      const question = getRandomQuestion();
      pendingQuestions.set(interaction.user.id, question);

      const modal = new ModalBuilder()
        .setCustomId('verify_modal')
        .setTitle('🔒〢Weryfikacja');

      const answerInput = new TextInputBuilder()
        .setCustomId('verify_answer')
        .setLabel(question.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(question.type === 'math' ? 'Wpisz wynik...' : 'Przepisz tekst...');

      const row = new ActionRowBuilder().addComponents(answerInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    // MODAL: Verification answer
    if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
      const question = pendingQuestions.get(interaction.user.id);
      
      if (!question) {
        return interaction.reply({ 
          embeds: [new EmbedBuilder().setDescription('❌〢Sesja weryfikacji wygasła. Spróbuj ponownie.').setColor(0xf04747)], 
          ephemeral: true 
        });
      }

      const userAnswer = interaction.fields.getTextInputValue('verify_answer').trim();
      pendingQuestions.delete(interaction.user.id);

      const correct = userAnswer === question.answer;

      if (!correct) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`❌〢**Niepoprawna odpowiedź!** Spróbuj ponownie klikając przycisk weryfikacji.\n\n> Twoja odpowiedź: \`${userAnswer}\`\n> Poprawna odpowiedź: \`${question.answer}\``)
            .setColor(0xf04747)],
          ephemeral: true
        });
      }

      const success = await assignVerifiedRole(interaction, interaction.guild);

      if (success) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅〢**Weryfikacja przeszła pomyślnie!** 🎉\n\nWitaj na serwerze, ${interaction.user}! Teraz masz dostęp do wszystkich kanałów.`)
            .setColor(0x43b581)],
          ephemeral: true
        });
      } else {
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription('❌〢Wystąpił błąd podczas przypisywania roli. Skontaktuj się z administratorem.').setColor(0xf04747)],
          ephemeral: true
        });
      }
    }

    // SELECT MENU: Ticket category
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
      await handleTicketCreate(interaction);
    }

    // BUTTON: Ticket close
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      await handleTicketClose(interaction);
    }

    // BUTTON: Ticket claim
    if (interaction.isButton() && interaction.customId === 'ticket_claim') {
      await handleTicketClaim(interaction);
    }

    // =============================
    // TIC-TAC-TOE BUTTONS
    // =============================
    if (interaction.isButton() && interaction.customId.startsWith('ttt_move_')) {
      const parts = interaction.customId.split('_');
      const position = parseInt(parts[parts.length - 1]);
      const gameId = parts.slice(2, -1).join('_');
      
      try {
        await handleMove(interaction, gameId, position);
      } catch (e) {
        console.error('TTT move error:', e);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌〢Błąd gry!', ephemeral: true });
        }
      }
    }

    // BUTTON: TTT Accept challenge
    if (interaction.isButton() && interaction.customId.startsWith('ttt_accept_')) {
      const challengeId = interaction.customId.replace('ttt_accept_', '');
      const { pendingChallenges } = require('../commands/tictactoe');
      const challenge = pendingChallenges.get(challengeId);

      if (!challenge) {
        return interaction.reply({ content: '❌〢To wyzwanie wygasło!', ephemeral: true });
      }

      if (interaction.user.id !== challenge.opponent) {
        return interaction.reply({ content: '❌〢To wyzwanie nie jest dla Ciebie!', ephemeral: true });
      }

      pendingChallenges.delete(challengeId);

      // Start the game
      const gameId = `ttt_${challenge.challenger}_${Date.now()}`;
      const game = createGame(challenge.challenger, challenge.opponent, false);
      activeGames.set(gameId, game);

      const embed = buildGameEmbed(game, null);
      const components = buildBoardComponents(game, gameId);

      await interaction.update({ embeds: [embed], components });
    }

    // BUTTON: TTT Decline challenge
    if (interaction.isButton() && interaction.customId.startsWith('ttt_decline_')) {
      const challengeId = interaction.customId.replace('ttt_decline_', '');
      const { pendingChallenges } = require('../commands/tictactoe');
      const challenge = pendingChallenges.get(challengeId);

      if (!challenge) {
        return interaction.reply({ content: '❌〢To wyzwanie wygasło!', ephemeral: true });
      }

      if (interaction.user.id !== challenge.opponent) {
        return interaction.reply({ content: '❌〢To wyzwanie nie jest dla Ciebie!', ephemeral: true });
      }

      pendingChallenges.delete(challengeId);

      const embed = new EmbedBuilder()
        .setTitle('🎮〢Wyzwanie odrzucone')
        .setDescription(`${interaction.user} odrzucił wyzwanie.`)
        .setColor(0xf04747);

      await interaction.update({ embeds: [embed], components: [] });
    }

    // SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands?.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error('Command error:', error);
        const reply = { content: '❌〢Wystąpił błąd podczas wykonywania komendy.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
  }
};
