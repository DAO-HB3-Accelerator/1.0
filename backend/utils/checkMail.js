const dns = require('dns');
const { promisify } = require('util');
const resolveMx = promisify(dns.resolveMx);

async function checkMailServer(domain) {
  try {
    console.log(`Проверяем MX записи для домена ${domain}...`);
    const records = await resolveMx(domain);
    console.log('Найдены MX записи:', records);
    return records;
  } catch (error) {
    console.error('Ошибка при проверке MX записей:', error);
    return null;
  }
}

module.exports = { checkMailServer };
