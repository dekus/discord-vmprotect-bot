const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

module.exports = {
  name: 'status',
  description: 'Shows the current status of the bot',

  async execute(message, args) {
    logger.info(`User ${message.author.tag} requested status command`);

    try {
      const vmprotectExists = fs.existsSync(process.env.VMPROTECT_PATH);
      const outputDir = path.join(__dirname, '../../output');
      const tempDir = path.join(__dirname, '../../temp');

      let outputFileCount = 0;
      if (fs.existsSync(outputDir)) {
        outputFileCount = fs.readdirSync(outputDir).length;
      }

      const uptime = Math.floor(process.uptime());
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;
      const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

      const statusMessage = `
**VMProtect Bot Status**

• **Bot Uptime:** ${uptimeString}
• **System:** ${os.platform()} ${os.release()}
• **VMProtect Available:** ${vmprotectExists ? '✅' : '❌'}
• **Protected Files Created:** ${outputFileCount}
• **Channel ID:** ${process.env.BUILD_CHANNEL_ID || 'Not set'}

The bot is ${vmprotectExists ? 'ready' : 'not ready'} to process files.
`;

      await message.reply(statusMessage);
    } catch (error) {
      logger.error('Error generating status', error);
      await message.reply('Error retrieving bot status. Please check logs.');
    }
  }
};
