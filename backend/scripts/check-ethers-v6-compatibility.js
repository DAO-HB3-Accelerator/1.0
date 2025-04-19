const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Паттерны для поиска несовместимых конструкций ethers.js v5
const patterns = [
  'ethers.providers.JsonRpcProvider',
  'ethers.providers.Web3Provider',
  'ethers.utils.parseEther',
  'ethers.utils.formatEther',
  'ethers.utils.formatUnits',
  'ethers.utils.parseUnits',
  'ethers.utils.verifyMessage',
  'ethers.utils.keccak256',
  'ethers.utils.toUtf8Bytes',
  'ethers.utils.arrayify',
  'ethers.utils.hexlify',
  'ethers.BigNumber.from',
  'ethers.constants.Zero',
  'ethers.constants.One',
  'ethers.constants.Two',
  'ethers.constants.MaxUint256',
  'ethers.constants.AddressZero',
  'ethers.constants.HashZero',
];

// Соответствующие замены для ethers.js v6.x
const replacements = [
  'ethers.JsonRpcProvider',
  'ethers.BrowserProvider',
  'ethers.parseEther',
  'ethers.formatEther',
  'ethers.formatUnits',
  'ethers.parseUnits',
  'ethers.verifyMessage',
  'ethers.keccak256',
  'ethers.toUtf8Bytes',
  'ethers.getBytes',
  'ethers.hexlify',
  'ethers.getBigInt',
  'ethers.ZeroAddress',
  'ethers.ZeroAddress',
  'ethers.ZeroAddress',
  'ethers.MaxUint256',
  'ethers.ZeroAddress',
  'ethers.ZeroHash',
];

// Функция для рекурсивного обхода директории
async function walkDir(dir, fileList = []) {
  const files = await readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) {
      // Пропускаем node_modules и .git
      if (file !== 'node_modules' && file !== '.git') {
        fileList = await walkDir(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

// Функция для проверки файла
async function checkFile(filePath) {
  try {
    if (filePath.includes('check-ethers-v6-compatibility.js')) {
      return false; // Пропускаем проверку самого скрипта
    }

    const content = await readFile(filePath, 'utf8');
    let hasIssues = false;

    for (let i = 0; i < patterns.length; i++) {
      if (content.includes(patterns[i])) {
        console.log(`\x1b[33mПроблема в файле ${filePath}:\x1b[0m`);
        console.log(`  Найдено: \x1b[31m${patterns[i]}\x1b[0m`);
        console.log(`  Заменить на: \x1b[32m${replacements[i]}\x1b[0m`);
        hasIssues = true;
      }
    }

    return hasIssues;
  } catch (error) {
    console.error(`Ошибка при проверке файла ${filePath}:`, error);
    return false;
  }
}

// Основная функция
async function main() {
  try {
    console.log('Проверка совместимости с ethers.js v6.x...');

    const files = await walkDir(path.resolve(__dirname, '..'));
    let issuesFound = false;

    for (const file of files) {
      const hasIssues = await checkFile(file);
      if (hasIssues) {
        issuesFound = true;
      }
    }

    if (!issuesFound) {
      console.log('\x1b[32mПроблем не найдено. Код совместим с ethers.js v6.x\x1b[0m');
    } else {
      console.log('\n\x1b[33mНайдены проблемы совместимости с ethers.js v6.x\x1b[0m');
      console.log('Пожалуйста, обновите код в соответствии с рекомендациями выше.');
    }
  } catch (error) {
    console.error('Ошибка при проверке совместимости:', error);
  }
}

main();
