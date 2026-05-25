// Ticket system handler
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
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
  const categories = await getTicketCategories(guild.id);

  if (categories.length === 0) {
    return { success: false, message: 'Najpierw dodaj kategorie ticketów w panelu WWW!' };
  }

  const embed = new EmbedBuilder()
    .setTitle('NARISMC X TICKETY')
    .setDescription('Kliknij poniżej aby stworzyć nowy ticket 🎫')
    .setColor(0x5865F2)
    .setFooter({ text: 'NarisMC • System Ticketów' })
    .setTimestamp();

  // Encode '_mc' suffix for categories that need a Minecraft nick modal
  const options = categories.map(cat => {
    const needsMcNick = !!cat.requires_mc_nick;
    return {
      label: `〢${cat.name}`,
      value: needsMcNick ? `ticket_cat_${cat.id}_mc` : `ticket_cat_${cat.id}`,
      description: cat.description || `Ticket: ${cat.name}`,
      emoji: cat.emoji || '📋'
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('🔍〢Wybierz opcje')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const msg = await channel.send({ embeds: [embed], components: [row] });
  return { success: true, messageId: msg.id };
}

/**
 * Handle category selection — create ticket channel or show modal
 * IMPORTANT: showModal MUST be the very first response to the interaction (no await before it)
 */
async function handleTicketCreate(interaction) {
  const rawValue = interaction.values[0];
  const needsMcNick = rawValue.endsWith('_mc');
  const categoryId = rawValue.replace('ticket_cat_', '').replace('_mc', '');

  // If this category requires a MC nick, show modal IMMEDIATELY (zero async before showModal)
  if (needsMcNick) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${categoryId}`)
      .setTitle('Weryfikacja Media / Twórca');

    const nickInput = new TextInputBuilder()
      .setCustomId('mc_nickname')
      .setLabel('Nick z Minecrafta')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(16)
      .setPlaceholder('np. Steve');

    const socialInput = new TextInputBuilder()
      .setCustomId('social_link')
      .setLabel('Link do Twoich social mediów')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('np. youtube.com/c/nazwa, tiktok.com/@nazwa');

    const screenshotInput = new TextInputBuilder()
      .setCustomId('screenshot_link')
      .setLabel('Screen/dowód (np. link do imgura)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder('np. https://imgur.com/... lub puste');

    const row1 = new ActionRowBuilder().addComponents(nickInput);
    const row2 = new ActionRowBuilder().addComponents(socialInput);
    const row3 = new ActionRowBuilder().addComponents(screenshotInput);
    modal.addComponents(row1, row2, row3);

    return interaction.showModal(modal);
  }

  // Defer first to prevent timeout
  await interaction.deferReply({ ephemeral: true });

  // For normal categories — do the DB lookup and create ticket
  const categories = await getTicketCategories(interaction.guild.id);
  const category = categories.find(c => c.id === parseInt(categoryId));

  if (!category) {
    return interaction.editReply({ content: '❌〢Kategoria nie istnieje!' });
  }

  await executeTicketCreation(interaction, category, null);
}

/**
 * Handle ticket modal submission for nickname
 */
async function handleTicketModalSubmit(interaction) {
  // Defer modal submit immediately
  await interaction.deferReply({ ephemeral: true });

  const categoryId = interaction.customId.replace('ticket_modal_', '');
  const mcNick = interaction.fields.getTextInputValue('mc_nickname').trim();
  
  let socialLink = null;
  let screenshotLink = null;
  try { socialLink = interaction.fields.getTextInputValue('social_link').trim(); } catch(e) {}
  try { screenshotLink = interaction.fields.getTextInputValue('screenshot_link').trim(); } catch(e) {}

  const categories = await getTicketCategories(interaction.guild.id);
  const category = categories.find(c => c.id === parseInt(categoryId));

  if (!category) {
    return interaction.editReply({ content: '❌〢Kategoria nie istnieje!' });
  }

  await executeTicketCreation(interaction, category, mcNick, socialLink, screenshotLink);
}

/**
 * Execute the actual ticket creation after logic checks
 */
async function executeTicketCreation(interaction, category, mcNick = null, socialLink = null, screenshotLink = null) {
  const guild = interaction.guild;
  const user = interaction.user;

  const ticketConfig = await getTicketConfig(guild.id);

  // === CHECK: Max tickets limit ===
  const maxTickets = ticketConfig?.max_tickets || MAX_TICKETS_DEFAULT;
  const activeCount = await countActiveTickets(guild.id);

  if (activeCount >= maxTickets) {
    return interaction.editReply({
      content: `❌〢Osiągnięto limit ticketów! Aktualnie otwartych: **${activeCount}/${maxTickets}**.\nPoczekaj aż administracja zamknie istniejące tickety.`
    });
  }

  // === CHECK: User cooldown (5 min) ===
  const lastTicketTime = await getLastUserTicketTime(guild.id, user.id);
  if (lastTicketTime) {
    const lastTime = new Date(lastTicketTime + 'Z').getTime();
    const elapsed = Date.now() - lastTime;
    const remaining = COOLDOWN_MS - elapsed;

    if (remaining > 0) {
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.ceil((remaining % 60000) / 1000);
      return interaction.editReply({
        content: `⏳〢Musisz poczekać **${minutes > 0 ? `${minutes} min ` : ''}${seconds} sek** zanim stworzysz kolejny ticket.`
      });
    }
  }

  // === CHECK: User already has open ticket in this category ===
  const userTickets = await countUserActiveTickets(guild.id, user.id);
  if (userTickets >= 3) {
    return interaction.editReply({
      content: `❌〢Masz już **${userTickets}** otwarte tickety. Zamknij stare zanim otworzysz nowe.`
    });
  }

  try {
    const ticketNumber = await getNextTicketNumber(guild.id);
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
      topic: `${category.emoji}〢Ticket od ${user.tag} | Kategoria: ${category.name}${mcNick ? ` | Nick: ${mcNick}` : ''}`
    });

    // Save to database
    await createActiveTicket(guild.id, ticketChannel.id, user.id, category.name, ticketNumber, mcNick);

    // Build ticket embed inside the channel
    const ticketEmbed = new EmbedBuilder()
      .setTitle('Ticket Otwarty')
      .setDescription(
        `${interaction.user} Stworzył nowego ${category.emoji}〢**${category.name}** Ticketa.\n\n` +
        `> 🎫〢Ticket #${ticketNumber}\n` +
        `> 📋〢Kategoria: ${category.name}\n` +
        (mcNick ? `> 👤〢Nick gracza: **${mcNick}**\n` : '') +
        (socialLink ? `> 🌐〢Social media: **${socialLink}**\n` : '') +
        (screenshotLink ? `> 📸〢Screen/Dowód: **${screenshotLink}**\n` : '') +
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

    const isMediaTworca = !!category.requires_mc_nick;
    const componentsArray = [buttons];

    if (isMediaTworca && mcNick) {
      const mediaButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_set_tworca')
          .setLabel('👤〢TWÓRCA')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ticket_set_media')
          .setLabel('🎥〢MEDIA')
          .setStyle(ButtonStyle.Primary)
      );
      componentsArray.push(mediaButtons);
    }

    await ticketChannel.send({ embeds: [ticketEmbed], components: componentsArray });
    
    let descriptionText = `${user} Opisz swój problem poniżej. Administracja wkrótce odpowie.`;
    if (isMediaTworca && mcNick) {
      descriptionText = `${user} Administrator zweryfikuje Twoje zgłoszenie i zdecyduje, jaką rangę otrzymasz (Twórca lub Media).`;
    }
    await ticketChannel.send({ content: descriptionText });

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
    try {
      await interaction.editReply({ content: '❌〢Wystąpił błąd podczas tworzenia ticketa.' });
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Handle ticket close button
 */
async function handleTicketClose(interaction) {
  await interaction.deferReply();

  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.editReply({ content: '❌〢To nie jest kanał ticketa!' });
  }

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒〢Ticket Zamknięty')
    .setDescription(
      `Ticket został zamknięty przez ${interaction.user}.\n` +
      `Kanał zostanie usunięty za **5 sekund**...`
    )
    .setColor(0xf04747)
    .setTimestamp();

  await interaction.editReply({ embeds: [closeEmbed] });

  setTimeout(async () => {
    try {
      await deleteActiveTicket(interaction.channel.id);
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
  await interaction.deferReply();

  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.editReply({ content: '❌〢To nie jest kanał ticketa!' });
  }

  if (ticket.claimed_by) {
    return interaction.editReply({
      content: `📋〢Ten ticket jest już odebrany przez <@${ticket.claimed_by}>!`
    });
  }

  await claimTicket(interaction.channel.id, interaction.user.id);

  const claimEmbed = new EmbedBuilder()
    .setDescription(`📋〢${interaction.user} odebrał ten ticket.`)
    .setColor(0x43b581)
    .setTimestamp();

  await interaction.editReply({ embeds: [claimEmbed] });
}

/**
 * Handle ticket Set Tworca button (Discord → MC bridge)
 */
async function handleTicketSetTworca(interaction) {
  await interaction.deferReply();

  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.editReply({ content: '❌〢To nie jest kanał ticketa!' });
  }
  if (!ticket.mc_nick) {
    return interaction.editReply({ content: '❌〢Brak nicku Minecraft skojarzonego z tym ticketem!' });
  }

  const { addPendingCommand } = require('../../database/db');
  const command = `lp user ${ticket.mc_nick} parent set tworca`;
  
  try {
    await addPendingCommand(ticket.mc_nick, command, interaction.guild.id, 'discord');
    const embed = new EmbedBuilder()
      .setDescription(`🎉〢Gratulacje! Udało ci się! Ranga **TWÓRCA** została nadana na twój nick **${ticket.mc_nick}**!`)
      .setColor(0x43b581);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding pending command tworca:', error);
    await interaction.editReply({ content: '❌〢Wystąpił błąd podczas dodawania komendy do kolejki.' });
  }
}

/**
 * Handle ticket Set Media button (Discord → MC bridge)
 */
async function handleTicketSetMedia(interaction) {
  await interaction.deferReply();

  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.editReply({ content: '❌〢To nie jest kanał ticketa!' });
  }
  if (!ticket.mc_nick) {
    return interaction.editReply({ content: '❌〢Brak nicku Minecraft skojarzonego z tym ticketem!' });
  }

  const { addPendingCommand } = require('../../database/db');
  const command = `lp user ${ticket.mc_nick} parent set media`;

  try {
    await addPendingCommand(ticket.mc_nick, command, interaction.guild.id, 'discord');
    const embed = new EmbedBuilder()
      .setDescription(`🎉〢Gratulacje! Udało ci się! Ranga **MEDIA** została nadana na twój nick **${ticket.mc_nick}**!`)
      .setColor(0x43b581);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding pending command media:', error);
    await interaction.editReply({ content: '❌〢Wystąpił błąd podczas dodawania komendy do kolejki.' });
  }
}

module.exports = {
  sendTicketPanel,
  handleTicketCreate,
  handleTicketModalSubmit,
  handleTicketClose,
  handleTicketClaim,
  handleTicketSetTworca,
  handleTicketSetMedia
};
