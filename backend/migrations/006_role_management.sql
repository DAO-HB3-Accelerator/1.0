CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT
);

-- Добавление базовых ролей
INSERT INTO roles (name, description) VALUES 
  ('admin', 'Администратор с полным доступом к системе'),
  ('user', 'Обычный пользователь с базовым доступом') 
ON CONFLICT (name) DO NOTHING;

-- Добавление поля role_id в таблицу users, если оно еще не существует
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) DEFAULT 2;

-- Таблица для отслеживания токенов доступа
CREATE TABLE IF NOT EXISTS access_tokens (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  token_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id)
);

-- Индекс для быстрого поиска по адресу кошелька
CREATE INDEX IF NOT EXISTS idx_access_tokens_wallet ON access_tokens(wallet_address); 