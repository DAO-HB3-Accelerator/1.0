const { getContract } = require('../utils/contracts');
const logger = require('../utils/logger');

async function main() {
  try {
    const accessToken = await getContract('AccessToken');

    const owner = await accessToken.owner();
    logger.info('Contract owner:', owner);

    // Проверяем все токены и их владельцев
    logger.info('\nAll tokens:');
    for (let i = 1; i <= 10; i++) {
      try {
        const tokenOwner = await accessToken.ownerOf(i);
        logger.info(`Token ${i} owner: ${tokenOwner}`);
      } catch (error) {
        if (!error.message.includes('invalid token ID')) {
          logger.error(`Token ${i} error:`, error.message);
        }
      }
    }

    // Проверяем активные токены для всех известных адресов
    const addresses = [owner, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'];

    logger.info('\nActive tokens:');
    for (const address of addresses) {
      const activeToken = await accessToken.activeTokens(address);
      logger.info(`${address}: Token ${activeToken.toString()}`);
    }
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
