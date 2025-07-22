const logger = require('./logger');

const getWhitelistedServerIds = () => {
  const idsString = process.env.WHITELISTED_SERVER_IDS || '';
  if (!idsString) return [];
  
  return idsString.split(',').map(id => id.trim()).filter(id => id);
};

const isServerWhitelisted = (guildId) => {
  const whitelistedIds = getWhitelistedServerIds();
  if (whitelistedIds.length === 0) {
    logger.warn('No whitelisted servers configured. All servers allowed.');
    return true;
  }
  
  return whitelistedIds.includes(guildId);
};

const hasStaffRole = (member) => {
  if (!member) return false;
  
  const staffRoleId = process.env.STAFF_ROLE_ID;
  if (!staffRoleId) {
    logger.warn('No staff role ID configured. Staff permission checks will fail.');
    return false;
  }
  
  return member.roles.cache.has(staffRoleId);
};

module.exports = {
  isServerWhitelisted,
  hasStaffRole
}; 