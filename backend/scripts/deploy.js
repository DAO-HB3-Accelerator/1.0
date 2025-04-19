const hre = require('hardhat');

async function main() {
  console.log('Начинаем деплой контракта...');

  // Получаем контракт
  const MyContract = await hre.ethers.getContractFactory('MyContract');

  // Деплоим контракт
  const myContract = await MyContract.deploy();
  await myContract.waitForDeployment();

  const address = await myContract.getAddress();
  console.log('Контракт развернут по адресу:', address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
