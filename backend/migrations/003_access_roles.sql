-- Добавляем поле для роли в таблицу users
ALTER TABLE users 
ADD COLUMN role VARCHAR(20) DEFAULT NULL,
ADD COLUMN token_id INTEGER DEFAULT NULL;

-- Индекс для быстрого поиска по роли
CREATE INDEX idx_users_role ON users(role); 