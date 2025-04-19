const hre = require('hardhat');

async function main() {
  const accessToken = await hre.ethers.getContractAt(
    'AccessToken',
    '0xF352c498cF0857F472dC473E4Dd39551E79B1063'
  );

  const owner = await accessToken.owner();
  console.log('Contract owner:', owner);

  // Создаем админский токен для владельца
  try {
    const tx = await accessToken.mintAccessToken(owner, 0); // 0 = ADMIN
    await tx.wait();
    console.log(`Admin token minted for ${owner}`);

    const role = await accessToken.checkRole(owner);
    console.log('Owner role:', ['ADMIN', 'MODERATOR', 'SUPPORT'][role]);
  } catch (error) {
    console.log('Admin token minting error:', error.message);
  }

  // Создаем тестовый токен модератора
  const moderatorAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Тестовый адрес модератора
  try {
    const tx = await accessToken.mintAccessToken(moderatorAddress, 1); // 1 = MODERATOR
    await tx.wait();
    console.log(`Moderator token minted for ${moderatorAddress}`);

    const role = await accessToken.checkRole(moderatorAddress);
    console.log('Moderator role:', ['ADMIN', 'MODERATOR', 'SUPPORT'][role]);
  } catch (error) {
    console.log('Moderator token minting error:', error.message);
  }

  // Проверяем все токены
  console.log('\nChecking all tokens:');
  for (let i = 1; i <= 5; i++) {
    try {
      const owner = await accessToken.ownerOf(i);
      const role = await accessToken.checkRole(owner);
      console.log(`Token ${i}: Owner ${owner}, Role: ${['ADMIN', 'MODERATOR', 'SUPPORT'][role]}`);
    } catch (error) {
      // Пропускаем несуществующие токены
      if (!error.message.includes('nonexistent token')) {
        console.log(`Token ${i} error:`, error.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
