const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const db = require('../db');
const authService = require('./auth-service');
const verificationService = require('./verification-service');
const crypto = require('crypto');

let botInstance = null;

// Создание и настройка бота
async function getBot() {
  if (!botInstance) {
    botInstance = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    // Обработка команды /start
    botInstance.command('start', (ctx) => {
      ctx.reply('Добро пожаловать! Отправьте код подтверждения для аутентификации.');
    });

    // Обработка кодов верификации
    botInstance.on('text', async (ctx) => {
      const code = ctx.message.text.trim();
      
      try {
        // Получаем код верификации для всех активных кодов с провайдером telegram
        const codeResult = await db.query(
          `SELECT * FROM verification_codes 
           WHERE code = $1 
           AND provider = 'telegram' 
           AND used = false 
           AND expires_at > NOW()`,
          [code]
        );
        
        if (codeResult.rows.length === 0) {
          ctx.reply('Неверный код подтверждения');
          return;
        }
        
        const verification = codeResult.rows[0];
        const providerId = verification.provider_id;
        const linkedUserId = verification.user_id;  // Получаем связанный userId если он есть
        let userId;
        
        // Отмечаем код как использованный
        await db.query(
          'UPDATE verification_codes SET used = true WHERE id = $1',
          [verification.id]
        );
        
        logger.info('Starting Telegram auth process for code:', code);
        
        // Проверяем, существует ли уже пользователь с таким Telegram ID
        const existingTelegramUser = await db.query(
          `SELECT ui.user_id 
           FROM user_identities ui 
           WHERE ui.provider = 'telegram' AND ui.provider_id = $1`,
          [ctx.from.id.toString()]
        );
        
        if (existingTelegramUser.rows.length > 0) {
          // Если пользователь с таким Telegram ID уже существует, используем его
          userId = existingTelegramUser.rows[0].user_id;
          logger.info(`Using existing user ${userId} for Telegram account ${ctx.from.id}`);
        } else {
          // Если код верификации был связан с существующим пользователем, используем его
          if (linkedUserId) {
            // Используем userId из кода верификации
            userId = linkedUserId;
            // Связываем Telegram с этим пользователем
            await db.query(
              `INSERT INTO user_identities 
               (user_id, provider, provider_id, created_at) 
               VALUES ($1, $2, $3, NOW())`,
              [userId, 'telegram', ctx.from.id.toString()]
            );
            logger.info(`Linked Telegram account ${ctx.from.id} to pre-authenticated user ${userId}`);
          } else {
            // Проверяем, есть ли пользователь, связанный с гостевым идентификатором
            let existingUserWithGuestId = null;
            if (providerId) {
              const guestUserResult = await db.query(
                `SELECT user_id FROM guest_user_mapping WHERE guest_id = $1`,
                [providerId]
              );
              if (guestUserResult.rows.length > 0) {
                existingUserWithGuestId = guestUserResult.rows[0].user_id;
                logger.info(`Found existing user ${existingUserWithGuestId} by guest ID ${providerId}`);
              }
            }
            
            if (existingUserWithGuestId) {
              // Используем существующего пользователя и добавляем ему Telegram идентификатор
              userId = existingUserWithGuestId;
              await db.query(
                `INSERT INTO user_identities 
                 (user_id, provider, provider_id, created_at) 
                 VALUES ($1, $2, $3, NOW())`,
                [userId, 'telegram', ctx.from.id.toString()]
              );
              logger.info(`Linked Telegram account ${ctx.from.id} to existing user ${userId}`);
            } else {
              // Создаем нового пользователя, если не нашли существующего
              const userResult = await db.query(
                'INSERT INTO users (created_at, role) VALUES (NOW(), $1) RETURNING id',
                ['user']
              );
              userId = userResult.rows[0].id;
              
              // Связываем Telegram с новым пользователем
              await db.query(
                `INSERT INTO user_identities 
                 (user_id, provider, provider_id, created_at) 
                 VALUES ($1, $2, $3, NOW())`,
                [userId, 'telegram', ctx.from.id.toString()]
              );
              
              // Если был гостевой ID, связываем его с новым пользователем
              if (providerId) {
                await db.query(
                  `INSERT INTO guest_user_mapping 
                   (user_id, guest_id) 
                   VALUES ($1, $2)
                   ON CONFLICT (guest_id) DO UPDATE SET user_id = $1`,
                  [userId, providerId]
                );
              }
              
              logger.info(`Created new user ${userId} with Telegram account ${ctx.from.id}`);
            }
          }
        }
        
        // Обновляем сессию в базе данных
        await db.query(
          `UPDATE session 
           SET sess = (sess::jsonb || $1::jsonb)::json
           WHERE sess::jsonb @> $2::jsonb`,
          [
            JSON.stringify({
              userId: userId.toString(),
              authenticated: true,
              authType: "telegram",
              telegramId: ctx.from.id.toString()
            }),
            JSON.stringify({guestId: providerId})
          ]
        );
        
        // Отправляем сообщение об успешной аутентификации
        await ctx.reply('Аутентификация успешна! Можете вернуться в приложение.');
        
        // Удаляем сообщение с кодом
        try {
          await ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          logger.warn('Could not delete code message:', error);
        }
        
      } catch (error) {
        logger.error('Error in Telegram auth:', error);
        await ctx.reply('Произошла ошибка при аутентификации. Попробуйте позже.');
      }
    });

    // Запускаем бота
    await botInstance.launch();
  }
  
  return botInstance;
}

// Остановка бота
async function stopBot() {
  if (botInstance) {
    try {
      await botInstance.stop();
      botInstance = null;
      logger.info('Telegram bot stopped successfully');
    } catch (error) {
      logger.error('Error stopping Telegram bot:', error);
      throw error;
    }
  }
}

// Инициализация процесса аутентификации
async function initTelegramAuth(session) {
  try {
    // Используем временный идентификатор для создания кода верификации
    // Реальный пользователь будет создан или найден при проверке кода через бота
    const tempId = crypto.randomBytes(16).toString('hex');
    
    // Если пользователь уже авторизован, сохраняем его userId в guest_user_mapping
    // чтобы потом при авторизации через бота этот пользователь был найден
    if (session && session.authenticated && session.userId) {
      const guestId = session.guestId || tempId;
      
      // Связываем гостевой ID с текущим пользователем
      await db.query(
        `INSERT INTO guest_user_mapping (user_id, guest_id) 
         VALUES ($1, $2) 
         ON CONFLICT (guest_id) DO UPDATE SET user_id = $1`,
        [session.userId, guestId]
      );
      
      logger.info(`[initTelegramAuth] Linked guestId ${guestId} to authenticated user ${session.userId}`);
    }
    
    // Создаем код через сервис верификации с идентификатором
    const code = await verificationService.createVerificationCode(
      'telegram',
      session.guestId || tempId,
      session.authenticated ? session.userId : null
    );
    
    logger.info(`[initTelegramAuth] Created verification code for guestId: ${session.guestId || tempId}${session.authenticated ? `, userId: ${session.userId}` : ''}`);
    
    return {
      verificationCode: code,
      botLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}`
    };
  } catch (error) {
    logger.error('Error initializing Telegram auth:', error);
    throw error;
  }
}

module.exports = {
  getBot,
  stopBot,
  initTelegramAuth
};