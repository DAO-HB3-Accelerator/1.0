-- Миграция для изменения структуры таблицы users
-- Переносим данные из email и address в user_identities, затем преобразуем эти поля в first_name и last_name

-- Сначала проверяем, что все email и address уже существуют в user_identities
DO $$
BEGIN
  -- Переносим email в user_identities, если еще не перенесены
  INSERT INTO user_identities (user_id, provider, provider_id)
  SELECT id, 'email', email 
  FROM users 
  WHERE email IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM user_identities 
    WHERE user_id = users.id AND provider = 'email' AND provider_id = users.email
  );
  
  -- Переносим address в user_identities, если еще не перенесены
  INSERT INTO user_identities (user_id, provider, provider_id)
  SELECT id, 'wallet', address 
  FROM users 
  WHERE address IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM user_identities 
    WHERE user_id = users.id AND provider = 'wallet' AND provider_id = users.address
  );
  
  -- Логируем результаты миграции
  RAISE NOTICE 'Данные из колонок email и address перенесены в таблицу user_identities';
END $$;

-- Теперь изменяем структуру таблицы users
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_key,
  DROP CONSTRAINT IF EXISTS users_address_key;

-- Добавляем временные колонки
ALTER TABLE users
  ADD COLUMN first_name VARCHAR(255),
  ADD COLUMN last_name VARCHAR(255);

-- Убираем уникальность и переименовываем колонки email и address
ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL;

-- Удаляем колонки email и address
ALTER TABLE users
  DROP COLUMN email,
  DROP COLUMN address;

-- Добавляем комментарии к столбцам
COMMENT ON COLUMN users.first_name IS 'Имя пользователя';
COMMENT ON COLUMN users.last_name IS 'Фамилия пользователя';

-- Обновляем статистику таблицы
ANALYZE users; 