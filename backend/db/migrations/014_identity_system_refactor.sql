-- Комплексная миграция для реструктуризации системы идентификации пользователей
-- Объединяет изменения из миграций 014-018 в одну идемпотентную миграцию

-- 1. Создание таблицы guest_user_mapping, если она ещё не существует
CREATE TABLE IF NOT EXISTS guest_user_mapping (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(255) NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guest_id)
);

-- 2. Создание индексов для guest_user_mapping
CREATE INDEX IF NOT EXISTS idx_guest_user_mapping_guest_id ON guest_user_mapping(guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_user_mapping_user_id ON guest_user_mapping(user_id);

-- 3. Перенос гостевых идентификаторов из user_identities в guest_user_mapping
DO $$ 
BEGIN
  -- Выполняем только если есть гостевые идентификаторы в user_identities
  IF EXISTS (SELECT 1 FROM user_identities WHERE provider = 'guest') THEN
    INSERT INTO guest_user_mapping (user_id, guest_id, processed)
    SELECT user_id, provider_id, true
    FROM user_identities
    WHERE provider = 'guest'
    ON CONFLICT (guest_id) DO NOTHING;
    
    -- Удаляем перенесенные идентификаторы
    DELETE FROM user_identities WHERE provider = 'guest';
  END IF;
END $$;

-- 4. Добавление/обновление поля user_id в таблице messages
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    
    -- Создаем индекс
    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    
    -- Заполняем поле user_id из таблицы conversations
    UPDATE messages m
    SET user_id = c.user_id
    FROM conversations c
    WHERE m.conversation_id = c.id AND m.user_id IS NULL;
  END IF;
END $$;

-- 5. Создаем триггерную функцию для автоматического заполнения user_id
CREATE OR REPLACE FUNCTION set_message_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id 
    FROM conversations 
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Создаем триггер для автоматического заполнения user_id
DROP TRIGGER IF EXISTS trg_set_message_user_id ON messages;
CREATE TRIGGER trg_set_message_user_id
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION set_message_user_id();

-- 7. Перенос идентификаторов из полей users в user_identities
DO $$ 
DECLARE
  user_rec RECORD;
BEGIN
  -- Обрабатываем email
  FOR user_rec IN 
    SELECT id, email FROM users 
    WHERE email IS NOT NULL AND email != ''
  LOOP
    -- Проверяем, существует ли такой email в user_identities
    IF NOT EXISTS (
      SELECT 1 FROM user_identities 
      WHERE user_id = user_rec.id AND provider = 'email' AND provider_id = user_rec.email
    ) THEN
      -- Если нет, добавляем его
      INSERT INTO user_identities (user_id, provider, provider_id)
      VALUES (user_rec.id, 'email', LOWER(user_rec.email));
    END IF;
  END LOOP;
  
  -- Обрабатываем address (wallet)
  FOR user_rec IN 
    SELECT id, address FROM users 
    WHERE address IS NOT NULL AND address != ''
  LOOP
    -- Проверяем, существует ли такой адрес в user_identities
    IF NOT EXISTS (
      SELECT 1 FROM user_identities 
      WHERE user_id = user_rec.id AND provider = 'wallet' AND provider_id = LOWER(user_rec.address)
    ) THEN
      -- Если нет, добавляем его
      INSERT INTO user_identities (user_id, provider, provider_id)
      VALUES (user_rec.id, 'wallet', LOWER(user_rec.address));
    END IF;
  END LOOP;
END $$;

-- 8. Очистка устаревших полей в таблице users
UPDATE users 
SET 
  email = NULL,
  address = NULL,
  username = NULL
WHERE 
  email IS NOT NULL OR address IS NOT NULL OR username IS NOT NULL;

-- 9. Нормализация регистра для email и wallet идентификаторов
UPDATE user_identities
SET provider_id = LOWER(provider_id)
WHERE (provider = 'wallet' OR provider = 'email') AND provider_id != LOWER(provider_id);

-- 10. Ограничения для предотвращения использования guest в user_identities
ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS check_provider_not_guest;
ALTER TABLE user_identities ADD CONSTRAINT check_provider_not_guest
  CHECK (provider != 'guest');

-- 11. Ограничение на допустимые типы идентификаторов
ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS check_provider_allowed;
ALTER TABLE user_identities ADD CONSTRAINT check_provider_allowed
  CHECK (provider IN ('email', 'wallet', 'telegram'));

-- 12. Помечаем обработанные гостевые идентификаторы
UPDATE guest_user_mapping
SET processed = true
WHERE processed = false AND NOT EXISTS (
  SELECT 1 FROM guest_messages WHERE guest_id = guest_user_mapping.guest_id
);

-- 13. Добавляем комментарии к таблицам и полям
COMMENT ON TABLE users IS 'Основная таблица пользователей системы';
COMMENT ON TABLE user_identities IS 'Таблица идентификаторов пользователей (email, wallet, telegram)';
COMMENT ON TABLE guest_user_mapping IS 'Таблица связи гостевых идентификаторов с пользователями';
COMMENT ON TABLE conversations IS 'Диалоги пользователей с системой';
COMMENT ON TABLE messages IS 'Сообщения пользователей и системы';
COMMENT ON TABLE guest_messages IS 'Временное хранилище сообщений от неавторизованных пользователей';

COMMENT ON COLUMN users.id IS 'Уникальный идентификатор пользователя';
COMMENT ON COLUMN users.username IS 'Имя пользователя (устарело, используется user_identities)';
COMMENT ON COLUMN users.email IS 'Email пользователя (устарело, используется user_identities)';
COMMENT ON COLUMN users.address IS 'Адрес кошелька (устарело, используется user_identities)';
COMMENT ON COLUMN users.status IS 'Статус пользователя (active, blocked)';
COMMENT ON COLUMN users.role IS 'Роль пользователя (user, admin)';

COMMENT ON COLUMN user_identities.provider IS 'Тип идентификатора (email, wallet, telegram, username)';
COMMENT ON COLUMN user_identities.provider_id IS 'Значение идентификатора';

COMMENT ON COLUMN guest_user_mapping.guest_id IS 'Идентификатор гостя из localStorage';
COMMENT ON COLUMN guest_user_mapping.processed IS 'Флаг, показывающий, были ли обработаны гостевые сообщения';

-- 14. Создаем диагностическую функцию
CREATE OR REPLACE FUNCTION verify_identity_system()
RETURNS TABLE (
  users_with_address INTEGER,
  users_with_email INTEGER,
  wallet_identities INTEGER,
  email_identities INTEGER,
  telegram_identities INTEGER,
  guest_mapping_count INTEGER,
  guest_messages_count INTEGER,
  duplicate_provider_ids INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM users WHERE address IS NOT NULL),
    (SELECT COUNT(*) FROM users WHERE email IS NOT NULL),
    (SELECT COUNT(*) FROM user_identities WHERE provider = 'wallet'),
    (SELECT COUNT(*) FROM user_identities WHERE provider = 'email'),
    (SELECT COUNT(*) FROM user_identities WHERE provider = 'telegram'),
    (SELECT COUNT(*) FROM guest_user_mapping),
    (SELECT COUNT(*) FROM guest_messages),
    (SELECT COUNT(*) FROM 
      (SELECT provider, provider_id, COUNT(*) FROM user_identities 
       GROUP BY provider, provider_id HAVING COUNT(*) > 1) AS dups);
END;
$$ LANGUAGE plpgsql; 