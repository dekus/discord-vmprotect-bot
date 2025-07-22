const { Client, GatewayIntentBits, Partials, Events, AttachmentBuilder } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const logger = require('./utils/logger');
const commandHandler = require('./utils/commandHandler');
const vmprotectHandler = require('./utils/vmprotect-handler');

dotenv.config({ path: './config.env' });

const TEMP_DIR = path.join(__dirname, '../temp');
const OUTPUT_DIR = path.join(__dirname, '../output');

fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(OUTPUT_DIR);

const DEV_MODE = process.env.NODE_ENV === 'development';
if (DEV_MODE) {
  logger.info('Running in DEVELOPMENT mode (using VMProtect simulator)');
} else {
  logger.info('Running in PRODUCTION mode (using real VMProtect)');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, () => {
  logger.info(`Logged in as ${client.user.tag}`);
  logger.info('Bot is ready to receive files for custom builds!');
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  if (process.env.BUILD_CHANNEL_ID && message.channelId !== process.env.BUILD_CHANNEL_ID) return;
  
  if (commandHandler.handleCommand(message)) return;

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    
    if (attachment.name.endsWith('.vmp') || attachment.name.endsWith('.exe')) {
      logger.info(`Received file: ${attachment.name} from user: ${message.author.tag}`);
      const processingMsg = await message.reply('⏳ Received your file. Processing the custom build...');
      
      try {
        const tempFilePath = path.join(TEMP_DIR, attachment.name);
        try {
          const response = await fetch(attachment.url, {
            timeout: 30000 
          });
          
          if (!response.ok) {
            throw new Error(`Failed to download file: ${response.statusText}`);
          }
          
          const buffer = await response.arrayBuffer();
          
          if (buffer.byteLength === 0) {
            throw new Error('Downloaded file is empty');
          }
          
          fs.writeFileSync(tempFilePath, Buffer.from(buffer));
          logger.info(`Downloaded file to: ${tempFilePath} (${buffer.byteLength} bytes)`);
          
          await processingMsg.edit(`⚙️ File downloaded (${buffer.byteLength} bytes). Preparing protection...`);
        } catch (error) {
          logger.error(`Download error: ${error.message}`, error);
          await processingMsg.edit(`❌ Error downloading the file: ${error.message}`);
          throw error;
        }
        
        const isVmpConfig = attachment.name.endsWith('.vmp');
        
        const outputFileName = isVmpConfig
          ? `${path.basename(tempFilePath, '.vmp')}_protected.exe`
          : `${path.basename(tempFilePath, path.extname(tempFilePath))}_protected${path.extname(tempFilePath)}`;
        
        const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
        
        try {
          const progressCallback = async (progressMessage) => {
            try {
              await processingMsg.edit(`⚙️ ${progressMessage}`);
            } catch (err) {
              logger.error(`Error updating progress message: ${err.message}`);
            }
          };
          
          await processFileWithVMProtect(tempFilePath, outputFilePath, isVmpConfig, message, processingMsg, progressCallback);
        } catch (error) {
          logger.error('Error processing file', error);
          await processingMsg.edit(`❌ Error processing your file: ${error.message}. Please check with the bot administrator.`);
        }
      } catch (error) {
        logger.error('Error processing file', error);
      }
    }
  }
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error', error);
});

async function processFileWithVMProtect(filePath, outputPath, isVmpConfig, message, processingMsg, progressCallback) {
  try {
    await vmprotectHandler.processWithVMProtect(
      filePath, 
      outputPath, 
      isVmpConfig, 
      { author: message.author.tag },
      progressCallback
    );
    
    if (fs.existsSync(outputPath)) {
      const fileStats = fs.statSync(outputPath);
      
      const fileSizeInMB = fileStats.size / (1024 * 1024);
      const MAX_FILE_SIZE = 8; 
      
      if (fileSizeInMB > MAX_FILE_SIZE) {
        logger.error(`File too large for Discord upload: ${fileSizeInMB.toFixed(2)}MB (limit: ${MAX_FILE_SIZE}MB)`);
        await processingMsg.edit(`⚠️ The protected file (${fileSizeInMB.toFixed(2)}MB) is too large to upload to Discord (limit: ${MAX_FILE_SIZE}MB). Please contact the bot administrator to get the file.`);
        
        const infoFilePath = path.join(OUTPUT_DIR, `${path.basename(outputPath)}_info.txt`);
        const infoContent = `
File was too large to upload to Discord
-------------------------------------
Original filename: ${path.basename(filePath)}
Protected filename: ${path.basename(outputPath)}
File size: ${fileSizeInMB.toFixed(2)}MB
Location on server: ${outputPath}
Generated for: ${message.author.tag} (${message.author.id})
Date: ${new Date().toISOString()}
        `;
        
        fs.writeFileSync(infoFilePath, infoContent);
        
        const infoAttachment = new AttachmentBuilder(infoFilePath, { name: 'file_too_large_info.txt' });
        await message.reply({
          content: `⚠️ The protected file (${fileSizeInMB.toFixed(2)}MB) is too large to upload to Discord (limit: ${MAX_FILE_SIZE}MB). A server administrator will need to provide the file to you manually.`,
          files: [infoAttachment]
        });
        
        return;
      }
      
      const attachment = new AttachmentBuilder(outputPath, { name: path.basename(outputPath) });
      
      const DEV_MODE = process.env.NODE_ENV === 'development';
      const contentPrefix = DEV_MODE ? '[DEV MODE] ' : '';
      
      await message.reply({ 
        content: `✅ ${contentPrefix}Custom build completed successfully! Here is your protected file (${fileStats.size.toLocaleString()} bytes):`,
        files: [attachment]
      });
      
      await processingMsg.edit('✅ Protection completed successfully!');
      
      logger.info(`Sent protected file: ${outputPath} to user: ${message.author.tag}`);
    } else {
      throw new Error(`Output file not found at: ${outputPath}`);
    }
  } catch (error) {
    logger.error('VMProtect process failed', error);
    await processingMsg.edit(`❌ Build process failed: ${error.message}. Please check with the bot administrator.`);
    throw error;
  } finally {
    if (!isVmpConfig) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`Cleaned up temp file: ${filePath}`);
        }
      } catch (err) {
        logger.error('Error cleaning up temp file', err);
      }
    }
  }
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  logger.error('Failed to login to Discord', error);
}); 