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

  const options = categories.map(cat => ({
    label: `〢${cat.name}`,
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
 * Handle category selection — create ticket channel or show modal
 */
async function handleTicketCreate(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const categoryId = interaction.values[0].replace('ticket_cat_', '');

  const categories = await getTicketCategories(guild.id);
  const category = categories.find(c => c.id === parseInt(categoryId));

  if (!category) {
    return interaction.reply({ content: '❌〢Kategoria nie istnieje!', ephemeral: true });
  }

  // Check if this is the media/creator category (flexible checking for media, twórca, tworca, combinations)
  const cleanName = category.name.toUpperCase().replace(/\s+/g, '');
  const isMediaTworca = cleanName.includes('TWÓRCA') || cleanName.includes('TWORCA') || cleanName.includes('MEDIA');

  if (isMediaTworca) {
    // Show Modal first
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${category.id}`)
      .setTitle(`Wymagany Nick Minecraft`);

    const nickInput = new TextInputBuilder()
      .setCustomId('mc_nickname')
      .setLabel('Wpisz swój nick z Minecrafta')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(16)
      .setPlaceholder('np. Steve');

    const row = new ActionRowBuilder().addComponents(nickInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // Create ticket immediately
  await executeTicketCreation(interaction, category, null);
}

/**
 * Handle ticket modal submission for nickname
 */
async function handleTicketModalSubmit(interaction) {
  const categoryId = interaction.customId.replace('ticket_modal_', '');
  const mcNick = interaction.fields.getTextInputValue('mc_nickname').trim();

  const categories = await getTicketCategories(interaction.guild.id);
  const category = categories.find(c => c.id === parseInt(categoryId));

  if (!category) {
    return interaction.reply({ content: '❌〢Kategoria nie istnieje!', ephemeral: true });
  }

  await executeTicketCreation(interaction, category, mcNick);
}

/**
 * Execute the actual ticket creation after logic checks
 */
async function executeTicketCreation(interaction, category, mcNick = null) {
  const guild = interaction.guild;
  const user = interaction.user;

  const ticketConfig = await getTicketConfig(guild.id);

  // === CHECK: Max tickets limit ===
  const maxTickets = ticketConfig?.max_tickets || MAX_TICKETS_DEFAULT;
  const activeCount = await countActiveTickets(guild.id);

  if (activeCount >= maxTickets) {
    return interaction.reply({
      content: `❌〢Osiągnięto limit ticketów! Aktualnie otwartych: **${activeCount}/${maxTickets}**.\nPoczekaj aż administracja zamknie istniejące tickety.`,
      ephemeral: true
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
      return interaction.reply({
        content: `⏳〢Musisz poczekać **${minutes > 0 ? `${minutes} min ` : ''}${seconds} sek** zanim stworzysz kolejny ticket.`,
        ephemeral: true
      });
    }
  }

  // === CHECK: User already has open ticket in this category ===
  const userTickets = await countUserActiveTickets(guild.id, user.id);
  if (userTickets >= 3) {
    return interaction.reply({
      content: `❌〢Masz już **${userTickets}** otwarte tickety. Zamknij stare zanim otworzysz nowe.`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

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

    const cleanName = category.name.toUpperCase().replace(/\s+/g, '');
    const isMediaTworca = cleanName.includes('TWÓRCA') || cleanName.includes('TWORCA') || cleanName.includes('MEDIA');
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
      descriptionText = `${user} Chcesz otrzymać rangę Twórca lub Media? Nasz system automatycznie zsynchronizuje twoją rangę na serwerze Minecraft z rangą na Discordzie po zweryfikowaniu twoich statystyk i zatwierdzeniu przez administrację.\nAdministracja użyje przycisków na górze aby nadać odpowiednią rangę na serwerze Minecraft.`;
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
  const ticket = await getActiveTicket(interaction.channel.id);
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
  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: '❌〢To nie jest kanał ticketa!', ephemeral: true });
  }

  if (ticket.claimed_by) {
    return interaction.reply({
      content: `📋〢Ten ticket jest już odebrany przez <@${ticket.claimed_by}>!`,
      ephemeral: true
    });
  }

  await claimTicket(interaction.channel.id, interaction.user.id);

  const claimEmbed = new EmbedBuilder()
    .setDescription(`📋〢${interaction.user} odebrał ten ticket.`)
    .setColor(0x43b581)
    .setTimestamp();

  await interaction.reply({ embeds: [claimEmbed] });
}

/**
 * Handle ticket Set Tworca button (Discord → MC bridge)
 */
async function handleTicketSetTworca(interaction) {
  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: '❌〢To nie jest kanał ticketa!', ephemeral: true });
  }
  if (!ticket.mc_nick) {
    return interaction.reply({ content: '❌〢Brak nicku Minecraft skojarzonego z tym ticketem!', ephemeral: true });
  }

  const { addPendingCommand } = require('../../database/db');
  const command = `lp user ${ticket.mc_nick} parent set tworca`;
  
  try {
    await addPendingCommand(ticket.mc_nick, command, interaction.guild.id, 'discord');
    const embed = new EmbedBuilder()
      .setDescription(`✅〢Kolejka: Dodano komendę nadania rangi **TWÓRCA** dla **${ticket.mc_nick}**.\n\`${command}\``)
      .setColor(0x43b581);
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding pending command tworca:', error);
    await interaction.reply({ content: '❌〢Wystąpił błąd podczas dodawania komendy do kolejki.', ephemeral: true });
  }
}

/**
 * Handle ticket Set Media button (Discord → MC bridge)
 */
async function handleTicketSetMedia(interaction) {
  const ticket = await getActiveTicket(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: '❌〢To nie jest kanał ticketa!', ephemeral: true });
  }
  if (!ticket.mc_nick) {
    return interaction.reply({ content: '❌〢Brak nicku Minecraft skojarzonego z tym ticketem!', ephemeral: true });
  }

  const { addPendingCommand } = require('../../database/db');
  const command = `lp user ${ticket.mc_nick} parent set media`;

  try {
    await addPendingCommand(ticket.mc_nick, command, interaction.guild.id, 'discord');
    const embed = new EmbedBuilder()
      .setDescription(`✅〢Kolejka: Dodano komendę nadania rangi **MEDIA** dla **${ticket.mc_nick}**.\n\`${command}\``)
      .setColor(0x43b581);
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding pending command media:', error);
    await interaction.reply({ content: '❌〢Wystąpił błąd podczas dodawania komendy do kolejki.', ephemeral: true });
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
