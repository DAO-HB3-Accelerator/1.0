const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Инициализация провайдера
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Путь к директории с ABI контрактов
const contractsDir = path.join(__dirname, '../artifacts/contracts/AccessToken.sol');

// Получение ABI контракта
const accessTokenJSON = require('../artifacts/contracts/AccessToken.sol/AccessToken.json');
const accessTokenABI = accessTokenJSON.abi;

// Проверка, что ABI является массивом
if (!Array.isArray(accessTokenABI)) {
  console.error('ABI is not an array:', accessTokenABI);
  // Если ABI не является массивом, создайте массив вручную
  const manualABI = [
    "function mintAccessToken(address to, uint8 role) public",
    "function checkRole(address user) public view returns (uint8)",
    "function revokeToken(uint256 tokenId) public",
    // Добавьте другие функции, которые вам нужны
  ];
  
  // Создание экземпляра контракта с ручным ABI
  const contractAddress = process.env.ACCESS_TOKEN_ADDRESS;
  const accessTokenContract = new ethers.Contract(contractAddress, manualABI, provider);
  
  module.exports = {
    accessTokenContract,
    getContract,
    provider
  };
} else {
  // Если ABI является массивом, используйте его
  const contractAddress = process.env.ACCESS_TOKEN_ADDRESS;
  const accessTokenContract = new ethers.Contract(contractAddress, accessTokenABI, provider);
  
  module.exports = {
    accessTokenContract,
    getContract,
    provider
  };
}

// Кэш для хранения экземпляров контрактов
const contractsCache = {};

/**
 * Получает экземпляр контракта по его имени
 * @param {string} contractName - Имя контракта
 * @returns {Promise<ethers.Contract>} - Экземпляр контракта
 */
async function getContract(contractName) {
  try {
    console.log(`Getting contract: ${contractName}`);
    
    // Проверяем, есть ли контракт в кэше
    if (contractsCache[contractName]) {
      console.log(`Using cached contract: ${contractName}`);
      return contractsCache[contractName];
    }
    
    // Получаем адрес контракта из переменных окружения
    const contractAddress = process.env.ACCESS_TOKEN_ADDRESS; // или ACCESS_TOKEN_CONTRACT_ADDRESS
    
    if (!contractAddress) {
      throw new Error(`Contract address for ${contractName} not found in environment variables`);
    }
    
    // Путь к файлу с ABI контракта
    const abiPath = path.join(contractsDir, `${contractName}.json`);
    
    // Проверяем, существует ли файл с ABI
    if (!fs.existsSync(abiPath)) {
      throw new Error(`ABI file for ${contractName} not found at ${abiPath}`);
    }
    
    // Читаем ABI из файла
    const abiJson = fs.readFileSync(abiPath, 'utf8');
    const contractJSON = JSON.parse(abiJson);
    const abi = contractJSON.abi; // Получаем ABI из свойства abi
    
    console.log(`ABI for ${contractName}:`, abi);
    
    // Проверяем, что ABI является массивом
    if (!Array.isArray(abi)) {
      console.error(`ABI for ${contractName} is not an array:`, abi);
      throw new Error(`ABI for ${contractName} is not an array`);
    }
    
    // Создаем экземпляр контракта
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Сохраняем контракт в кэше
    contractsCache[contractName] = contract;
    
    return contract;
  } catch (error) {
    logger.error(`Ошибка при получении контракта ${contractName}: ${error.message}`);
    throw error;
  }
}
