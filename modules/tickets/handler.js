// Ticket system handler
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const {
  getTicketConfig, getTicketCategories, getNextTicketNumber,
  createActiveTicket, getActiveTicket, claimTicket, deleteActiveTicket,
  countActiveTickets, countUserActiveTickets, getLastUserTicketTime,
  getConfig
} = require('../../database/db');

const MAX_TICKETS_DEFAULT = 50;
const MC_NICK_REGEX = /^[A-Za-z0-9_]{3,16}$/;

/**
 * Configured support role IDs (JSON list with legacy single-column fallback)
 */
function getSupportRoleIds(ticketConfig) {
  if (!ticketConfig) return [];
  let ids = [];
  if (ticketConfig.support_role_ids) {
    try {
      const parsed = JSON.parse(ticketConfig.support_role_ids);
      if (Array.isArray(parsed)) ids = parsed;
    } catch (e) {}
  }
  if (ids.length === 0 && ticketConfig.support_role_id) {
    ids = [ticketConfig.support_role_id];
  }
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Staff = administrator / manage guild, or any of the configured support roles
 */
function isTicketStaff(member, ticketConfig) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }
  return getSupportRoleIds(ticketConfig).some(roleId => member.roles.cache.has(roleId));
}

/**
 * Reject an already-deferred interaction with an ephemeral message
 * (removes the public "thinking..." placeholder)
 */
async function denyInteraction(interaction, message) {
  try { await interaction.deleteReply(); } catch (e) {}
  try { await interaction.followUp({ content: message, ephemeral: true }); } catch (e) {}
}

/**
 * Wyślij log zdarzenia ticketowego na skonfigurowany kanał logów (jeśli ustawiony)
 */
async function sendTicketLog(guild, ticketConfig, embed) {
  try {
    if (!ticketConfig || !ticketConfig.log_channel_id) return;
    const channel = guild.channels.cache.get(ticketConfig.log_channel_id);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (e) { /* log nie może wywalić głównej akcji */ }
}

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

  // Nick trafia później do komendy konsolowej (lp user <nick> ...) — musi mieć poprawny format
  if (!MC_NICK_REGEX.test(mcNick)) {
    return interaction.editReply({ content: '❌〢Wpisz poprawny nick Minecraft (3-16 znaków: litery, cyfry i _).' });
  }

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

  // === CHECK: User cooldown (konfigurowalny w panelu, 0 = wyłączony) ===
  const cooldownMinutes = Number.isFinite(+ticketConfig?.cooldown_minutes) ? +ticketConfig.cooldown_minutes : 5;
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const lastTicketTime = cooldownMs > 0 ? await getLastUserTicketTime(guild.id, user.id) : null;
  if (lastTicketTime) {
    let lastTime;
    if (lastTicketTime instanceof Date) {
      lastTime = lastTicketTime.getTime();
    } else {
      // String from MySQL — append 'Z' only if no timezone info
      const str = String(lastTicketTime);
      lastTime = new Date(str.endsWith('Z') || str.includes('+') ? str : str + 'Z').getTime();
    }
    const elapsed = Date.now() - lastTime;
    const remaining = cooldownMs - elapsed;

    if (remaining > 0) {
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.ceil((remaining % 60000) / 1000);
      return interaction.editReply({
        content: `⏳〢Musisz poczekać **${minutes > 0 ? `${minutes} min ` : ''}${seconds} sek** zanim stworzysz kolejny ticket.`
      });
    }
  }

  // === CHECK: Limit otwartych ticketów na osobę (konfigurowalny, 0 = bez limitu) ===
  const userTicketLimit = Number.isFinite(+ticketConfig?.user_ticket_limit) ? +ticketConfig.user_ticket_limit : 3;
  if (userTicketLimit > 0) {
    const userTickets = await countUserActiveTickets(guild.id, user.id);
    if (userTickets >= userTicketLimit) {
      return interaction.editReply({
        content: `❌〢Masz już **${userTickets}** otwarte tickety. Zamknij stare zanim otworzysz nowe.`
      });
    }
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

    // Add support roles if configured (multi-role list with fallback to legacy single role)
    const supportRoleIds = getSupportRoleIds(ticketConfig);
    for (const roleId of supportRoleIds) {
      // Overwrite dla usuniętej roli wywala całe guild.channels.create — pomijamy nieistniejące
      if (!guild.roles.cache.has(roleId)) {
        console.warn(`⚠️ Ticket: pomijam nieistniejącą rolę supportu ${roleId} (gildia ${guild.id})`);
        continue;
      }
      permOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }

    // Jawna blokada ról weryfikacyjnych wpisana już przy tworzeniu kanału —
    // nawet gdyby coś kiedyś nadało tym rolom dostęp, ticket ma własny deny
    const guildConfig = await getConfig(guild.id);
    for (const roleId of [guildConfig?.verified_role_id, guildConfig?.unverified_role_id]) {
      if (roleId && guild.roles.cache.has(roleId) && !supportRoleIds.includes(roleId)) {
        permOverwrites.push({
          id: roleId,
          deny: [PermissionFlagsBits.ViewChannel]
        });
      }
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
      .setColor(category.color ? (parseInt(category.color.replace('#', ''), 16) || 0x5865F2) : 0x5865F2)
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
    
    let descriptionText = `Opisz swój problem poniżej. Administracja wkrótce odpowie.`;
    if (isMediaTworca && mcNick) {
      descriptionText = `Administrator zweryfikuje Twoje zgłoszenie i zdecyduje, jaką rangę otrzymasz (Twórca lub Media).`;
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

    // Log otwarcia ticketa
    await sendTicketLog(guild, ticketConfig, new EmbedBuilder()
      .setTitle('Ticket otwarty')
      .setDescription(`**#${channelName}** (${ticketChannel})\nAutor: ${user} (\`${user.tag}\`)\nKategoria: **${category.name}**${mcNick ? `\nNick MC: **${mcNick}**` : ''}`)
      .setColor(0x43b581)
      .setTimestamp());

  } catch (error) {
    console.error('Error creating ticket:', error.message, error.stack);
    try {
      await interaction.editReply({ content: `❌〢Wystąpił błąd podczas tworzenia ticketa: ${error.message}` });
    } catch (e) {
      console.error('Error sending ticket error reply:', e.message);
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

  // Zamknąć może tylko autor ticketa albo administracja/support
  const ticketConfig = await getTicketConfig(interaction.guild.id);
  if (interaction.user.id !== ticket.user_id && !isTicketStaff(interaction.member, ticketConfig)) {
    return denyInteraction(interaction, '⛔〢Ten ticket może zamknąć tylko jego autor lub administracja!');
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

  // Log zamknięcia ticketa
  await sendTicketLog(interaction.guild, ticketConfig, new EmbedBuilder()
    .setTitle('Ticket zamknięty')
    .setDescription(`**#${interaction.channel.name}** (Ticket #${ticket.ticket_number || '?'})\nZamknięty przez: ${interaction.user} (\`${interaction.user.tag}\`)\nAutor ticketa: <@${ticket.user_id}>`)
    .setColor(0xf04747)
    .setTimestamp());

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

  // Odbierać tickety może tylko administracja/support — nie zwykły gracz ani autor ticketa
  const ticketConfig = await getTicketConfig(interaction.guild.id);
  if (!isTicketStaff(interaction.member, ticketConfig)) {
    return denyInteraction(interaction, '⛔〢Tylko administracja może odbierać tickety!');
  }

  if (ticket.claimed_by) {
    return denyInteraction(interaction, `📋〢Ten ticket jest już odebrany przez <@${ticket.claimed_by}>!`);
  }

  const claimed = await claimTicket(interaction.channel.id, interaction.user.id);
  if (!claimed) {
    return denyInteraction(interaction, '📋〢Ktoś właśnie odebrał ten ticket przed Tobą!');
  }

  const claimEmbed = new EmbedBuilder()
    .setDescription(`📋〢${interaction.user} odebrał ten ticket.`)
    .setColor(0x43b581)
    .setTimestamp();

  await interaction.editReply({ embeds: [claimEmbed] });

  // Log odebrania ticketa
  await sendTicketLog(interaction.guild, ticketConfig, new EmbedBuilder()
    .setTitle('Ticket odebrany')
    .setDescription(`**#${interaction.channel.name}**\nOdebrał: ${interaction.user} (\`${interaction.user.tag}\`)`)
    .setColor(0xfaa61a)
    .setTimestamp());
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

  // KRYTYCZNE: rangę może nadać wyłącznie administracja/support — nigdy autor ticketa
  const ticketConfig = await getTicketConfig(interaction.guild.id);
  if (!isTicketStaff(interaction.member, ticketConfig)) {
    return denyInteraction(interaction, '⛔〢Tylko administracja może nadać rangę TWÓRCA!');
  }

  if (!ticket.mc_nick) {
    return interaction.editReply({ content: '❌〢Brak nicku Minecraft skojarzonego z tym ticketem!' });
  }
  if (!MC_NICK_REGEX.test(ticket.mc_nick)) {
    return interaction.editReply({ content: '❌〢Nick w tym tickecie ma niepoprawny format — nadaj rangę ręcznie w grze.' });
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

  // KRYTYCZNE: rangę może nadać wyłącznie administracja/support — nigdy autor ticketa
  const ticketConfig = await getTicketConfig(interaction.guild.id);
  if (!isTicketStaff(interaction.member, ticketConfig)) {
    return denyInteraction(interaction, '⛔〢Tylko administracja może nadać rangę MEDIA!');
  }

  if (!ticket.mc_nick) {
    return interaction.editReply({ content: '❌〢Brak nicku Minecraft skojarzonego z tym ticketem!' });
  }
  if (!MC_NICK_REGEX.test(ticket.mc_nick)) {
    return interaction.editReply({ content: '❌〢Nick w tym tickecie ma niepoprawny format — nadaj rangę ręcznie w grze.' });
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
  handleTicketSetMedia,
  isTicketStaff
};
