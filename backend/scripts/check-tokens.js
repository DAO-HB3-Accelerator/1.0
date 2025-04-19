const { checkAllUsersTokens } = require('../utils/access-check');
const logger = require('../utils/logger');

async function main() {
  logger.info('Starting token balance check for all users');
  
  try {
    await checkAllUsersTokens();
    logger.info('Token balance check completed successfully');
  } catch (error) {
    logger.error(`Error during token balance check: ${error.message}`);
  }
}

// Запуск скрипта
main()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  }); 