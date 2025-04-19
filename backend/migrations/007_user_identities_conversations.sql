-- Таблица идентификаторов пользователей
CREATE TABLE IF NOT EXISTS user_identities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    identity_type VARCHAR(20) NOT NULL, -- 'wallet', 'telegram', 'email'
    identity_value VARCHAR(255) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(100),
    verification_expires TIMESTAMP,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(identity_type, identity_value)
);

-- Таблица диалогов
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица сообщений
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    sender_type VARCHAR(20) NOT NULL, -- 'user', 'ai', 'admin'
    sender_id INTEGER, -- ID пользователя или администратора
    content TEXT,
    channel VARCHAR(20) NOT NULL, -- 'web', 'telegram', 'email'
    metadata JSONB, -- Дополнительная информация о сообщении
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Добавление языковых настроек в таблицу пользователей
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS last_token_check TIMESTAMP;

