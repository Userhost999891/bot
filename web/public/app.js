// NarisMC Core Panel — Frontend App (Redesigned)
(function() {
  'use strict';

  let selectedGuildId = null;
  let selectedGuildName = '';
  let currentSection = 'servers';
  let botAvatar = '';
  let botName = 'NarisMC Bot';

  const $ = id => document.getElementById(id);

  // =============================
  // INIT
  // =============================
  async function init() {
    try {
      const res = await fetch('/auth/me');
      if (!res.ok) { window.location.href = '/'; return; }
      const user = await res.json();
      setupUserInfo(user);
      await loadGuilds();
      setupNavigation();
      setupColorPickers();
      setupAnnouncementPreview();
      setupCategoryModal();
    } catch (e) {
      window.location.href = '/';
    }
  }

  function setupUserInfo(user) {
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || '0') % 5}.png`;
    $('user-avatar').src = avatarUrl;
    $('user-name').textContent = user.username;
  }

  // =============================
  // NAVIGATION
  // =============================
  function setupNavigation() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (section === 'servers') {
          switchSection('servers');
        } else if (!selectedGuildId) {
          showSectionStatus('ver', 'Najpierw wybierz serwer!', 'error');
          switchSection('servers');
        } else {
          switchSection(section);
        }
      });
    });
  }

  function enableSidebarItems() {
    document.querySelectorAll('.sidebar-item.disabled').forEach(item => {
      item.classList.remove('disabled');
    });
  }

  function switchSection(section) {
    currentSection = section;

    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });

    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    const target = $(`section-${section}`);
    if (target) {
      target.classList.remove('hidden');
      target.style.animation = 'none';
      target.offsetHeight;
      target.style.animation = '';
    }

    if (selectedGuildId) {
      if (section === 'dashboard') loadDashboardData();
      if (section === 'verification') loadVerificationData();
      if (section === 'tickets') loadTicketsData();
      if (section === 'announcements') loadAnnouncementsData();
      if (section === 'rewards') loadRewardsData();
      if (section === 'tictactoe') loadTTTData();
    }
  }

  // =============================
  // LOAD GUILDS
  // =============================
  async function loadGuilds() {
    const grid = $('server-grid');
    try {
      const [resGuilds, resClient] = await Promise.all([
        fetch('/api/guilds'),
        fetch('/api/client-id')
      ]);
      const guilds = await resGuilds.json();
      const { clientId } = await resClient.json();
      grid.innerHTML = '';

      if (guilds.length === 0) {
        grid.innerHTML = `
          <div class="no-servers">
            <h3>Brak serwerów</h3>
            <p>Bot nie jest na żadnym z Twoich serwerów, lub nie masz uprawnień administratora.</p>
            <a href="https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands"
               target="_blank" class="invite-link">Zaproś bota na serwer</a>
          </div>`;
        return;
      }

      guilds.forEach(guild => {
        const card = document.createElement('div');
        card.className = 'server-card';
        card.onclick = () => selectGuild(guild);
        const iconHtml = guild.icon
          ? `<img src="${guild.icon}" class="server-icon" alt="">`
          : `<div class="server-icon-placeholder">${guild.name.charAt(0).toUpperCase()}</div>`;
        card.innerHTML = `${iconHtml}<span class="server-name">${escapeHtml(guild.name)}</span>`;
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<div class="no-servers"><h3>Błąd ładowania</h3><p>Spróbuj odświeżyć stronę.</p></div>';
    }
  }

  function selectGuild(guild) {
    selectedGuildId = guild.id;
    selectedGuildName = guild.name;

    document.querySelectorAll('.server-badge').forEach(b => b.textContent = guild.name);
    enableSidebarItems();
    switchSection('dashboard');
  }

  // =============================
  // DASHBOARD
  // =============================
  async function loadDashboardData() {
    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/stats`);
      const stats = await res.json();

      $('stat-members').textContent = stats.memberCount || '—';
      $('stat-online').textContent = stats.online || '0';
      $('stat-channels').textContent = stats.channels || '—';
      $('stat-roles').textContent = stats.roles || '—';
      $('stat-bots').textContent = stats.bots || '—';
      $('stat-boosts').textContent = stats.boostCount || '0';

      if (stats.botAvatar) botAvatar = stats.botAvatar;
      if (stats.botName) botName = stats.botName;

      // Update preview bot info
      const avatarEl = $('preview-bot-avatar');
      const nameEl = $('preview-bot-name');
      if (avatarEl && botAvatar) avatarEl.src = botAvatar;
      if (nameEl) nameEl.textContent = botName;

      // Animate stat values
      document.querySelectorAll('.stat-card').forEach((card, i) => {
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = `sectionIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.06}s both`;
      });
    } catch (e) {
      console.error('Error loading dashboard:', e);
    }
  }

  // =============================
  // VERIFICATION
  // =============================
  async function loadVerificationData() {
    showSectionStatus('ver', 'Ładowanie...', 'info');
    await Promise.all([loadChannels(), loadVerificationConfig()]);
    hideSectionStatus('ver');
  }

  async function loadChannels() {
    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/channels`);
      const channels = await res.json();

      const select = $('verification-channel');
      select.innerHTML = '<option value="">-- Wybierz kanał --</option>';
      channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `#${ch.name} (${ch.category})`;
        select.appendChild(opt);
      });

      const tickSelect = $('ticket-channel');
      if (tickSelect) {
        tickSelect.innerHTML = '<option value="">-- Wybierz kanał --</option>';
        channels.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = `#${ch.name} (${ch.category})`;
          tickSelect.appendChild(opt);
        });
      }

      const annSelect = $('ann-channel');
      if (annSelect) {
        annSelect.innerHTML = '<option value="">-- Wybierz kanał --</option>';
        channels.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = `#${ch.name} (${ch.category})`;
          annSelect.appendChild(opt);
        });
      }

      const container = $('visible-channels');
      container.innerHTML = '';
      channels.forEach(ch => {
        const label = document.createElement('label');
        label.className = 'channel-checkbox';
        label.innerHTML = `<input type="checkbox" value="${ch.id}"><span>#${escapeHtml(ch.name)}</span>`;
        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => label.classList.toggle('checked', checkbox.checked));
        container.appendChild(label);
      });
    } catch (e) {
      console.error('Error loading channels:', e);
    }
  }

  async function loadVerificationConfig() {
    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/config`);
      const config = await res.json();
      if (config.verification_channel_id) $('verification-channel').value = config.verification_channel_id;
      if (config.verified_role_name) $('verified-role-name').value = config.verified_role_name;
      if (config.unverified_role_name) $('unverified-role-name').value = config.unverified_role_name;
      const visible = config.visible_channels || [];
      document.querySelectorAll('#visible-channels input[type="checkbox"]').forEach(cb => {
        if (visible.includes(cb.value)) {
          cb.checked = true;
          cb.closest('.channel-checkbox').classList.add('checked');
        }
      });
    } catch (e) { console.error('Error loading config:', e); }
  }

  async function saveVerificationConfig() {
    const verificationChannelId = $('verification-channel').value;
    const verifiedRoleName = $('verified-role-name').value.trim();
    const unverifiedRoleName = $('unverified-role-name').value.trim();
    const visibleChannels = [];
    document.querySelectorAll('#visible-channels input:checked').forEach(cb => visibleChannels.push(cb.value));

    if (!verificationChannelId) return showSectionStatus('ver', 'Wybierz kanał weryfikacji!', 'error');
    if (!verifiedRoleName || !unverifiedRoleName) return showSectionStatus('ver', 'Uzupełnij nazwy ról!', 'error');

    try {
      disableButtons(true);
      const res = await fetch(`/api/guild/${selectedGuildId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_channel_id: verificationChannelId, verified_role_name: verifiedRoleName, unverified_role_name: unverifiedRoleName, visible_channels: visibleChannels })
      });
      const data = await res.json();
      showSectionStatus('ver', data.message || data.error || 'Zapisano!', data.success ? 'success' : 'error');
    } catch (e) { showSectionStatus('ver', 'Błąd zapisu', 'error'); }
    finally { disableButtons(false); }
  }

  async function createRoles() {
    try {
      disableButtons(true);
      const res = await fetch(`/api/guild/${selectedGuildId}/create-roles`, { method: 'POST' });
      const data = await res.json();
      showSectionStatus('ver', data.message || data.error, data.success ? 'success' : 'error');
    } catch (e) { showSectionStatus('ver', 'Błąd tworzenia ról', 'error'); }
    finally { disableButtons(false); }
  }

  async function setupPermissions() {
    try {
      disableButtons(true);
      showSectionStatus('ver', 'Ustawianie uprawnień...', 'info');
      const res = await fetch(`/api/guild/${selectedGuildId}/setup-permissions`, { method: 'POST' });
      const data = await res.json();
      showSectionStatus('ver', data.message || data.error, data.success ? 'success' : 'error');
    } catch (e) { showSectionStatus('ver', 'Błąd ustawiania uprawnień', 'error'); }
    finally { disableButtons(false); }
  }

  async function sendVerification() {
    try {
      disableButtons(true);
      const res = await fetch(`/api/guild/${selectedGuildId}/send-verification`, { method: 'POST' });
      const data = await res.json();
      showSectionStatus('ver', data.message || data.error, data.success ? 'success' : 'error');
    } catch (e) { showSectionStatus('ver', 'Błąd wysyłania', 'error'); }
    finally { disableButtons(false); }
  }

  // =============================
  // TICKETS
  // =============================
  async function loadTicketsData() {
    showSectionStatus('tick', 'Ładowanie...', 'info');
    await Promise.all([loadTicketsConfig(), loadTicketCategories(), loadRolesForTickets(), loadDiscordCategories()]);
    hideSectionStatus('tick');
  }

  async function loadTicketsConfig() {
    try {
      const res = await fetch(`/api/tickets/guild/${selectedGuildId}/config`);
      const config = await res.json();
      if (config.ticket_channel_id) $('ticket-channel').value = config.ticket_channel_id;
      if (config.support_role_id) {
        setTimeout(() => { $('ticket-support-role').value = config.support_role_id; }, 200);
      }
    } catch (e) { console.error('Error loading ticket config:', e); }
  }

  async function loadRolesForTickets() {
    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/roles`);
      const roles = await res.json();
      if (!Array.isArray(roles)) throw new Error(roles.error || 'Server returned invalid roles data');
      const select = $('ticket-support-role');
      select.innerHTML = '<option value="">-- Wybierz rolę --</option>';
      roles.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        opt.style.color = r.color !== '#000000' ? r.color : '';
        select.appendChild(opt);
      });
    } catch (e) {
      console.error('Error loading roles:', e);
      alert('Nie udało się załadować listy ról: ' + e.message);
    }
  }

  async function loadDiscordCategories() {
    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/categories`);
      const cats = await res.json();
      if (!Array.isArray(cats)) throw new Error(cats.error || 'Server returned invalid categories data');
      const select = $('cat-discord-category');
      select.innerHTML = '<option value="">-- Bez kategorii --</option>';
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
    } catch (e) {
      console.error('Error loading discord categories:', e);
      alert('Nie udało się załadować listy kategorii: ' + e.message);
    }
  }

  async function loadTicketCategories() {
    try {
      const res = await fetch(`/api/tickets/guild/${selectedGuildId}/categories`);
      const cats = await res.json();
      const list = $('categories-list');

      if (cats.length === 0) {
        list.innerHTML = '<p class="text-muted">Brak kategorii. Dodaj pierwszą kategorię ticketów.</p>';
        return;
      }

      list.innerHTML = '';
      cats.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
          <span class="category-emoji">${cat.emoji || '📋'}</span>
          <div class="category-info">
            <h4><span class="category-color-dot" style="background:${cat.color || '#5865F2'}"></span>${escapeHtml(cat.name)}</h4>
            <p>${escapeHtml(cat.description || 'Brak opisu')}</p>
          </div>
          <div class="category-actions">
            <button class="action-btn action-btn-save action-btn-sm" data-edit="${cat.id}">✏️</button>
            <button class="action-btn action-btn-danger action-btn-sm" data-delete="${cat.id}">🗑️</button>
          </div>
        `;

        card.querySelector('[data-edit]').addEventListener('click', () => openEditCategory(cat));
        card.querySelector('[data-delete]').addEventListener('click', () => deleteCategoryAction(cat.id, cat.name));
        list.appendChild(card);
      });
    } catch (e) { console.error('Error loading categories:', e); }
  }

  async function saveTicketConfig() {
    const ticket_channel_id = $('ticket-channel').value;
    const support_role_id = $('ticket-support-role').value;
    if (!ticket_channel_id) return showSectionStatus('tick', 'Wybierz kanał ticketów!', 'error');
    try {
      disableButtons(true);
      const res = await fetch(`/api/tickets/guild/${selectedGuildId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_channel_id, support_role_id })
      });
      const data = await res.json();
      showSectionStatus('tick', data.message || data.error, data.success ? 'success' : 'error');
    } catch (e) { showSectionStatus('tick', 'Błąd zapisu', 'error'); }
    finally { disableButtons(false); }
  }

  async function sendTicketPanel() {
    try {
      disableButtons(true);
      const res = await fetch(`/api/tickets/guild/${selectedGuildId}/send-panel`, { method: 'POST' });
      const data = await res.json();
      showSectionStatus('tick', data.message || data.error, data.success ? 'success' : 'error');
    } catch (e) { showSectionStatus('tick', 'Błąd wysyłania panelu', 'error'); }
    finally { disableButtons(false); }
  }

  // Category modal
  function setupCategoryModal() {
    $('add-category-btn').addEventListener('click', () => openAddCategory());
    $('modal-cancel-btn').addEventListener('click', () => closeCategoryModal());
    $('modal-save-btn').addEventListener('click', () => saveCategoryFromModal());
    $('category-modal').addEventListener('click', (e) => {
      if (e.target === $('category-modal')) closeCategoryModal();
    });
  }

  function openAddCategory() {
    $('modal-title').textContent = 'Dodaj kategorię';
    $('cat-name').value = '';
    $('cat-emoji').value = '';
    $('cat-description').value = '';
    $('cat-discord-category').value = '';
    $('cat-color').value = '#5865F2';
    $('cat-color-hex').textContent = '#5865F2';
    $('cat-edit-id').value = '';
    $('category-modal').classList.remove('hidden');
  }

  function openEditCategory(cat) {
    $('modal-title').textContent = 'Edytuj kategorię';
    $('cat-name').value = cat.name || '';
    $('cat-emoji').value = cat.emoji || '';
    $('cat-description').value = cat.description || '';
    $('cat-discord-category').value = cat.discord_category_id || '';
    $('cat-color').value = cat.color || '#5865F2';
    $('cat-color-hex').textContent = cat.color || '#5865F2';
    $('cat-edit-id').value = cat.id;
    $('category-modal').classList.remove('hidden');
  }

  function closeCategoryModal() {
    $('category-modal').classList.add('hidden');
  }

  async function saveCategoryFromModal() {
    const name = $('cat-name').value.trim();
    const emoji = $('cat-emoji').value.trim();
    const description = $('cat-description').value.trim();
    const discord_category_id = $('cat-discord-category').value;
    const color = $('cat-color').value;
    const editId = $('cat-edit-id').value;

    if (!name) { alert('Wpisz nazwę kategorii!'); return; }

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/tickets/guild/${selectedGuildId}/categories/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, emoji, description, discord_category_id, color })
        });
      } else {
        res = await fetch(`/api/tickets/guild/${selectedGuildId}/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, emoji, description, discord_category_id, color })
        });
      }
      const data = await res.json();
      showSectionStatus('tick', data.message || data.error, data.success ? 'success' : 'error');
      closeCategoryModal();
      await loadTicketCategories();
    } catch (e) { showSectionStatus('tick', 'Błąd zapisu kategorii', 'error'); }
  }

  async function deleteCategoryAction(id, name) {
    if (!confirm(`Czy na pewno chcesz usunąć kategorię "${name}"?`)) return;
    try {
      const res = await fetch(`/api/tickets/guild/${selectedGuildId}/categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      showSectionStatus('tick', data.message || data.error, data.success ? 'success' : 'error');
      await loadTicketCategories();
    } catch (e) { showSectionStatus('tick', 'Błąd usuwania kategorii', 'error'); }
  }

  // =============================
  // ANNOUNCEMENTS
  // =============================
  async function loadAnnouncementsData() {
    showSectionStatus('ann', 'Ładowanie...', 'info');
    try {
      const annSelect = $('ann-channel');
      if (annSelect.options.length <= 1) {
        const res = await fetch(`/api/guild/${selectedGuildId}/channels`);
        const channels = await res.json();
        annSelect.innerHTML = '<option value="">-- Wybierz kanał --</option>';
        channels.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = `#${ch.name} (${ch.category})`;
          annSelect.appendChild(opt);
        });
      }

      const res = await fetch(`/api/announcements/guild/${selectedGuildId}/config`);
      const config = await res.json();
      if (config.default_channel_id) $('ann-channel').value = config.default_channel_id;
      if (config.default_color) {
        $('ann-color').value = config.default_color;
        $('ann-color-hex').textContent = config.default_color;
        updatePreviewColor(config.default_color);
      }
      if (config.footer_text) $('ann-footer').value = config.footer_text;

      // Set bot avatar in preview
      if (botAvatar) $('preview-bot-avatar').src = botAvatar;
      if (botName) $('preview-bot-name').textContent = botName;
      updateTimestamp();
    } catch (e) { console.error('Error loading announcements config:', e); }
    hideSectionStatus('ann');
  }

  function setupAnnouncementPreview() {
    $('ann-title').addEventListener('input', updatePreview);
    $('ann-content').addEventListener('input', updatePreview);
    $('ann-footer').addEventListener('input', updatePreview);
    $('ann-color').addEventListener('input', (e) => {
      $('ann-color-hex').textContent = e.target.value;
      updatePreviewColor(e.target.value);
    });
  }

  function updatePreview() {
    const title = $('ann-title').value;
    const content = $('ann-content').value || 'Wpisz treść ogłoszenia...';
    const footer = $('ann-footer').value || 'NarisMC';

    $('preview-title').textContent = title;
    $('preview-title').style.display = title ? '' : 'none';

    // Render basic markdown
    let rendered = escapeHtml(content);
    rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    rendered = rendered.replace(/\*(.+?)\*/g, '<em>$1</em>');
    rendered = rendered.replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>');
    $('preview-content').innerHTML = rendered;

    $('preview-footer').textContent = `${footer} • Dzisiaj`;
    updateTimestamp();
  }

  function updatePreviewColor(color) {
    $('preview-bar').style.background = color;
  }

  function updateTimestamp() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const ts = $('preview-timestamp');
    if (ts) ts.textContent = `Dzisiaj o ${h}:${m}`;
  }

  async function sendAnnouncement() {
    const channel_id = $('ann-channel').value;
    const title = $('ann-title').value.trim();
    const content = $('ann-content').value.trim();
    const color = $('ann-color').value;
    const footer = $('ann-footer').value.trim();
    const useSmallCaps = $('ann-smallcaps').checked;

    if (!channel_id) return showSectionStatus('ann', 'Wybierz kanał!', 'error');
    if (!content) return showSectionStatus('ann', 'Wpisz treść ogłoszenia!', 'error');

    try {
      disableButtons(true);
      const res = await fetch(`/api/announcements/guild/${selectedGuildId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id, title, content, color, footer, useSmallCaps })
      });
      const data = await res.json();
      showSectionStatus('ann', data.message || data.error, data.success ? 'success' : 'error');

      if (data.success) {
        fetch(`/api/announcements/guild/${selectedGuildId}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default_channel_id: channel_id, default_color: color, footer_text: footer })
        });
      }
    } catch (e) { showSectionStatus('ann', 'Błąd wysyłania', 'error'); }
    finally { disableButtons(false); }
  }

  // =============================
  // COLOR PICKERS
  // =============================
  function setupColorPickers() {
    $('cat-color').addEventListener('input', (e) => {
      $('cat-color-hex').textContent = e.target.value;
    });
  }

  // =============================
  // REWARDS
  // =============================
  let rewardChannelsCache = [];

  async function loadRewardsData() {
    showSectionStatus('rew', 'Ładowanie...', 'info');
    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/channels`);
      rewardChannelsCache = await res.json();
      await loadRewardServers();
    } catch (e) { console.error('Error loading rewards:', e); }
    hideSectionStatus('rew');
  }

  async function loadRewardServers() {
    try {
      const res = await fetch(`/api/rewards/guild/${selectedGuildId}/servers`);
      const servers = await res.json();
      const list = $('reward-servers-list');

      if (servers.length === 0) {
        list.innerHTML = '<p class="text-muted">Brak serwerów. Dodaj pierwszy serwer MC!</p>';
        return;
      }

      list.innerHTML = '';
      servers.forEach(srv => {
        const channelName = rewardChannelsCache.find(c => c.id === srv.channel_id);
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
          <span class="category-emoji">🖥️</span>
          <div class="category-info">
            <h4>${escapeHtml(srv.server_name)}</h4>
            <p>ID: <code>${escapeHtml(srv.server_id)}</code> • Kanał: #${channelName ? escapeHtml(channelName.name) : srv.channel_id}</p>
          </div>
          <div class="category-actions">
            <button class="action-btn action-btn-save action-btn-sm" data-edit="${srv.id}">✏️</button>
            <button class="action-btn action-btn-danger action-btn-sm" data-delete="${srv.id}">🗑️</button>
          </div>
        `;
        card.querySelector('[data-edit]').addEventListener('click', () => openEditRewardServer(srv));
        card.querySelector('[data-delete]').addEventListener('click', () => deleteRewardServer(srv.id, srv.server_name));
        list.appendChild(card);
      });
    } catch (e) { console.error('Error loading reward servers:', e); }
  }

  function populateRewardChannelSelect() {
    const select = $('rew-server-channel');
    select.innerHTML = '<option value="">-- Wybierz kanał --</option>';
    rewardChannelsCache.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = `#${ch.name} (${ch.category})`;
      select.appendChild(opt);
    });
  }

  function openAddRewardServer() {
    $('rew-modal-title').textContent = 'Dodaj serwer';
    $('rew-server-id').value = '';
    $('rew-server-id').disabled = false;
    $('rew-server-label').value = '';
    $('rew-edit-id').value = '';
    populateRewardChannelSelect();
    $('reward-server-modal').classList.remove('hidden');
  }

  function openEditRewardServer(srv) {
    $('rew-modal-title').textContent = 'Edytuj serwer';
    $('rew-server-id').value = srv.server_id;
    $('rew-server-id').disabled = true;
    $('rew-server-label').value = srv.server_name;
    $('rew-edit-id').value = srv.id;
    populateRewardChannelSelect();
    $('rew-server-channel').value = srv.channel_id;
    $('reward-server-modal').classList.remove('hidden');
  }

  function closeRewardServerModal() {
    $('reward-server-modal').classList.add('hidden');
  }

  async function saveRewardServer() {
    const server_id = $('rew-server-id').value.trim();
    const server_name = $('rew-server-label').value.trim();
    const channel_id = $('rew-server-channel').value;
    const editId = $('rew-edit-id').value;

    if (!server_id || !server_name || !channel_id) {
      return alert('Wypełnij wszystkie pola!');
    }

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/rewards/guild/${selectedGuildId}/servers/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_name, channel_id })
        });
      } else {
        res = await fetch(`/api/rewards/guild/${selectedGuildId}/servers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_id, server_name, channel_id })
        });
      }
      const data = await res.json();
      showSectionStatus('rew', data.message || data.error, data.success ? 'success' : 'error');
      closeRewardServerModal();
      await loadRewardServers();
    } catch (e) { showSectionStatus('rew', 'Błąd', 'error'); }
  }

  async function deleteRewardServer(id, name) {
    if (!confirm(`Usunąć serwer "${name}"? Nagrody dla tego serwera przestaną działać!`)) return;
    try {
      const res = await fetch(`/api/rewards/guild/${selectedGuildId}/servers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      showSectionStatus('rew', data.message || data.error, data.success ? 'success' : 'error');
      await loadRewardServers();
    } catch (e) { showSectionStatus('rew', 'Błąd usuwania', 'error'); }
  }

  // =============================
  // TIC-TAC-TOE
  // =============================
  async function loadTTTData() {
    const container = $('ttt-leaderboard');
    container.innerHTML = '<div class="loading-spinner small"><div class="spinner"></div></div>';

    try {
      const res = await fetch(`/api/guild/${selectedGuildId}/ttt-leaderboard`);
      const leaderboard = await res.json();

      if (leaderboard.length === 0) {
        container.innerHTML = '<p class="text-muted">Brak danych. Zagraj pierwszą grę komendą <code>/tictactoe bot</code> na Discordzie!</p>';
        return;
      }

      container.innerHTML = '';
      leaderboard.forEach((entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const total = entry.wins + entry.losses + entry.draws;
        const winRate = total > 0 ? Math.round((entry.wins / total) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.style.animation = `sectionIn 0.3s ease ${i * 0.05}s both`;
        item.innerHTML = `
          <div class="leaderboard-rank">${medal}</div>
          <div class="leaderboard-name">${escapeHtml(entry.username)}</div>
          <div class="leaderboard-stats">
            <span>${entry.wins}</span>W / ${entry.losses}L / ${entry.draws}D
            <br><small>${winRate}% win rate</small>
          </div>
        `;
        container.appendChild(item);
      });
    } catch (e) {
      container.innerHTML = '<p class="text-muted">Błąd ładowania rankingu.</p>';
    }
  }

  // =============================
  // UTILITIES
  // =============================
  function showSectionStatus(prefix, message, type) {
    const bar = $(`${prefix}-status-bar`);
    const msg = $(`${prefix}-status-message`);
    if (!bar || !msg) return;
    bar.className = `status-bar ${type}`;
    msg.textContent = message;
    bar.classList.remove('hidden');
    if (type !== 'info') setTimeout(() => hideSectionStatus(prefix), 5000);
  }

  function hideSectionStatus(prefix) {
    const bar = $(`${prefix}-status-bar`);
    if (bar) bar.classList.add('hidden');
  }

  function disableButtons(disabled) {
    document.querySelectorAll('.action-btn').forEach(btn => btn.disabled = disabled);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // =============================
  // EVENT LISTENERS
  // =============================
  document.addEventListener('DOMContentLoaded', () => {
    // Verification buttons
    $('save-config-button').addEventListener('click', saveVerificationConfig);
    $('create-roles-button').addEventListener('click', createRoles);
    $('setup-permissions-button').addEventListener('click', setupPermissions);
    $('send-verification-button').addEventListener('click', sendVerification);

    // Ticket buttons
    $('save-ticket-config-btn').addEventListener('click', saveTicketConfig);
    $('send-ticket-panel-btn').addEventListener('click', sendTicketPanel);

    // Announcement buttons
    $('send-announcement-btn').addEventListener('click', sendAnnouncement);

    // Reward server buttons
    $('add-reward-server-btn').addEventListener('click', openAddRewardServer);
    $('rew-modal-save-btn').addEventListener('click', saveRewardServer);
    $('rew-modal-cancel-btn').addEventListener('click', closeRewardServerModal);

    // Reward modal overlay close
    const rewModal = $('reward-server-modal');
    if (rewModal) {
      rewModal.addEventListener('click', (e) => {
        if (e.target === rewModal) closeRewardServerModal();
      });
    }

    init();
  });
})();
