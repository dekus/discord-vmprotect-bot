const fs = require('fs-extra');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const permissions = require('../utils/permissions');
const vmprotectHandler = require('../utils/vmprotect-handler');
const webUploader = require('../utils/web-uploader');

const MAX_FILE_SIZE = 8;

module.exports = {
  name: 'custombuild',
  description: 'Generate a custom protected build from a loader URL',
  usage: '!custombuild [loader URL]',

  async execute(message, args) {
    if (!permissions.isServerWhitelisted(message.guild.id)) {
      logger.warn(`Server ${message.guild.name} (${message.guild.id}) attempted to use custombuild but is not whitelisted`);
      return message.reply('This server is not authorized to use this bot.');
    }

    if (!permissions.hasStaffRole(message.member)) {
      logger.warn(`User ${message.author.tag} (${message.author.id}) attempted to use custombuild but lacks Staff role`);
      return message.reply('You need the Staff role to use this command.');
    }

    if (!args || args.length === 0) {
      return message.reply(`Missing loader URL. Usage: \`${this.usage}\``);
    }

    const loaderUrl = args[0];

    if (!loaderUrl.startsWith('http://') && !loaderUrl.startsWith('https://')) {
      return message.reply('Please provide a valid URL starting with http:// or https://');
    }

    try {
      const processingMsg = await message.reply('⏳ Processing custom build request. Downloading loader...');
      const TEMP_DIR = path.join(__dirname, '../../temp');
      const OUTPUT_DIR = path.join(__dirname, '../../output');
      fs.ensureDirSync(TEMP_DIR);
      fs.ensureDirSync(OUTPUT_DIR);

      const timestamp = Date.now();
      const uniqueFilename = `loader_${message.author.id}_${timestamp}`;
      const loaderPath = path.join(TEMP_DIR, `${uniqueFilename}.exe`);
      const outputPath = path.join(OUTPUT_DIR, `${uniqueFilename}_protected.exe`);

      try {
        const response = await fetch(loaderUrl, { timeout: 30000 });
        if (!response.ok) throw new Error(`Failed to download loader: ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) throw new Error('Downloaded file is empty');
        fs.writeFileSync(loaderPath, Buffer.from(buffer));
        logger.info(`Downloaded loader to ${loaderPath} (${buffer.byteLength} bytes)`);
        await processingMsg.edit('⚙️ Loader downloaded. Applying protection...');
      } catch (error) {
        logger.error(`Download error: ${error.message}`, error);
        await processingMsg.edit(`❌ Error downloading the file: ${error.message}`);
        throw error;
      }

      try {
        const progressCallback = async (progressMessage) => {
          try {
            await processingMsg.edit(`⚙️ ${progressMessage}`);
          } catch (err) {
            logger.error(`Error updating progress message: ${err.message}`);
          }
        };

        await vmprotectHandler.processWithVMProtect(
          loaderPath,
          outputPath,
          false,
          { author: message.author.tag },
          progressCallback
        );

        if (fs.existsSync(outputPath)) {
          const fileStats = fs.statSync(outputPath);
          const fileSizeInMB = fileStats.size / (1024 * 1024);

          if (fileSizeInMB > MAX_FILE_SIZE) {
            logger.info(`File too large for Discord upload: ${fileSizeInMB.toFixed(2)}MB (limit: ${MAX_FILE_SIZE}MB), using web uploader`);
            await processingMsg.edit(`⚙️ The protected file is too large for Discord. Preparing secure download link...`);

            try {
              const uploadResult = await webUploader.uploadToWebServer(outputPath);
              const fileExtension = path.extname(uploadResult.fileName).toLowerCase();

              const embed = new EmbedBuilder()
                .setTitle(`Protected ${fileExtension} Ready for Download`)
                .setColor('#4CAF50')
                .setDescription(`Your protected file is ready for secure download. Click the link below to download it directly.`)
                .addFields(
                  { name: 'File Size', value: `${fileSizeInMB.toFixed(2)} MB`, inline: true },
                  { name: 'File Type', value: fileExtension.replace('.', '').toUpperCase(), inline: true },
                  { name: 'Generated For', value: message.author.tag, inline: true },
                  { name: 'Download Link', value: `[Click to download ${fileExtension}](${uploadResult.downloadUrl})` }
                )
                .setFooter({ text: 'This is a secure one-time download link - it will self-destruct after use' })
                .setTimestamp();

              await message.reply({ embeds: [embed] });
              await processingMsg.edit('✅ Protection completed successfully! Secure download link has been provided.');

              setTimeout(async () => {
                try {
                  await webUploader.deleteUploadedFile(uploadResult.directoryPath);
                  logger.info(`Fallback deletion for web upload: ${uploadResult.fileName}`);
                } catch (err) {
                  logger.error(`Failed to delete web upload: ${err.message}`);
                }
              }, 30 * 60 * 1000);

              logger.info(`Created secure one-time download link for: ${outputPath} for user: ${message.author.tag}`);
            } catch (error) {
              logger.error(`Web upload failed: ${error.message}`, error);
              await processingMsg.edit(`❌ Failed to create download link: ${error.message}`);
              throw error;
            }
          } else {
            const attachment = new AttachmentBuilder(outputPath, { name: path.basename(outputPath) });
            const DEV_MODE = process.env.NODE_ENV === 'development';
            const contentPrefix = DEV_MODE ? '[DEV MODE] ' : '';
            await message.reply({
              content: `✅ ${contentPrefix}Custom build completed! Here is your protected loader (${fileStats.size.toLocaleString()} bytes):`,
              files: [attachment]
            });
            await processingMsg.edit('✅ Protection completed successfully!');
            logger.info(`Sent protected file: ${outputPath} to user: ${message.author.tag}`);
          }
        } else {
          throw new Error(`Output file not found at: ${outputPath}`);
        }
      } catch (error) {
        logger.error(`VMProtect process failed: ${error.message}`);
        await processingMsg.edit(`❌ Build process failed: ${error.message}. Please contact the bot administrator.`);
      } finally {
        try {
          if (fs.existsSync(loaderPath)) {
            fs.unlinkSync(loaderPath);
          }
          logger.info(`Cleaned up temp files for ${uniqueFilename}`);
        } catch (err) {
          logger.error(`Error cleaning up temp files for ${uniqueFilename}`, err);
        }
      }
    } catch (error) {
      logger.error('Error in custombuild command', error);
      await message.reply(`❌ Error processing your request: ${error.message}`);
    }
  }
};
