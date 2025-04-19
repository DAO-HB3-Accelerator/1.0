/**
 * Создает объект ошибки с указанным сообщением и кодом статуса
 * @param {string} message - Сообщение об ошибке
 * @param {number} statusCode - HTTP-код статуса (по умолчанию 500)
 * @returns {Error} Объект ошибки с дополнительными свойствами
 */
function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createError }; 