console.log('[DIAG][auth.js] Файл загружен:', __filename);

const { createError } = require('../utils/error');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');
const { USER_ROLES } = require('../utils/constants');
const db = require('../db');
const { checkAdminTokens } = require('../services/auth-service');

/**
 * Middleware для проверки аутентификации
 */
const requireAuth = async (req, res, next) => {
  console.log('[DIAG][requireAuth] session:', req.session);
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Требуется аутентификация' });
  }
  // Можно добавить проверку isAdmin здесь, если нужно
  next();
};

/**
 * Middleware для проверки прав администратора
 */
async function requireAdmin(req, res, next) {
  try {
    // Проверка аутентификации
    if (!req.session || !req.session.authenticated) {
      return next(createError('Требуется аутентификация', 401));
    }

    // Проверка через сессию
    if (req.session.isAdmin) {
      return next();
    }

    // Проверка через кошелек
    if (req.session.address) {
      const isAdmin = await authService.checkAdminTokens(req.session.address);
      if (isAdmin) {
        // Обновляем сессию
        req.session.isAdmin = true;
        return next();
      }
    }

    // Проверка через ID пользователя
    if (req.session.userId) {
      const userResult = await db.getQuery()('SELECT role FROM users WHERE id = $1', [
        req.session.userId,
      ]);
      if (userResult.rows.length > 0 && userResult.rows[0].role === USER_ROLES.ADMIN) {
        // Обновляем сессию
        req.session.isAdmin = true;
        return next();
      }
    }

    // Если ни одна проверка не прошла
    return next(createError('Доступ запрещен', 403));
  } catch (error) {
    logger.error(`Error in requireAdmin middleware: ${error.message}`);
    return next(createError('Внутренняя ошибка сервера', 500));
  }
}

/**
 * Middleware для проверки определенной роли
 * @param {string} role - Требуемая роль
 */
function requireRole(role) {
  return async (req, res, next) => {
    try {
      // Проверка аутентификации
      if (!req.session || !req.session.authenticated) {
        return next(createError('Требуется аутентификация', 401));
      }

      // Для администраторов разрешаем все
      if (req.session.isAdmin) {
        return next();
      }

      // Проверка через ID пользователя
      if (req.session.userId) {
        const userResult = await db.getQuery()('SELECT role FROM users WHERE id = $1', [
          req.session.userId,
        ]);
        if (userResult.rows.length > 0 && userResult.rows[0].role === role) {
          return next();
        }
      }

      // Если проверка не прошла
      return next(createError('Доступ запрещен', 403));
    } catch (error) {
      logger.error(`Error in requireRole middleware: ${error.message}`);
      return next(createError('Внутренняя ошибка сервера', 500));
    }
  };
}

/**
 * Проверяет роль пользователя
 * @param {string} role - Роль для проверки
 */
async function checkRole(req, res, next) {
  try {
    if (!req.session.authenticated) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Если есть адрес кошелька - проверяем токены
    if (req.session.address) {
      req.session.isAdmin = await checkAdminTokens(req.session.address);
      await req.session.save();
    }

    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  } catch (error) {
    console.error('Error in checkRole middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Проверка аутентификации - алиас для requireAuth
 */
const isAuthenticated = requireAuth;

/**
 * Проверка прав администратора - алиас для requireAdmin
 */
const isAdmin = requireAdmin;

module.exports = {
  requireAuth,
  requireAdmin,
  requireRole,
  checkRole,
  isAuthenticated,
  isAdmin
};
