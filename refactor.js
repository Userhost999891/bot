const fs = require('fs');
const path = require('path');

const dbFunctions = [
  'getConfig', 'setConfig', 'getAllConfigs',
  'saveUserRoles', 'getSavedRoles', 'deleteSavedRoles',
  'getTicketConfig', 'setTicketConfig', 'getNextTicketNumber',
  'getTicketCategories', 'addTicketCategory', 'updateTicketCategory', 'deleteTicketCategory',
  'createActiveTicket', 'getActiveTicket', 'countActiveTickets', 'countUserActiveTickets', 'getLastUserTicketTime', 'claimTicket', 'deleteActiveTicket',
  'getAnnouncementsConfig', 'setAnnouncementsConfig',
  'getTTTStats', 'updateTTTStats', 'getTTTLeaderboard'
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  for (const func of dbFunctions) {
    const regex = new RegExp(`(?<!await\\s+)${func}\\s*\\(`, 'g');
    content = content.replace(regex, `await ${func}(`);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Updated: ' + filePath);
  }
}

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'plugin') {
        processDir(fullPath);
      }
    } else if (fullPath.endsWith('.js') && !fullPath.includes('database') && !fullPath.includes('refactor.js')) {
      processFile(fullPath);
    }
  }
}

processDir(__dirname);
console.log('Done');
