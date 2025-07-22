const fs = require('fs-extra');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
fs.ensureDirSync(logDir);

const getLogFileName = () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return path.join(logDir, `${dateStr}.log`);
};

const LogLevel = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

const writeLog = (level, message) => {
  const now = new Date();
  const timeStr = now.toISOString();
  const logEntry = `[${timeStr}] [${level}] ${message}\n`;
  
  console.log(logEntry);
  
  try {
    fs.appendFileSync(getLogFileName(), logEntry);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
};

module.exports = {
  info: (message) => writeLog(LogLevel.INFO, message),
  warn: (message) => writeLog(LogLevel.WARNING, message),
  error: (message, error) => {
    const errorMsg = error ? `${message}: ${error.message || error}` : message;
    writeLog(LogLevel.ERROR, errorMsg);
    if (error && error.stack) {
      writeLog(LogLevel.ERROR, `Stack: ${error.stack}`);
    }
  }
}; 