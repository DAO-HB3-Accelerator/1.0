const { createError } = require('./errorHandler');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');
const { USER_ROLES } = require('../utils/constants');
const db = require('../db');

/**
 * Middleware для проверки аутентификации
 */
function requireAuth(req, res, next) {
  console.log('Session in requireAuth:', req.session);
  if (!req.session || !req.session.authenticated) {
    return next(createError(401, 'Требуется аутентификация'));
  }
  next();
}

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
      const isAdmin = await authService.checkAdminToken(req.session.address);
      if (isAdmin) {
        // Обновляем сессию
        req.session.isAdmin = true;
        return next();
      }
    }

    // Проверка через ID пользователя
    if (req.session.userId) {
      const userResult = await db.query('SELECT role FROM users WHERE id = $1', [req.session.userId]);
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
        const userResult = await db.query('SELECT role FROM users WHERE id = $1', [req.session.userId]);
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
function checkRole(role) {
  return async (req, res, next) => {
    try {
      // Если пользователь не аутентифицирован, просто продолжаем
      if (!req.session || !req.session.authenticated) {
        req.hasRole = false;
        return next();
      }

      // Проверка через ID пользователя
      if (req.session.userId) {
        const userResult = await db.query('SELECT role FROM users WHERE id = $1', [req.session.userId]);
        if (userResult.rows.length > 0 && userResult.rows[0].role === role) {
          req.hasRole = true;
          return next();
        }
      }

      req.hasRole = false;
      next();
    } catch (error) {
      logger.error(`Error in checkRole middleware: ${error.message}`);
      req.hasRole = false;
      next();
    }
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireRole,
  checkRole
};
