-- Создаем таблицу для кодов верификации
CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(6) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'telegram', 'email'
  provider_id VARCHAR(255) NOT NULL, -- telegram_id или email
  user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE, -- Может быть NULL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_provider ON verification_codes(provider);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- Удаляем старую таблицу email_auth_tokens
DROP TABLE IF EXISTS email_auth_tokens; 