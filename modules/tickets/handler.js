// Ticket system handler
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, StringSelectMenuBuilder
} = require('discord.js');
const {
  getTicketConfig, getTicketCategories, getNextTicketNumber,
  createActiveTicket, getActiveTicket, claimTicket, deleteActiveTicket,
  countActiveTickets, countUserActiveTickets, getLastUserTicketTime
} = require('../../database/db');

// Cooldown: 5 minutes per user
const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_TICKETS_DEFAULT = 50;

/**
 * Build and send the ticket panel embed with select menu
 */
async function sendTicketPanel(channel, guild) {
  const categories = getTicketCategories(guild.id);

  if (categories.length === 0) {
    return { success: false, message: 'Najpierw dodaj kategorie ticketów w panelu WWW!' };
  }

  const embed = new EmbedBuilder()
    .setTitle('NARISMC X TICKETY')
    .setDescription('Kliknij poniżej aby stworzyć nowy ticket 🎫')
    .setColor(0x5865F2)
    .setFooter({ text: 'NarisMC • System Ticketów' })
    .setTimestamp();

  const options = categories.map(cat => ({
    label: cat.name,
    value: `ticket_cat_${cat.id}`,
    description: cat.description || `Ticket: ${cat.name}`,
    emoji: cat.emoji || '📋'
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('🔍〢Wybierz opcje')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const msg = await channel.send({ embeds: [embed], components: [row] });
  return { success: true, messageId: msg.id };
}

/**
 * Handle category selection — create ticket channel
 */
async function handleTicketCreate(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const categoryId = interaction.values[0].replace('ticket_cat_', '');

  const ticketConfig = getTicketConfig(guild.id);
  const categories = getTicketCategories(guild.id);
  const category = categories.find(c => c.id === parseInt(categoryId));

  if (!category) {
    return interaction.reply({ content: '❌〢Kategoria nie istnieje!', ephemeral: true });
  }

  // === CHECK: Max tickets limit ===
  const maxTickets = ticketConfig?.max_tickets || MAX_TICKETS_DEFAULT;
  const activeCount = countActiveTickets(guild.id);

  if (activeCount >= maxTickets) {
    return interaction.reply({
      content: `❌〢Osiągnięto limit ticketów! Aktualnie otwartych: **${activeCount}/${maxTickets}**.\nPoczekaj aż administracja zamknie istniejące tickety.`,
      ephemeral: true
    });
  }

  // === CHECK: User cooldown (5 min) ===
  const lastTicketTime = getLastUserTicketTime(guild.id, user.id);
  if (lastTicketTime) {
    const lastTime = new Date(lastTicketTime + 'Z').getTime();
    const elapsed = Date.now() - lastTime;
    const remaining = COOLDOWN_MS - elapsed;

    if (remaining > 0) {
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.ceil((remaining % 60000) / 1000);
      return interaction.reply({
        content: `⏳〢Musisz poczekać **${minutes > 0 ? `${minutes} min ` : ''}${seconds} sek** zanim stworzysz kolejny ticket.`,
        ephemeral: true
      });
    }
  }

  // === CHECK: User already has open ticket in this category ===
  const userTickets = countUserActiveTickets(guild.id, user.id);
  if (userTickets >= 3) {
    return interaction.reply({
      content: `❌〢Masz już **${userTickets}** otwarte tickety. Zamknij stare zanim otworzysz nowe.`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const ticketNumber = getNextTicketNumber(guild.id);
    const channelName = `ticket-${String(ticketNumber).padStart(4, '0')}`;

    // Permission overwrites — only ticket creator + support + admins
    const permOverwrites = [
      {
        id: guild.id, // @everyone — deny all
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id, // ticket creator
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      }
    ];

    // Add support role if configured
    if (ticketConfig && ticketConfig.support_role_id) {
      permOverwrites.push({
        id: ticketConfig.support_role_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }

    // Bot itself
    permOverwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages
      ]
    });

    // Create the channel
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.discord_category_id || null,
      permissionOverwrites: permOverwrites,
      topic: `${category.emoji}〢Ticket od ${user.tag} | Kategoria: ${category.name}`
    });

    // Save to database
    createActiveTicket(guild.id, ticketChannel.id, user.id, category.name, ticketNumber);

    // Build ticket embed inside the channel
    const ticketEmbed = new EmbedBuilder()
      .setTitle('Ticket Otwarty')
      .setDescription(
        `${interaction.user} Stworzył nowego ${category.emoji}〢**${category.name}** Ticketa.\n\n` +
        `> 🎫〢Ticket #${ticketNumber}\n` +
        `> 📋〢Kategoria: ${category.name}\n` +
        `> ⏰〢Utworzony: <t:${Math.floor(Date.now() / 1000)}:f>`
      )
      .setColor(parseInt(category.color.replace('#', ''), 16) || 0x5865F2)
      .setFooter({ text: 'NarisMC • Tickety | /close' })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('🔒〢Zamknij Ticket')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('📋〢Odbierz Ticket')
        .setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({ embeds: [ticketEmbed], components: [buttons] });
    await ticketChannel.send({ content: `${user} Opisz swój problem poniżej. Administracja wkrótce odpowie.` });

    // Reply to user — ephemeral with link
    const linkEmbed = new EmbedBuilder()
      .setDescription('✅〢Twój Ticket został stworzony!')
      .setColor(0x43b581);

    const linkButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Przejdź do Ticketa')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${ticketChannel.id}`)
        .setEmoji('🔗')
    );

    await interaction.editReply({ embeds: [linkEmbed], components: [linkButton] });

  } catch (error) {
    console.error('Error creating ticket:', error);
    await interaction.editReply({ content: '❌〢Wystąpił błąd podczas tworzenia ticketa.' });
  }
}

/**
 * Handle ticket close button
 */
async function handleTicketClose(interaction) {
  const ticket = getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: '❌〢To nie jest kanał ticketa!', ephemeral: true });
  }

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒〢Ticket Zamknięty')
    .setDescription(
      `Ticket został zamknięty przez ${interaction.user}.\n` +
      `Kanał zostanie usunięty za **5 sekund**...`
    )
    .setColor(0xf04747)
    .setTimestamp();

  await interaction.reply({ embeds: [closeEmbed] });

  setTimeout(async () => {
    try {
      deleteActiveTicket(interaction.channel.id);
      await interaction.channel.delete('Ticket zamknięty');
    } catch (e) {
      console.error('Error deleting ticket channel:', e);
    }
  }, 5000);
}

/**
 * Handle ticket claim button
 */
async function handleTicketClaim(interaction) {
  const ticket = getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: '❌〢To nie jest kanał ticketa!', ephemeral: true });
  }

  if (ticket.claimed_by) {
    return interaction.reply({
      content: `📋〢Ten ticket jest już odebrany przez <@${ticket.claimed_by}>!`,
      ephemeral: true
    });
  }

  claimTicket(interaction.channel.id, interaction.user.id);

  const claimEmbed = new EmbedBuilder()
    .setDescription(`📋〢${interaction.user} odebrał ten ticket.`)
    .setColor(0x43b581)
    .setTimestamp();

  await interaction.reply({ embeds: [claimEmbed] });
}

module.exports = { sendTicketPanel, handleTicketCreate, handleTicketClose, handleTicketClaim };
