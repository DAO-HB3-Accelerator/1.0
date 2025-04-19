const hre = require('hardhat');
const logger = require('../utils/logger');

async function main() {
  try {
    const AccessToken = await hre.ethers.getContractFactory('AccessToken');
    const accessToken = await AccessToken.deploy();
    await accessToken.waitForDeployment();

    const address = await accessToken.getAddress();
    logger.info('AccessToken deployed to:', address);

    // Создаем первый админский токен для владельца контракта
    const [owner] = await hre.ethers.getSigners();
    const tx = await accessToken.mintAccessToken(owner.address, 1); // 1 = ADMIN
    await tx.wait();
    logger.info('Admin token minted for:', owner.address);
  } catch (error) {
    logger.error('Deployment error:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
