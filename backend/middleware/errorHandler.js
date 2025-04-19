const logger = require('../utils/logger');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Middleware для обработки ошибок
 */
function errorHandler(err, req, res, next) {
  // Логируем ошибку
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.session?.userId
  });

  // Определяем тип ошибки
  let statusCode = 500;
  let errorCode = ERROR_CODES.INTERNAL_ERROR;
  let errorMessage = 'Внутренняя ошибка сервера';

  // Обрабатываем разные типы ошибок
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    statusCode = 401;
    errorCode = ERROR_CODES.UNAUTHORIZED;
    errorMessage = 'Требуется аутентификация';
  } else if (err.status === 403) {
    statusCode = 403;
    errorCode = ERROR_CODES.FORBIDDEN;
    errorMessage = 'Доступ запрещен';
  } else if (err.status === 404) {
    statusCode = 404;
    errorCode = ERROR_CODES.NOT_FOUND;
    errorMessage = 'Ресурс не найден';
  } else if (err.status === 400) {
    statusCode = 400;
    errorCode = ERROR_CODES.BAD_REQUEST;
    errorMessage = err.message || 'Некорректный запрос';
  }

  // В режиме разработки возвращаем стек ошибки
  const devError = process.env.NODE_ENV === 'development' 
    ? { stack: err.stack } 
    : {};

  // Отправляем ответ клиенту
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: errorMessage,
      ...devError
    }
  });
}

/**
 * Функция для создания ошибок с определенным статусом
 * @param {string} message - Сообщение об ошибке
 * @param {number} status - HTTP-статус ошибки
 * @returns {Error} - Объект ошибки
 */
function createError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  errorHandler,
  createError
}; 