CREATE TABLE IF NOT EXISTS user_identities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id)
);

-- Создаем индексы после создания таблицы
DO $$ 
BEGIN 
  -- Индекс для user_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'user_identities' AND indexname = 'idx_user_identities_user_id'
  ) THEN
    CREATE INDEX idx_user_identities_user_id ON user_identities(user_id);
  END IF;

  -- Индекс для provider и provider_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'user_identities' AND indexname = 'idx_user_identities_type_value'
  ) THEN
    CREATE INDEX idx_user_identities_type_value ON user_identities(provider, provider_id);
  END IF;
END $$;