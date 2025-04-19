-- Проверяем существование типа user_role
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
  END IF;
END $$;

-- Удаляем лишние колонки и связи
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_id_fkey;
ALTER TABLE users DROP COLUMN IF EXISTS role_id;

-- Добавляем колонку role если её нет
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role user_role DEFAULT 'user'::user_role;
  END IF;
END $$;

-- Удаляем лишние триггеры и функции
DROP TRIGGER IF EXISTS sync_identity_type_trigger ON user_identities;
DROP TRIGGER IF EXISTS user_identity_role_check ON user_identities;
DROP TRIGGER IF EXISTS check_admin_role_trigger ON user_identities;
DROP FUNCTION IF EXISTS sync_identity_type() CASCADE;
DROP FUNCTION IF EXISTS update_user_role() CASCADE;
DROP FUNCTION IF EXISTS check_admin_role() CASCADE;

-- Создаем функцию для проверки баланса токенов
CREATE OR REPLACE FUNCTION check_token_balance(wallet_address VARCHAR) 
RETURNS BOOLEAN AS $$
BEGIN
  -- Эта функция будет вызываться из auth-service.js
  -- Здесь только заглушка, реальная проверка в JavaScript
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Создаем функцию проверки роли
CREATE OR REPLACE FUNCTION check_admin_role() 
RETURNS TRIGGER AS $$
BEGIN
  -- Не меняем роль при обновлении других типов идентификаторов
  IF NEW.provider != 'wallet' THEN
    RETURN NEW;
  END IF;

  -- По умолчанию устанавливаем роль user
  UPDATE users 
  SET role = 'user'::user_role
  WHERE id = NEW.user_id;

  -- Роль админа будет назначаться через auth-service.js после проверки баланса токенов
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
CREATE TRIGGER check_admin_role_trigger
AFTER INSERT OR UPDATE ON user_identities
FOR EACH ROW
EXECUTE FUNCTION check_admin_role();

-- Сбрасываем все роли на user
UPDATE users SET role = 'user'::user_role;

-- Создаем индекс для оптимизации поиска по роли
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Создаем функцию для безопасного обновления роли
CREATE OR REPLACE FUNCTION update_user_role(p_user_id INTEGER, p_role user_role) 
RETURNS VOID AS $$
BEGIN
  UPDATE users 
  SET role = p_role,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;