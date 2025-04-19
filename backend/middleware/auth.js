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
  try {
    console.log('Session in requireAuth:', {
      id: req.sessionID,
      userId: req.session?.userId,
      authenticated: req.session?.authenticated
    });

    // Проверяем сессию
    if (req.session?.authenticated && req.session?.userId) {
      // Обновляем время жизни сессии
      req.session.touch();
      
      req.user = {
        userId: req.session.userId,
        address: req.session.address,
        isAdmin: req.session.isAdmin,
        authType: req.session.authType
      };
      return next();
    }

    // Проверяем Bearer токен
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const address = authHeader.split(' ')[1];
      
      if (address.startsWith('0x')) {
        const result = await db.query(`
          SELECT u.id, u.is_admin 
          FROM users u
          JOIN user_identities ui ON u.id = ui.user_id
          WHERE ui.identity_type = 'wallet' 
          AND LOWER(ui.identity_value) = LOWER($1)
        `, [address]);

        if (result.rows.length > 0) {
          const user = result.rows[0];
          
          // Создаем новую сессию
          req.session.regenerate(async (err) => {
            if (err) {
              console.error('Error regenerating session:', err);
              return res.status(500).json({ error: 'Session error' });
            }

            // Устанавливаем данные сессии
            req.session.authenticated = true;
            req.session.userId = user.id;
            req.session.address = address;
            req.session.isAdmin = user.is_admin;
            req.session.authType = 'wallet';

            // Сохраняем сессию
            await new Promise((resolve) => req.session.save(resolve));

            req.user = {
              userId: user.id,
              address: address,
              isAdmin: user.is_admin,
              authType: 'wallet'
            };
            next();
          });
          return;
        }
      }
    }

    return res.status(401).json({ error: 'Unauthorized' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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

module.exports = {
  requireAuth,
  requireAdmin,
  requireRole,
  checkRole
};
