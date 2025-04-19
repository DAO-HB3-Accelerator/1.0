-- Создание таблицы для хранения истории диалогов
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    channel VARCHAR(20) NOT NULL, -- 'web', 'telegram', 'email'
    sender_type VARCHAR(10) NOT NULL, -- 'user', 'ai', 'admin'
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_channel ON chat_history(channel); 