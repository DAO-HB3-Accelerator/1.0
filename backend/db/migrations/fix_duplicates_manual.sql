-- Скрипт для ручного исправления дублирующихся записей в базе данных

-- 1. Удаляем существующее ограничение уникальности
ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS user_identities_provider_provider_id_key;

-- 2. Получаем список идентификаторов с дублирующимися записями
SELECT 
  provider, 
  LOWER(provider_id) as normalized_provider_id,
  array_agg(id) as id_list
FROM user_identities
WHERE provider IN ('wallet', 'email')
GROUP BY provider, LOWER(provider_id)
HAVING COUNT(*) > 1;

-- 3. Удаляем конкретные дублирующиеся записи по ID (например, ID=2)
DELETE FROM user_identities WHERE id = 2;

-- 4. Обновляем все записи email и wallet к нижнему регистру
UPDATE user_identities
SET provider_id = LOWER(provider_id)
WHERE provider IN ('wallet', 'email');

-- 5. Проверяем, что дубликаты удалены
SELECT 
  provider, 
  provider_id,
  COUNT(*) as count
FROM user_identities
GROUP BY provider, provider_id
HAVING COUNT(*) > 1;

-- 6. Добавляем обратно ограничение уникальности
ALTER TABLE user_identities 
  ADD CONSTRAINT user_identities_provider_provider_id_key 
  UNIQUE (provider, provider_id);

-- 7. Создаем дополнительный индекс для (user_id, provider, provider_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_idx_user_identities_user_provider_provider_id 
ON user_identities(user_id, provider, provider_id); 