const logger = require('../utils/logger');
const permissions = require('../utils/permissions');

module.exports = {
  name: 'help',
  description: 'Shows help information for the VMProtect bot',

  async execute(message, args) {
    logger.info(`User ${message.author.tag} requested help command`);

    const isStaff = permissions.hasStaffRole(message.member);

    let helpMessage = `
**VMProtect Custom Build Bot - Help**

This bot allows you to create custom protected builds using VMProtect.

**Commands:**
• \`!help\` - Shows this help message
• \`!status\` - Shows the bot's current status

**How to use:**
1. Upload a VMProtect configuration file (.vmp) or an executable file (.exe)
2. The bot will process and protect it with optimal settings
3. The protected file will be returned to you

**File Size Limitations:**
• Files must be under 8MB for direct Discord uploads
• Larger files are stored on the server (contact admin for access)
`;

    if (isStaff) {
      helpMessage += `
**Staff Commands:**
• \`!custombuild [URL]\` - Creates a protected build from a loader URL
  - Example: \`!custombuild https://example.com/loader.exe\`

• \`!largefile [list|info|clean] [fileId]\` - Manage large protected files
  - \`list\` - View all stored large files
  - \`info 1\` - View details of file #1
  - \`clean\` - Delete files older than 7 days
`;
    }

    await message.reply(helpMessage);
  }
};
