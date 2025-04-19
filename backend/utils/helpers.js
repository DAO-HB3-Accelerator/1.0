// Функция для создания задержки
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Функция для валидации email адреса
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

module.exports = {
  sleep,
  isValidEmail,
};
