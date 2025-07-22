const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const commands = new Map();

const commandFiles = fs.readdirSync(path.join(__dirname, '../commands'))
  .filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, '../commands', file));
  commands.set(command.name, command);
  logger.info(`Loaded command: ${command.name}`);
}

/**
 * @param {Object} message 
 * @returns {boolean} 
 */
function handleCommand(message) {
  const prefix = '!';
  if (!message.content.startsWith(prefix)) return false;
  
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  if (!commands.has(commandName)) return false;
  
  try {
    const command = commands.get(commandName);
    logger.info(`Executing command: ${commandName}, by: ${message.author.tag}`);
    command.execute(message, args);
    return true;
  } catch (error) {
    logger.error(`Error executing command: ${commandName}`, error);
    message.reply('There was an error executing that command!');
    return true;
  }
}

module.exports = {
  handleCommand,
  commands
}; 