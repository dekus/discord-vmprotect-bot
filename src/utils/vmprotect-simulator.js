
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

/**
 * @param {string} configFilePath 
 * @param {string} outputFilePath 
 * @returns {Promise<boolean>} 
 */
async function simulateProtection(configFilePath, outputFilePath) {
  return new Promise((resolve, reject) => {
    logger.info('Starting VMProtect simulation...');
    
    if (!fs.existsSync(configFilePath)) {
      return reject(new Error(`Config file not found: ${configFilePath}`));
    }
    
    fs.ensureDirSync(path.dirname(outputFilePath));
    
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    logger.info(`Simulating protection with config file (${configContent.length} bytes)`);
    
    setTimeout(() => {
      try {
        fs.copyFileSync(configFilePath, outputFilePath);
        
        fs.appendFileSync(outputFilePath, '\n[THIS IS A SIMULATED PROTECTED FILE]');
        
        logger.info(`Created simulated protected file: ${outputFilePath}`);
        resolve(true);
      } catch (err) {
        logger.error('Error in VMProtect simulation', err);
        reject(err);
      }
    }, 3000); 
  });
}

module.exports = {
  simulateProtection
}; 