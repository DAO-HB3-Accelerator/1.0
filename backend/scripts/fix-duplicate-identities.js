/**
 * Скрипт для поиска и исправления дубликатов идентификаторов в базе данных
 */
require('dotenv').config();
const { Pool } = require('pg');
const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

// Настройка логирования
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logFile = path.join(logDir, 'fix-duplicates.log');
const logger = {
  log: message => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(logFile, logMessage);
  },
  error: (message, error) => {
    const timestamp = new Date().toISOString();
    const errorDetail = error ? `: ${error.message}` : '';
    const logMessage = `[${timestamp}] ERROR: ${message}${errorDetail}\n`;
    console.error(`ERROR: ${message}${errorDetail}`);
    fs.appendFileSync(logFile, logMessage);
  }
};

// Создаем подключение к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Нормализует адрес кошелька
 * @param {string} address - Адрес кошелька
 * @returns {string} - Нормализованный адрес в нижнем регистре
 */
function normalizeWalletAddress(address) {
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch (error) {
    logger.error(`Invalid wallet address: ${address}`, error);
    return address;
  }
}

/**
 * Находит все дубликаты идентификаторов кошельков
 */
async function findDuplicateWallets() {
  const client = await pool.connect();
  
  try {
    logger.log('Поиск дубликатов wallet-идентификаторов...');
    
    // Находим пары идентификаторов, которые отличаются только регистром
    const result = await client.query(`
      SELECT 
        ui1.id as id1, 
        ui1.user_id as user_id1, 
        ui1.provider_id as provider_id1,
        ui2.id as id2, 
        ui2.user_id as user_id2, 
        ui2.provider_id as provider_id2
      FROM 
        user_identities ui1
      JOIN 
        user_identities ui2 ON ui1.id < ui2.id
      WHERE 
        ui1.provider = 'wallet' AND 
        ui2.provider = 'wallet' AND 
        LOWER(ui1.provider_id) = LOWER(ui2.provider_id) AND 
        ui1.provider_id <> ui2.provider_id
    `);
    
    logger.log(`Найдено ${result.rows.length} потенциальных дубликатов wallet-идентификаторов`);
    
    return result.rows;
  } catch (error) {
    logger.error('Ошибка при поиске дубликатов wallet-идентификаторов', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Исправляет дубликаты идентификаторов
 * @param {Array} duplicates - Массив найденных дубликатов
 */
async function fixDuplicates(duplicates) {
  const client = await pool.connect();
  
  try {
    logger.log('Исправление дубликатов идентификаторов...');
    
    await client.query('BEGIN');
    
    for (const dup of duplicates) {
      // Проверяем, принадлежат ли идентификаторы одному пользователю
      if (dup.user_id1 === dup.user_id2) {
        // Если да, удаляем один из дубликатов (не в нижнем регистре)
        const normalizedAddress = normalizeWalletAddress(dup.provider_id1);
        
        // Определяем, какой идентификатор нужно удалить
        const idToDelete = dup.provider_id1 === normalizedAddress ? dup.id2 : dup.id1;
        
        logger.log(`Удаление дубликата ID ${idToDelete} для адреса ${normalizedAddress}`);
        
        await client.query('DELETE FROM user_identities WHERE id = $1', [idToDelete]);
        
        // Проверяем, что второй идентификатор в нормализованной форме
        const remainingId = dup.provider_id1 === normalizedAddress ? dup.id1 : dup.id2;
        const remainingAddress = dup.provider_id1 === normalizedAddress ? dup.provider_id1 : dup.provider_id2;
        
        if (remainingAddress !== normalizedAddress) {
          logger.log(`Обновление идентификатора ID ${remainingId} до нормализованного значения ${normalizedAddress}`);
          
          await client.query(
            'UPDATE user_identities SET provider_id = $1 WHERE id = $2',
            [normalizedAddress, remainingId]
          );
        }
      } else {
        // Если идентификаторы принадлежат разным пользователям, нужно решить конфликт
        // Для определения какой пользователь является основным, можно использовать:
        // 1. Количество сообщений/активности
        // 2. Дату создания аккаунта
        logger.log(`Конфликт: адрес ${dup.provider_id1}/${dup.provider_id2} привязан к разным пользователям: ${dup.user_id1} и ${dup.user_id2}`);
        
        // Определяем, какой пользователь является основным
        const userInfoResult = await client.query(`
          SELECT 
            id, 
            (SELECT COUNT(*) FROM messages WHERE user_id = users.id) as message_count,
            (SELECT created_at FROM user_identities WHERE user_id = users.id ORDER BY created_at ASC LIMIT 1) as created_at
          FROM 
            users
          WHERE 
            id IN ($1, $2)
          ORDER BY 
            message_count DESC, created_at ASC
        `, [dup.user_id1, dup.user_id2]);
        
        // Если нет пользователей, пропускаем
        if (userInfoResult.rows.length === 0) {
          logger.log(`Пропуск: не найдены пользователи ${dup.user_id1} и ${dup.user_id2}`);
          continue;
        }
        
        // Выбираем первого пользователя как основного (с наибольшим количеством сообщений или самого старого)
        const mainUserId = userInfoResult.rows[0].id;
        const secondaryUserId = mainUserId === dup.user_id1 ? dup.user_id2 : dup.user_id1;
        
        logger.log(`Объединение пользователей: сохраняем ID ${mainUserId}, удаляем ID ${secondaryUserId}`);
        
        // Переносим все идентификаторы от вторичного пользователя к основному
        await client.query(`
          INSERT INTO user_identities (user_id, provider, provider_id)
          SELECT $1, provider, provider_id
          FROM user_identities
          WHERE user_id = $2
          ON CONFLICT DO NOTHING
        `, [mainUserId, secondaryUserId]);
        
        // Переносим сообщения
        await client.query(`
          UPDATE messages
          SET user_id = $1
          WHERE user_id = $2
        `, [mainUserId, secondaryUserId]);
        
        // Переносим другие связанные данные...
        // ...
        
        // Удаляем вторичного пользователя
        await client.query('DELETE FROM user_identities WHERE user_id = $1', [secondaryUserId]);
        await client.query('DELETE FROM users WHERE id = $1', [secondaryUserId]);
      }
    }
    
    await client.query('COMMIT');
    logger.log('Исправление дубликатов успешно завершено');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Ошибка при исправлении дубликатов', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Основная функция
 */
async function main() {
  try {
    logger.log('Запуск скрипта исправления дубликатов идентификаторов...');
    
    // Шаг 1: Нормализация всех адресов кошельков (приведение к нижнему регистру)
    const client = await pool.connect();
    
    try {
      logger.log('Нормализация всех существующих адресов кошельков...');
      
      await client.query('BEGIN');
      
      // Получаем все идентификаторы кошельков
      const walletsResult = await client.query(`
        SELECT id, provider_id
        FROM user_identities
        WHERE provider = 'wallet'
      `);
      
      logger.log(`Найдено ${walletsResult.rows.length} идентификаторов кошельков`);
      
      // Обновляем каждый адрес к нормализованной форме
      let updatedCount = 0;
      
      for (const wallet of walletsResult.rows) {
        try {
          const normalizedAddress = normalizeWalletAddress(wallet.provider_id);
          
          if (normalizedAddress !== wallet.provider_id) {
            await client.query(
              'UPDATE user_identities SET provider_id = $1 WHERE id = $2',
              [normalizedAddress, wallet.id]
            );
            updatedCount++;
          }
        } catch (error) {
          logger.error(`Ошибка при нормализации адреса ${wallet.provider_id}`, error);
        }
      }
      
      await client.query('COMMIT');
      logger.log(`Нормализовано ${updatedCount} адресов кошельков`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Ошибка при нормализации адресов кошельков', error);
    } finally {
      client.release();
    }
    
    // Шаг 2: Поиск и исправление дубликатов
    const duplicates = await findDuplicateWallets();
    
    if (duplicates.length > 0) {
      await fixDuplicates(duplicates);
    } else {
      logger.log('Дубликатов wallet-идентификаторов не найдено');
    }
    
    logger.log('Скрипт успешно завершил работу');
  } catch (error) {
    logger.error('Критическая ошибка при выполнении скрипта', error);
  } finally {
    pool.end();
  }
}

// Запускаем скрипт
main(); 