const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');

const VMPROTECT_TIMEOUT = 180000; 

/**
 * @param {string} inputPath 
 * @param {string} outputPath 
 * @param {string} configPath 
 * @param {Object} metadata 
 */
const createStandardConfig = (inputPath, outputPath, configPath, metadata = {}) => {
  const vmpConfig = `<?xml version="1.0" encoding="UTF-8" ?>
<Document>
    <Protection InputFileName="${inputPath}" OutputFileName="${outputPath}" />
    <Options>
        <Option Name="VMProtectVersion">Default</Option>
        <Option Name="Instances">Default</Option>
        <Option Name="Complexity">20%</Option>
        
        <!-- Memory Protection -->
        <Option Name="MemoryProtection">No</Option>
        <Option Name="ImportProtection">No</Option>
        <Option Name="ResourceProtection">Yes</Option>
        <Option Name="PackOutputFile">Yes</Option>
        
        <!-- Detection Protection -->
        <Option Name="Debugger">No</Option>
        <Option Name="VirtualizationTools">No</Option>
        
        <!-- Additional Options -->
        <Option Name="StripDebugInformation">Yes</Option>
        <Option Name="StripRelocations">No</Option>
        <Option Name="ShadowStackCompatible">No</Option>
        
        <!-- Error Messages -->
        <Option Name="DebuggerFoundMessage">A debugger has been found running in your system.
Please, unload it from memory and restart your program.</Option>
        <Option Name="VirtualizationToolsFoundMessage">Sorry, this application cannot run under a Virtual Machine.</Option>
        <Option Name="FileCorruptedMessage">File corrupted! This program has been manipulated and maybe 
it's infected by a Virus or cracked. This file won't work anymore.</Option>
        <Option Name="SerialNumberRequiredMessage">This code requires valid serial number to run.
Program will be terminated.</Option>
        <Option Name="HWIDMismatchedMessage">This application cannot be executed on this computer.</Option>
    </Options>
</Document>`;

  fs.writeFileSync(configPath, vmpConfig);
  logger.info(`Created standard VMProtect config at ${configPath}`);
};

/**
 * @param {string} filePath 
 * @returns {boolean} 
 */
const validateInputFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file does not exist: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error(`Input file is empty: ${filePath}`);
  }
  
  if (filePath.toLowerCase().endsWith('.exe')) {
    const fileHeader = fs.readFileSync(filePath, { length: 2 });
    if (fileHeader[0] !== 0x4D || fileHeader[1] !== 0x5A) {
      throw new Error('The file does not appear to be a valid Windows executable');
    }
  }
  
  return true;
};

/**
 * @param {string} inputFilePath 
 * @param {string} outputFilePath 
 * @param {boolean} useExistingConfig 
 * @param {Object} metadata 
 * @param {function} progressCallback 
 * @returns {Promise<boolean>} 
 */
const processWithVMProtect = (inputFilePath, outputFilePath, useExistingConfig = false, metadata = {}, progressCallback = null) => {
  return new Promise((resolve, reject) => {
    const DEV_MODE = process.env.NODE_ENV === 'development';
    
    try {
      validateInputFile(inputFilePath);
    } catch (error) {
      return reject(error);
    }
    
    if (DEV_MODE) {
      const vmprotectSimulator = require('./vmprotect-simulator');
      
      if (progressCallback) progressCallback('Starting VMProtect simulator...');
      
      vmprotectSimulator.simulateProtection(inputFilePath, outputFilePath)
        .then(() => {
          logger.info('VMProtect simulation completed successfully');
          
          if (progressCallback) progressCallback('VMProtect protection completed successfully');
          
          resolve(true);
        })
        .catch((error) => {
          logger.error('VMProtect simulation failed', error);
          
          if (progressCallback) progressCallback(`VMProtect protection failed: ${error.message}`);
          
          reject(error);
        });
    } else {
      if (progressCallback) progressCallback('Starting VMProtect protection process...');
      
      if (!fs.existsSync(process.env.VMPROTECT_PATH)) {
        const error = new Error(`VMProtect executable not found at: ${process.env.VMPROTECT_PATH}`);
        logger.error(error.message);
        if (progressCallback) progressCallback(`Error: ${error.message}`);
        return reject(error);
      }
      
      logger.info(`Processing file with VMProtect: ${inputFilePath} -> ${outputFilePath}`);
      
      let args = [];
      
      if (useExistingConfig) {
        args = [inputFilePath];
      } else {
        
        const configPath = path.join(
          path.dirname(inputFilePath),
          `${path.basename(inputFilePath, path.extname(inputFilePath))}.vmp`
        );
        
        createStandardConfig(inputFilePath, outputFilePath, configPath, metadata);
        
        args = [configPath];
      }
      
      logger.info(`Executing VMProtect with args: ${args.join(' ')}`);
      
      const vmprotect = spawn(process.env.VMPROTECT_PATH, args);
      
      let outputData = '';
      let errorOutput = '';
      let processClosed = false;
      
      const timeoutId = setTimeout(() => {
        if (!processClosed) {
          logger.error(`VMProtect process timed out after ${VMPROTECT_TIMEOUT / 1000} seconds`);
          if (progressCallback) progressCallback('VMProtect process timed out');
          
          try {
            vmprotect.kill('SIGTERM');
          } catch (err) {
            logger.error('Error killing VMProtect process', err);
          }
          
          reject(new Error('VMProtect process timed out'));
        }
      }, VMPROTECT_TIMEOUT);
      
      vmprotect.stdout.on('data', (data) => {
        const dataStr = data.toString();
        outputData += dataStr;
        logger.info(`VMProtect output: ${dataStr}`);
        
        if (dataStr.includes('Analyzing') && progressCallback) {
          progressCallback('Analyzing file...');
        } else if (dataStr.includes('Protecting') && progressCallback) {
          progressCallback('Applying protection...');
        } else if (dataStr.includes('Compiling') && progressCallback) {
          progressCallback('Compiling protected code...');
        } else if (progressCallback) {
          progressCallback('Processing...');
        }
      });
      
      vmprotect.stderr.on('data', (data) => {
        const dataStr = data.toString();
        errorOutput += dataStr;
        logger.error(`VMProtect error: ${dataStr}`);
        if (progressCallback) progressCallback(`VMProtect error: ${dataStr}`);
      });
      
      vmprotect.on('error', (error) => {
        logger.error(`Failed to start VMProtect process: ${error.message}`);
        if (progressCallback) progressCallback(`Failed to start VMProtect process: ${error.message}`);
        clearTimeout(timeoutId);
        
        reject(error);
      });
      
      vmprotect.on('close', (code) => {
        processClosed = true;
        clearTimeout(timeoutId);
        
        if (code === 0) {
          logger.info('VMProtect process completed successfully');
          if (progressCallback) progressCallback('VMProtect protection completed successfully');
          
          if (fs.existsSync(outputFilePath)) {
            resolve(true);
          } else {
            const errMsg = 'VMProtect process completed but output file not found';
            logger.error(errMsg);
            if (progressCallback) progressCallback(errMsg);
            reject(new Error(errMsg));
          }
        } else {
          const errorMsg = errorOutput || `VMProtect exited with code ${code}`;
          logger.error(errorMsg);
          if (progressCallback) progressCallback(`VMProtect failed: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      });
    }
  });
};

module.exports = {
  processWithVMProtect,
  createStandardConfig
}; 