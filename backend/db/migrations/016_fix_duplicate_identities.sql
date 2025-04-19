-- Миграция для исправления дублирующихся записей в user_identities из-за разного регистра букв
-- Исправляем записи для провайдеров wallet и email

-- Сначала удаляем существующее ограничение уникальности
ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS user_identities_provider_provider_id_key;

-- Создаем временную таблицу для хранения идентификаторов, которые нужно обработать
CREATE TEMP TABLE duplicate_identities AS
SELECT 
  provider, 
  LOWER(provider_id) as normalized_provider_id,
  array_agg(id) as id_list,
  array_agg(user_id) as user_id_list
FROM user_identities
WHERE provider IN ('wallet', 'email')
GROUP BY provider, LOWER(provider_id)
HAVING COUNT(*) > 1;

-- Логируем количество найденных дубликатов
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM duplicate_identities;
  RAISE NOTICE 'Найдено % групп дублирующихся идентификаторов', duplicate_count;
END $$;

-- Обновляем все записи, приводя provider_id к нижнему регистру
UPDATE user_identities
SET provider_id = LOWER(provider_id)
WHERE provider IN ('wallet', 'email');

-- Удаляем дублирующиеся записи, оставляя только одну для каждой комбинации (provider, provider_id)
WITH 
  duplicates AS (
    SELECT 
      id,
      provider,
      provider_id,
      ROW_NUMBER() OVER (
        PARTITION BY provider, provider_id 
        ORDER BY id
      ) as row_num
    FROM user_identities
    WHERE provider IN ('wallet', 'email')
  )
DELETE FROM user_identities
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- Удаляем дублирующиеся записи для одного пользователя
WITH 
  user_duplicates AS (
    SELECT 
      id,
      user_id,
      provider,
      provider_id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, provider, provider_id 
        ORDER BY id
      ) as row_num
    FROM user_identities
    WHERE provider IN ('wallet', 'email')
  )
DELETE FROM user_identities
WHERE id IN (
  SELECT id FROM user_duplicates WHERE row_num > 1
);

-- Добавляем обратно ограничение уникальности
ALTER TABLE user_identities 
  ADD CONSTRAINT user_identities_provider_provider_id_key 
  UNIQUE (provider, provider_id);

-- Добавляем уникальный индекс для пользователей
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'user_identities' AND indexname = 'unique_idx_user_identities_user_provider_provider_id'
  ) THEN
    CREATE UNIQUE INDEX unique_idx_user_identities_user_provider_provider_id 
    ON user_identities(user_id, provider, provider_id);
  END IF;
END $$;

-- Логируем завершение миграции
DO $$
BEGIN
  RAISE NOTICE 'Миграция для исправления дублирующихся идентификаторов завершена';
END $$; 