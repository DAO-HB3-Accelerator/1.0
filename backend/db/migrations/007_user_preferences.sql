CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  preference_key VARCHAR(50) NOT NULL,
  preference_value TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, preference_key)
);

-- Добавляем колонку metadata, если её нет
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_preferences' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Базовые настройки
DO $$ 
BEGIN 
  INSERT INTO user_preferences (user_id, preference_key, preference_value, metadata)
  SELECT id, 'language', 'ru', '{"available": ["ru", "en"]}'::jsonb
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM user_preferences 
    WHERE preference_key = 'language' AND user_id = u.id
  );
END $$;

DO $$ 
BEGIN 
  INSERT INTO user_preferences (user_id, preference_key, preference_value, metadata)
  SELECT id, 'notifications', 'true', '{"channels": ["email", "telegram"]}'::jsonb
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM user_preferences 
    WHERE preference_key = 'notifications' AND user_id = u.id
  );
END $$;