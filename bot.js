// NarisMC Core Bot — Main Entry Point
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

const commands = [];
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// === REWARDS: Listen for messages on reward channels ===
const { loadRewardChannels, handleRewardMessage } = require('./modules/rewards/handler');

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  try {
    await handleRewardMessage(message);
  } catch (e) {
    // silently fail
  }
});

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Rejestrowanie komend slash...');
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Komendy slash zarejestrowane!');
  } catch (error) {
    console.error('❌ Błąd rejestracji komend:', error);
  }
}

// Start web server
const startWebServer = require('./web/server');

// Login and start
client.login(process.env.DISCORD_TOKEN)
  .then(async () => {
    registerCommands();
    startWebServer(client);

    // Load reward channels from MySQL
    if (process.env.MYSQL_HOST) {
      await loadRewardChannels();
    }
  })
  .catch(err => {
    console.error('❌ Nie można zalogować bota:', err.message);
    console.error('Sprawdź czy DISCORD_TOKEN w pliku .env jest poprawny!');
    process.exit(1);
  });

module.exports = client;
