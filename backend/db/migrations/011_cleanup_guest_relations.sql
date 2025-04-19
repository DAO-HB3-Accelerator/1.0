-- Удаляем колонку guest_message_id из таблицы messages
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'guest_message_id'
  ) THEN
    ALTER TABLE messages DROP COLUMN guest_message_id;
  END IF;
END $$;

-- Удаляем гостевые идентификаторы из user_identities
DELETE FROM user_identities WHERE provider = 'guest';

-- Удаляем индекс для guest_message_id если он существует
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'messages' AND indexname = 'idx_messages_guest_message_id'
  ) THEN
    DROP INDEX idx_messages_guest_message_id;
  END IF;
END $$; 