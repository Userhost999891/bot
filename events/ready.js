// Ready event
const { toSmallCaps } = require('../utils/smallcaps');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
    console.log(`📡 Obsługuję ${client.guilds.cache.size} serwerów`);
    console.log(`🌐 Panel webowy: http://localhost:${process.env.PORT || 4000}`);
    client.user.setActivity('NarisMC Core', { type: 3 }); // WATCHING
  }
};
