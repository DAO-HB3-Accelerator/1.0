const { pool } = require('../db');
const verificationService = require('./verification-service');
const logger = require('../utils/logger');
const emailBot = require('./emailBot');
const db = require('../db');
const authService = require('./auth-service');

class EmailAuth {
  constructor() {
    this.emailBot = emailBot;
  }

  async initEmailAuth(session, email) {
    try {
      if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Некорректный формат email');
      }
      
      // Проверяем, существует ли пользователь с таким email
      const existingEmailUser = await db.query(
        `SELECT u.id FROM users u 
         JOIN user_identities i ON u.id = i.user_id 
         WHERE i.provider = 'email' AND i.provider_id = $1`,
        [email.toLowerCase()]
      );
      
      // Создаем или получаем ID пользователя
      let userId;
      
      if (session.authenticated && session.userId) {
        // Если пользователь уже аутентифицирован, используем его ID
        userId = session.userId;
        logger.info(`[initEmailAuth] Using existing authenticated user ${userId} for email ${email}`);
      } else if (existingEmailUser.rows.length > 0) {
        // Если найден пользователь с таким email, используем его ID
        userId = existingEmailUser.rows[0].id;
        logger.info(`[initEmailAuth] Found existing user ${userId} with email ${email}`);
      } else {
        // Создаем временного пользователя, если нужно будет создать нового
        const userResult = await db.query(
          'INSERT INTO users (role) VALUES ($1) RETURNING id',
          ['user']
        );
        userId = userResult.rows[0].id;
        session.tempUserId = userId;
        logger.info(`[initEmailAuth] Created temporary user ${userId} for email ${email}`);
      }
      
      // Сохраняем email в сессии
      session.pendingEmail = email.toLowerCase();
      
      // Создаем код через сервис верификации
      const verificationCode = await verificationService.createVerificationCode(
        'email',
        email.toLowerCase(),
        userId
      );
      
      // Отправляем код на email
      await this.emailBot.sendVerificationCode(email, verificationCode);
      
      logger.info(`Generated verification code for Email auth for ${email} and sent to user's email`);
      
      return { success: true, verificationCode };
    } catch (error) {
      logger.error('Error in email auth initialization:', error);
      throw error;
    }
  }

  async checkEmailVerification(code, session) {
    try {
      if (!code) {
        return { verified: false, message: 'Код верификации не предоставлен' };
      }

      if (!session.pendingEmail) {
        return { verified: false, message: 'Email не найден в сессии' };
      }

      // Проверяем код через сервис верификации
      const result = await verificationService.verifyCode(code, 'email', session.pendingEmail);
      
      if (!result.success) {
        // Используем сообщение об ошибке из сервиса верификации
        return { verified: false, message: result.error || 'Неверный код верификации' };
      }

      const email = session.pendingEmail.toLowerCase();
      let finalUserId;

      // Если пользователь уже авторизован, используем его ID
      if (session.authenticated && session.userId) {
        finalUserId = session.userId;
        logger.info(`[checkEmailVerification] Using existing authenticated user ${finalUserId}`);
        
        // Связываем email с существующим пользователем
        await authService.linkIdentity(finalUserId, 'email', email);
        
        // Очищаем временные данные
        delete session.pendingEmail;
        
        return {
          verified: true,
          userId: finalUserId,
          email: email
        };
      }

      // Если пользователь не авторизован, ищем всех пользователей с похожими идентификаторами
      const identities = {
        email: email,
        guest: session.guestId
      };

      const relatedUsers = await authService.identityService.findRelatedUsers(identities);
      logger.info(`[checkEmailVerification] Found ${relatedUsers.length} related users for identities:`, identities);

      if (relatedUsers.length > 0) {
        // Берем первого найденного пользователя как основного
        finalUserId = relatedUsers[0];
        logger.info(`[checkEmailVerification] Using existing user ${finalUserId} as primary`);

        // Мигрируем данные от остальных пользователей к основному
        for (const userId of relatedUsers.slice(1)) {
          await authService.identityService.migrateUserData(userId, finalUserId);
          logger.info(`[checkEmailVerification] Migrated data from user ${userId} to ${finalUserId}`);
        }

        // Если у нас есть временный пользователь, мигрируем его данные тоже
        if (session.tempUserId && !relatedUsers.includes(session.tempUserId)) {
          await authService.identityService.migrateUserData(session.tempUserId, finalUserId);
          logger.info(`[checkEmailVerification] Migrated temporary user ${session.tempUserId} to ${finalUserId}`);
        }
      } else {
        // Если связанных пользователей нет, используем временного или создаем нового
        if (session.tempUserId) {
          finalUserId = session.tempUserId;
          logger.info(`[checkEmailVerification] Using temporary user ${finalUserId}`);
        } else {
          const newUserResult = await db.query(
            'INSERT INTO users (role) VALUES ($1) RETURNING id',
            ['user']
          );
          finalUserId = newUserResult.rows[0].id;
          logger.info(`[checkEmailVerification] Created new user ${finalUserId}`);
        }
      }

      // Добавляем email в базу данных
      await authService.identityService.saveIdentity(finalUserId, 'email', email, true);
      logger.info(`[checkEmailVerification] Added email identity ${email} for user ${finalUserId}`);

      // Если есть гостевой ID, добавляем его тоже
      if (session.guestId) {
        await authService.identityService.saveIdentity(finalUserId, 'guest', session.guestId, true);
        logger.info(`[checkEmailVerification] Added guest identity ${session.guestId} for user ${finalUserId}`);
      }

      // Очищаем временные данные
      delete session.pendingEmail;
      if (session.tempUserId) {
        delete session.tempUserId;
      }

      return {
        verified: true,
        userId: finalUserId,
        email: email
      };
    } catch (error) {
      logger.error('Error checking email verification:', error);
      return { verified: false, message: 'Ошибка при проверке кода верификации' };
    }
  }
}

// Создаем и экспортируем единственный экземпляр
const emailAuth = new EmailAuth();
module.exports = emailAuth; 