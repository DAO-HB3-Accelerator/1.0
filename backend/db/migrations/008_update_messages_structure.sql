-- Добавляем новые поля в messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user',
ADD COLUMN IF NOT EXISTS guest_message_id INTEGER,
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;

-- Создаем функцию для связывания сообщений
CREATE OR REPLACE FUNCTION link_guest_messages(
  p_user_id INTEGER,
  p_guest_id VARCHAR(255)
) RETURNS VOID AS $$
DECLARE
  v_conversation_id INTEGER;
BEGIN
  -- Создаем новую беседу для гостевых сообщений
  INSERT INTO conversations (created_at, updated_at)
  VALUES (NOW(), NOW())
  RETURNING id INTO v_conversation_id;

  -- Копируем гостевые сообщения в основную таблицу
  INSERT INTO messages (
    conversation_id,
    sender_type,
    sender_id,
    content,
    role,
    channel,
    guest_message_id,
    created_at
  )
  SELECT 
    v_conversation_id,
    CASE WHEN is_ai THEN 'assistant' ELSE 'user' END,
    CASE WHEN NOT is_ai THEN p_user_id ELSE NULL END,
    content,
    CASE WHEN is_ai THEN 'assistant' ELSE 'user' END,
    'chat',
    id,
    created_at
  FROM guest_messages
  WHERE guest_id = p_guest_id
  ORDER BY created_at;
END;
$$ LANGUAGE plpgsql; 