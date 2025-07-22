const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * @returns {string} 
 */
const generateUniqueFolderName = () => {
  const randomStr = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}_${randomStr}`;
};

/**
 * @param {string} filePath 
 * @param {string} webRoot 
 * @param {Object} options 
 * @returns {Promise<Object>} 
 */
const uploadToWebServer = async (filePath, webRoot = 'C:/xampp/htdocs/', options = {}) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    if (!fs.existsSync(webRoot)) {
      throw new Error(`Web root directory does not exist: ${webRoot}`);
    }
    
    const folderName = generateUniqueFolderName();
    const uploadDir = path.join(webRoot, folderName);
    
    await fs.ensureDir(uploadDir);
    
    const fileName = path.basename(filePath);
    const destinationPath = path.join(uploadDir, fileName);
    await fs.copy(filePath, destinationPath);
    
    await createDirectDownloadPhp(uploadDir, fileName);
    
    const baseUrl = process.env.WEB_SERVER_URL || 'https://YOURIP.com/';
    const downloadUrl = `${baseUrl}${folderName}/download.php`;
    
    logger.info(`File uploaded to web server at: ${destinationPath}`);
    
    return {
      folderName,
      fileName,
      fullPath: destinationPath,
      downloadUrl,
      directoryPath: uploadDir
    };
  } catch (error) {
    logger.error(`Failed to upload file to web server: ${error.message}`, error);
    throw error;
  }
};

/**
 * @param {string} directoryPath 
 * @returns {Promise<boolean>} 
 */
const deleteUploadedFile = async (directoryPath) => {
  try {
    if (fs.existsSync(directoryPath)) {
      await fs.remove(directoryPath);
      logger.info(`Deleted web upload folder: ${directoryPath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Failed to delete web upload folder: ${error.message}`, error);
    throw error;
  }
};

/**
 * @param {string} uploadDir 
 * @param {string} fileName 
 * @returns {Promise<void>}
 */
const createDirectDownloadPhp = async (uploadDir, fileName) => {
  const phpContent = `<?php
// Log file for debugging
$logFile = "download_log.txt";
file_put_contents($logFile, "Download script started at: " . date("Y-m-d H:i:s") . "\\n", FILE_APPEND);

// Set absolute paths for reliability
$currentDir = __DIR__;
$filePath = $currentDir . '/' . '${fileName}';
$fileSize = filesize($filePath);

file_put_contents($logFile, "File path: $filePath (Size: $fileSize bytes)\\n", FILE_APPEND);

// Validate that the file exists
if (!file_exists($filePath)) {
    file_put_contents($logFile, "ERROR: File does not exist\\n", FILE_APPEND);
    header("HTTP/1.1 404 Not Found");
    echo "File not found";
    exit;
}

// Prevent caching
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

// Get file extension to set correct content type
$ext = pathinfo($filePath, PATHINFO_EXTENSION);
file_put_contents($logFile, "File extension: $ext\\n", FILE_APPEND);

// Set content type based on file extension
if (strtolower($ext) == 'exe') {
    header('Content-Type: application/octet-stream');
    file_put_contents($logFile, "Set header for EXE file\\n", FILE_APPEND);
} else if (strtolower($ext) == 'dll') {
    header('Content-Type: application/octet-stream');
    file_put_contents($logFile, "Set header for DLL file\\n", FILE_APPEND);
} else {
    header('Content-Type: application/octet-stream');
    file_put_contents($logFile, "Set generic binary header\\n", FILE_APPEND);
}

// Force download
header('Content-Description: File Transfer');
header('Content-Disposition: attachment; filename="' . basename($filePath) . '"');
header('Content-Transfer-Encoding: binary');
header('Expires: 0');
header('Content-Length: ' . $fileSize);

file_put_contents($logFile, "Set all headers, about to send file\\n", FILE_APPEND);

// Clear output buffer to prevent corruption
if (ob_get_level()) {
    ob_end_clean();
}

// Read and output the file
readfile($filePath);

file_put_contents($logFile, "File sent, preparing for cleanup\\n", FILE_APPEND);

// Delete files immediately after download
// No need to wait - we'll delete right away
file_put_contents($logFile, "Attempting to delete files\\n", FILE_APPEND);

// Delete the main file
if (unlink($filePath)) {
    file_put_contents($logFile, "Successfully deleted: $filePath\\n", FILE_APPEND);
} else {
    file_put_contents($logFile, "Failed to delete: $filePath\\n", FILE_APPEND);
}

// Delete all other files in directory
$files = glob($currentDir . '/*');
foreach ($files as $file) {
    if (is_file($file) && $file != $currentDir . '/' . $logFile) {
        if (unlink($file)) {
            file_put_contents($logFile, "Successfully deleted: $file\\n", FILE_APPEND);
        } else {
            file_put_contents($logFile, "Failed to delete: $file\\n", FILE_APPEND);
        }
    }
}

// Finally delete the log file itself
unlink($currentDir . '/' . $logFile);

// Exit after sending file and performing cleanup
exit;
?>"`;

  await fs.writeFile(path.join(uploadDir, 'download.php'), phpContent);
  
  const htaccessContent = `
# Enable PHP execution
<FilesMatch "\\.php$">
    SetHandler application/x-httpd-php
</FilesMatch>

# Disable directory listing
Options -Indexes

# Allow access to the download.php script
<Files "download.php">
    Require all granted
</Files>

# Set higher execution time for PHP
php_value max_execution_time 300
php_value memory_limit 256M
`;
  
  await fs.writeFile(path.join(uploadDir, '.htaccess'), htaccessContent);
};

module.exports = {
  uploadToWebServer,
  deleteUploadedFile,
  createDirectDownloadPhp
}; 