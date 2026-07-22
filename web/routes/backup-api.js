// Backup API — tworzenie, pobieranie, wgrywanie i przywracanie backupów serwera
const express = require('express');
const {
  createBackupRecord, getBackups, getBackup, deleteBackup, countBackups
} = require('../../database/db');
const { createBackup, restoreBackup, validateBackup } = require('../../modules/backup/handler');
const { authMiddleware, adminParamMiddleware } = require('./middleware');

const MAX_BACKUPS_PER_GUILD = 25;

module.exports = function(discordClient) {
  const router = express.Router();

  // Wszystkie endpointy per-serwer wymagają admina tego serwera
  router.use('/guild/:id', authMiddleware, adminParamMiddleware);

  // Lista backupów
  router.get('/guild/:id/backups', async (req, res) => {
    try {
      const backups = await getBackups(req.params.id);
      res.json(backups);
    } catch (e) {
      console.error('Error listing backups:', e);
      res.status(500).json({ error: 'Błąd bazy: ' + e.message });
    }
  });

  // Utwórz nowy backup (snapshot aktualnego stanu serwera)
  router.post('/guild/:id/backups', async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Bot nie jest na tym serwerze' });

    try {
      const existing = await countBackups(req.params.id);
      if (existing >= MAX_BACKUPS_PER_GUILD) {
        return res.status(400).json({ error: `Limit backupów (${MAX_BACKUPS_PER_GUILD}) osiągnięty. Usuń stare, aby utworzyć nowy.` });
      }

      const rawName = (req.body?.name || '').toString().trim();
      const name = (rawName || `Backup ${new Date().toLocaleString('pl-PL')}`).slice(0, 120);

      const data = await createBackup(guild);
      const memberCount = Array.isArray(data.members) ? data.members.length : 0;
      const id = await createBackupRecord(req.params.id, name, data, {
        createdBy: req.session.user?.id,
        createdByTag: req.session.user?.username,
        roleCount: data.roles.length,
        channelCount: data.channels.length,
        memberCount
      });

      res.json({
        success: true,
        message: `Backup utworzony! Zapisano ${data.roles.length} ról, ${data.channels.length} kanałów i role ${memberCount} członków.`,
        id
      });
    } catch (e) {
      console.error('Error creating backup:', e);
      res.status(500).json({ error: 'Nie udało się utworzyć backupu: ' + e.message });
    }
  });

  // Pobierz backup jako plik JSON
  router.get('/guild/:id/backups/:backupId/download', async (req, res) => {
    try {
      const backup = await getBackup(req.params.id, req.params.backupId);
      if (!backup) return res.status(404).json({ error: 'Backup nie istnieje' });

      const safeName = String(backup.name).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'backup';
      const filename = `narismc-backup-${safeName}-${backup.id}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify({ __narismc_backup: true, name: backup.name, ...backup.data }, null, 2));
    } catch (e) {
      console.error('Error downloading backup:', e);
      res.status(500).json({ error: 'Błąd pobierania: ' + e.message });
    }
  });

  // Wgraj backup z pliku (zapisz go w bazie — bez przywracania)
  router.post('/guild/:id/backups/upload', async (req, res) => {
    try {
      const payload = req.body?.data;
      if (!payload) return res.status(400).json({ error: 'Brak danych backupu' });

      const err = validateBackup(payload);
      if (err) return res.status(400).json({ error: err });

      const existing = await countBackups(req.params.id);
      if (existing >= MAX_BACKUPS_PER_GUILD) {
        return res.status(400).json({ error: `Limit backupów (${MAX_BACKUPS_PER_GUILD}) osiągnięty. Usuń stare, aby wgrać nowy.` });
      }

      const name = ((req.body?.name || payload.name || 'Wgrany backup').toString().trim() || 'Wgrany backup').slice(0, 120);
      const id = await createBackupRecord(req.params.id, name, payload, {
        createdBy: req.session.user?.id,
        createdByTag: req.session.user?.username,
        roleCount: payload.roles.length,
        channelCount: payload.channels.length,
        memberCount: Array.isArray(payload.members) ? payload.members.length : 0
      });

      res.json({ success: true, message: `Backup "${name}" wgrany do panelu!`, id });
    } catch (e) {
      console.error('Error uploading backup:', e);
      res.status(500).json({ error: 'Błąd wgrywania: ' + e.message });
    }
  });

  // Przywróć zapisany backup na serwer
  router.post('/guild/:id/backups/:backupId/restore', async (req, res) => {
    const guild = discordClient.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Bot nie jest na tym serwerze' });

    try {
      const backup = await getBackup(req.params.id, req.params.backupId);
      if (!backup || !backup.data) return res.status(404).json({ error: 'Backup nie istnieje lub jest uszkodzony' });

      const summary = await restoreBackup(guild, backup.data, { deleteExtra: !!req.body?.deleteExtra });
      res.json({ success: true, message: buildRestoreMessage(summary), summary });
    } catch (e) {
      console.error('Error restoring backup:', e);
      res.status(500).json({ error: 'Błąd przywracania: ' + e.message });
    }
  });

  // Usuń backup
  router.delete('/guild/:id/backups/:backupId', async (req, res) => {
    try {
      const ok = await deleteBackup(req.params.id, req.params.backupId);
      if (!ok) return res.status(404).json({ error: 'Backup nie istnieje' });
      res.json({ success: true, message: 'Backup usunięty.' });
    } catch (e) {
      console.error('Error deleting backup:', e);
      res.status(500).json({ error: 'Błąd usuwania: ' + e.message });
    }
  });

  return router;
};

function buildRestoreMessage(s) {
  const parts = [];
  parts.push(`Role: +${s.rolesCreated} nowych, ${s.rolesUpdated} zaktualizowanych`);
  parts.push(`Kanały: +${s.channelsCreated} nowych, ${s.channelsUpdated} zaktualizowanych`);
  if (s.membersUpdated || s.membersSkipped) parts.push(`Członkowie: ${s.membersUpdated} z przywróconymi rolami`);
  if (s.deleted) parts.push(`usunięto ${s.deleted} nadmiarowych`);
  if (s.errors.length) parts.push(`${s.errors.length} błędów`);
  return `Przywracanie zakończone. ${parts.join(' • ')}.`;
}
