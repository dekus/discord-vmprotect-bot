const fs = require('fs-extra');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const logger = require('../utils/logger');
const permissions = require('../utils/permissions');

module.exports = {
  name: 'largefile',
  description: 'Lists and manages files that were too large to upload to Discord',
  usage: '!largefile [list|info|clean] [fileId]',

  async execute(message, args) {
    if (!permissions.isServerWhitelisted(message.guild.id)) {
      logger.warn(`Server ${message.guild.name} (${message.guild.id}) attempted to use largefile but is not whitelisted`);
      return message.reply('This server is not authorized to use this bot.');
    }

    if (!permissions.hasStaffRole(message.member)) {
      logger.warn(`User ${message.author.tag} (${message.author.id}) attempted to use largefile but lacks Staff role`);
      return message.reply('You need the Staff role to use this command.');
    }

    const action = args[0]?.toLowerCase() || 'list';
    const fileId = args[1];
    const OUTPUT_DIR = path.join(__dirname, '../../output');

    try {
      switch (action) {
        case 'list':
          await listLargeFiles(message, OUTPUT_DIR);
          break;
        case 'info':
          if (!fileId) return message.reply(`Missing file ID. Usage: \`${this.usage}\``);
          await getFileInfo(message, OUTPUT_DIR, fileId);
          break;
        case 'clean':
          await cleanOldFiles(message, OUTPUT_DIR);
          break;
        default:
          await message.reply(`Unknown action. Usage: \`${this.usage}\``);
      }
    } catch (error) {
      logger.error(`Error in largefile command: ${error.message}`, error);
      await message.reply(`❌ Error processing your request: ${error.message}`);
    }
  }
};

async function listLargeFiles(message, outputDir) {
  const files = await fs.readdir(outputDir);
  const largeFiles = files.filter(file =>
    file.endsWith('_info.txt') &&
    fs.existsSync(path.join(outputDir, file.replace('_info.txt', '')))
  );

  if (largeFiles.length === 0) return message.reply('No large files found in the output directory.');

  const fileDetails = [];

  for (const infoFile of largeFiles) {
    const actualFile = infoFile.replace('_info.txt', '');
    const filePath = path.join(outputDir, actualFile);

    try {
      const stats = fs.statSync(filePath);
      const created = new Date(stats.birthtime).toISOString().split('T')[0];
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      let userName = 'Unknown';

      try {
        const infoContent = fs.readFileSync(path.join(outputDir, infoFile), 'utf8');
        const userMatch = infoContent.match(/Generated for: (.+?) \(/);
        if (userMatch) userName = userMatch[1];
      } catch {}

      fileDetails.push({
        id: actualFile,
        name: actualFile,
        size: sizeMB,
        created,
        user: userName
      });
    } catch {}
  }

  fileDetails.sort((a, b) => new Date(b.created) - new Date(a.created));

  let content = '**Large Files Available on Server**\n\n';
  content += 'ID | Size | Created | User\n';
  content += '----|------|---------|------\n';

  fileDetails.forEach((file, index) => {
    content += `${index + 1} | ${file.size} MB | ${file.created} | ${file.user}\n`;
  });

  content += '\nUse `!largefile info [ID]` to get more details about a specific file.';

  await message.reply(content);
}

async function getFileInfo(message, outputDir, fileId) {
  let fileName;

  if (/^\d+$/.test(fileId)) {
    const files = await fs.readdir(outputDir);
    const largeFiles = files.filter(file =>
      file.endsWith('_info.txt') &&
      fs.existsSync(path.join(outputDir, file.replace('_info.txt', '')))
    );

    const index = parseInt(fileId) - 1;
    if (index < 0 || index >= largeFiles.length) {
      return message.reply(`Invalid file ID. Use \`!largefile list\` to see available files.`);
    }

    fileName = largeFiles[index].replace('_info.txt', '');
  } else {
    fileName = fileId;
  }

  const filePath = path.join(outputDir, fileName);
  const infoPath = path.join(outputDir, `${fileName}_info.txt`);

  if (!fs.existsSync(filePath)) return message.reply(`File not found: ${fileName}`);

  const stats = fs.statSync(filePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const created = new Date(stats.birthtime).toISOString();

  let infoContent = '';
  if (fs.existsSync(infoPath)) {
    infoContent = fs.readFileSync(infoPath, 'utf8');
  }

  let content = `**Large File Details: ${fileName}**\n\n`;
  content += `Path: ${filePath}\n`;
  content += `Size: ${sizeMB} MB\n`;
  content += `Created: ${created}\n\n`;

  if (infoContent) {
    content += `**Original Info File:**\n\`\`\`\n${infoContent}\n\`\`\`\n`;
  }

  content += `To share this file, you'll need to manually retrieve it from the server at the path shown above.`;

  await message.reply(content);
}

async function cleanOldFiles(message, outputDir) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  const files = await fs.readdir(outputDir);
  let removedCount = 0;

  for (const file of files) {
    const filePath = path.join(outputDir, file);

    try {
      const stats = fs.statSync(filePath);
      if (stats.birthtime < sevenDaysAgo) {
        await fs.unlink(filePath);
        removedCount++;
      }
    } catch {}
  }

  await message.reply(`Cleaned up ${removedCount} files older than 7 days from the output directory.`);
}
