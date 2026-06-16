// GuildMemberAdd event — assigns unverified role to new members + welcome message
const { getConfig } = require('../database/db');
const { sendWelcomeMessage } = require('../modules/lobby/lobby');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // Wiadomość powitalna (lobby)
    try {
      await sendWelcomeMessage(member);
    } catch (err) {
      console.error(`[Lobby] Błąd wysyłania wiadomości powitalnej dla ${member.user.tag}:`, err);
    }

    const config = await getConfig(member.guild.id);
    if (!config) return;

    const unverifiedRole = member.guild.roles.cache.find(r => r.name === config.unverified_role_name);
    if (unverifiedRole) {
      setTimeout(async () => {
        try {
          const freshMember = await member.guild.members.fetch(member.user.id);

          // Remove other roles to prevent bypassing verification
          const rolesToRemove = freshMember.roles.cache.filter(r => r.name !== '@everyone' && r.name !== config.unverified_role_name);

          for (const [id, role] of rolesToRemove) {
            await freshMember.roles.remove(role, 'Automatyczne usunięcie ról przed weryfikacją');
          }

          await freshMember.roles.add(unverifiedRole, 'Nowy użytkownik - oczekuje na weryfikację');
        } catch (error) {
          console.error(`Nie można ustawić ról dla ${member.user.tag}:`, error);
        }
      }, 2000);
    }
  }
};
