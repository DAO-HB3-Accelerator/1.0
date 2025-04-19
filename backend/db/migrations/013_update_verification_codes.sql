-- Изменяем ограничение для поля user_id в таблице verification_codes
ALTER TABLE verification_codes 
    ALTER COLUMN user_id DROP NOT NULL;

-- Обновляем комментарий в информационной схеме
COMMENT ON COLUMN verification_codes.user_id IS 'ID пользователя (может быть NULL для временных кодов)';

-- Логирование для отслеживания выполнения миграции
DO $$
BEGIN
    RAISE NOTICE 'Migration 012: Updated verification_codes table to allow NULL values for user_id';
END $$; 