// Interaktywny panel nagród — embed z przyciskami "Odbierz" + modal z nickiem MC
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { getRewardServers, hasClaimedReward, addPendingReward } = require('../../database/db');

/**
 * Wysyła panel nagród z listą serwerów i przyciskami "Odbierz".
 * @param {import('discord.js').TextChannel} channel - Kanał docelowy
 * @param {string} guildId - ID serwera Discord
 */
async function sendRewardPanel(channel, guildId) {
  const servers = await getRewardServers(guildId);

  if (!servers || servers.length === 0) {
    return { success: false, message: 'Brak skonfigurowanych serwerów nagród! Najpierw dodaj serwery w panelu.' };
  }

  // Budowanie embeda z instrukcjami
  const embed = new EmbedBuilder()
    .setTitle('🎁〢Nagrody Discord')
    .setDescription(
      'Wybierz tryb poniżej i kliknij przycisk po prawej stronie, aby otworzyć formularz odbioru.\n\n' +
      '1. Kliknij przycisk przy wybranym trybie.\n' +
      '2. Wpisz swój nick z serwera.\n' +
      '3. Nagroda zostanie nadana automatycznie, jeżeli jesteś online.'
    )
    .setColor(0x5865F2)
    .setThumbnail('https://mc-heads.net/avatar/MHF_Gift/128')
    .setFooter({ text: 'NarisMC • Nagrody' })
    .setTimestamp();

  // Pola embeda — po jednym na każdy serwer
  for (const server of servers) {
    embed.addFields({
      name: `**${server.server_name.toUpperCase()}**`,
      value: `Odbierz nagrodę dla trybu **${server.server_name}**.`,
      inline: false
    });
  }

  // Budowanie przycisków — max 5 na ActionRow, max 5 wierszy (25 przycisków)
  const rows = [];
  const maxButtons = Math.min(servers.length, 25);

  for (let i = 0; i < maxButtons; i++) {
    const rowIndex = Math.floor(i / 5);

    if (!rows[rowIndex]) {
      rows[rowIndex] = new ActionRowBuilder();
    }

    rows[rowIndex].addComponents(
      new ButtonBuilder()
        .setCustomId(`reward_claim_${servers[i].server_id}`)
        .setLabel(`Odbierz — ${servers[i].server_name}`.substring(0, 80))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎁')
    );
  }

  await channel.send({ embeds: [embed], components: rows });
  return { success: true };
}

/**
 * Obsługuje kliknięcie przycisku "Odbierz" — pokazuje modal z polem na nick.
 * WAŻNE: Nie wolno wywołać deferReply() przed showModal()!
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleRewardClaimButton(interaction) {
  const serverId = interaction.customId.replace('reward_claim_', '');

  const modal = new ModalBuilder()
    .setCustomId(`reward_modal_${serverId}`)
    .setTitle('Odbierz nagrodę');

  const nickInput = new TextInputBuilder()
    .setCustomId('mc_nick')
    .setLabel('Nick z Minecrafta')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(16)
    .setPlaceholder('np. Steve');

  modal.addComponents(new ActionRowBuilder().addComponents(nickInput));

  await interaction.showModal(modal);
}

/**
 * Obsługuje submit modala z nickiem MC — waliduje, sprawdza duplikaty, zapisuje.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleRewardModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const serverId = interaction.customId.replace('reward_modal_', '');
  const mcNick = interaction.fields.getTextInputValue('mc_nick').trim();

  // Walidacja formatu nicku Minecraft
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(mcNick)) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription('❌〢Wpisz poprawny nick Minecraft (3-16 znaków, tylko litery, cyfry i _).')
          .setColor(0xf04747)
      ]
    });
  }

  try {
    // Sprawdzenie czy gracz już odebrał nagrodę na tym trybie
    const alreadyClaimed = await hasClaimedReward(mcNick, serverId);

    if (alreadyClaimed) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`❌〢Gracz **${mcNick}** już otrzymał nagrodę na tym trybie!`)
            .setColor(0xf04747)
        ]
      });
    }

    // Zapis nagrody do bazy
    await addPendingReward(
      mcNick,
      interaction.user.id,
      interaction.user.tag || interaction.user.username,
      interaction.guild.id,
      serverId
    );

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `✅〢Gracz **${mcNick}** otrzymał nagrodę!\n\n` +
            `> 🎮〢Wejdź na serwer i odbierz nagrodę.\n` +
            `> 🎁〢Nagroda zostanie nadana automatycznie gdy będziesz online!`
          )
          .setColor(0x43b581)
      ]
    });
  } catch (error) {
    // Obsługa duplikatu na poziomie bazy (UNIQUE constraint)
    if (error.code === 'ER_DUP_ENTRY') {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`❌〢Gracz **${mcNick}** już otrzymał nagrodę na tym trybie!`)
            .setColor(0xf04747)
        ]
      });
    }

    console.error('Błąd obsługi modala nagród:', error);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription('❌〢Wystąpił błąd. Spróbuj ponownie później.')
          .setColor(0xf04747)
      ]
    });
  }
}

module.exports = { sendRewardPanel, handleRewardClaimButton, handleRewardModalSubmit };
