const db = require('../db');
const logger = require('../utils/logger');

class VerificationService {
  constructor() {
    this.codeLength = 6;
    this.expirationMinutes = 15;
  }

  // Генерация кода
  generateCode() {
    const code = Math.random().toString(36).substring(2, 2 + this.codeLength).toUpperCase();
    logger.info(`Generated verification code: ${code}`);
    return code;
  }

  // Создание кода верификации
  async createVerificationCode(provider, providerId, userId) {
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.expirationMinutes * 60 * 1000);

    try {
      logger.info(`Creating verification code for ${provider}:${providerId}, userId: ${userId || 'null'}`);
      
      // Если userId не указан, добавляем запись без ссылки на пользователя
      if (userId === null || userId === undefined) {
        await db.query(
          `INSERT INTO verification_codes 
           (code, provider, provider_id, expires_at) 
           VALUES ($1, $2, $3, $4)`,
          [code, provider, providerId, expiresAt]
        );
      } else {
        await db.query(
          `INSERT INTO verification_codes 
           (code, provider, provider_id, user_id, expires_at) 
           VALUES ($1, $2, $3, $4, $5)`,
          [code, provider, providerId, userId, expiresAt]
        );
      }

      logger.info(`Verification code created successfully for ${provider}:${providerId}`);
      return code;
    } catch (error) {
      logger.error('Error creating verification code:', {
        error: error.message,
        provider,
        providerId,
        userId
      });
      throw error;
    }
  }

  // Проверка кода
  async verifyCode(code, provider, providerId) {
    try {
      logger.info(`Verifying code for ${provider}:${providerId}`);
      
      // Преобразуем код в верхний регистр для сравнения
      const normalizedCode = code.toUpperCase();
      logger.info(`Normalized code: ${normalizedCode}`);
      
      // Проверим, есть ли такой код в базе (для отладки)
      const checkResult = await db.query(
        `SELECT code FROM verification_codes 
         WHERE provider = $1 
         AND provider_id = $2 
         AND used = false 
         AND expires_at > NOW()`,
        [provider, providerId]
      );
      
      if (checkResult.rows.length > 0) {
        logger.info(`Found codes for ${provider}:${providerId}: ${JSON.stringify(checkResult.rows.map(r => r.code))}`);
      } else {
        logger.warn(`No active codes found for ${provider}:${providerId}`);
      }
      
      const result = await db.query(
        `SELECT * FROM verification_codes 
         WHERE code = $1 
         AND provider = $2 
         AND provider_id = $3 
         AND used = false 
         AND expires_at > NOW()`,
        [normalizedCode, provider, providerId]
      );

      if (result.rows.length === 0) {
        logger.warn(`Invalid or expired code for ${provider}:${providerId}. Input: ${normalizedCode}`);
        return { success: false, error: 'Неверный или истекший код' };
      }

      const verification = result.rows[0];

      // Отмечаем код как использованный
      await db.query(
        'UPDATE verification_codes SET used = true WHERE id = $1',
        [verification.id]
      );

      logger.info(`Code verified successfully for ${provider}:${providerId}`);
      return {
        success: true,
        userId: verification.user_id,
        providerId: verification.provider_id
      };
    } catch (error) {
      logger.error('Error verifying code:', {
        error: error.message,
        code,
        provider,
        providerId
      });
      throw error;
    }
  }

  // Очистка истекших кодов
  async cleanupExpiredCodes() {
    try {
      const result = await db.query(
        'DELETE FROM verification_codes WHERE expires_at <= NOW() RETURNING id'
      );
      logger.info(`Cleaned up ${result.rowCount} expired verification codes`);
    } catch (error) {
      logger.error('Error cleaning up expired codes:', error);
    }
  }
}

const verificationService = new VerificationService();
module.exports = verificationService; 