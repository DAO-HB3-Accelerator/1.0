CREATE OR REPLACE FUNCTION link_guest_messages(
  p_user_id INTEGER,
  p_guest_id VARCHAR(255)
) RETURNS VOID AS $$
DECLARE
  v_conversation_id INTEGER;
  v_count INTEGER;
  v_first_message TEXT;
  v_title TEXT;
BEGIN
  -- Логируем входные параметры
  RAISE NOTICE 'Linking messages for user_id: %, guest_id: %', p_user_id, p_guest_id;

  -- Проверяем наличие гостевых сообщений
  SELECT COUNT(*) INTO v_count
  FROM guest_messages
  WHERE guest_id = p_guest_id;
  
  RAISE NOTICE 'Found % guest messages', v_count;
  
  -- Если нет гостевых сообщений, выходим
  IF v_count = 0 THEN
    RAISE NOTICE 'No guest messages found, exiting';
    RETURN;
  END IF;

  -- Получаем первое сообщение для названия беседы
  SELECT content INTO v_first_message
  FROM guest_messages
  WHERE guest_id = p_guest_id AND NOT is_ai
  ORDER BY created_at ASC
  LIMIT 1;
  
  -- Формируем название диалога на основе первого сообщения
  v_title := CASE
    WHEN length(v_first_message) > 30 THEN substring(v_first_message from 1 for 30) || '...'
    ELSE v_first_message
  END;
  
  -- Создаем новую беседу
  INSERT INTO conversations (user_id, title, created_at, updated_at)
  VALUES (p_user_id, v_title, NOW(), NOW())
  RETURNING id INTO v_conversation_id;
  
  RAISE NOTICE 'Created conversation with id: % and title: %', v_conversation_id, v_title;

  -- Копируем сообщения пользователя
  WITH inserted_messages AS (
    INSERT INTO messages (
      conversation_id,
      sender_type,
      sender_id,
      content,
      role,
      channel,
      user_id,
      created_at
    )
    SELECT 
      v_conversation_id,
      CASE WHEN is_ai THEN 'assistant' ELSE 'user' END,
      CASE WHEN NOT is_ai THEN p_user_id ELSE NULL END,
      content,
      CASE WHEN is_ai THEN 'assistant' ELSE 'user' END,
      'chat',
      p_user_id,
      created_at
    FROM guest_messages
    WHERE guest_id = p_guest_id
      -- Проверка, чтобы избежать дублирования сообщений на основе содержимого и времени
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        WHERE m.conversation_id = v_conversation_id
        AND m.content = guest_messages.content
        AND m.created_at = guest_messages.created_at
      )
    ORDER BY created_at
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM inserted_messages;
  
  RAISE NOTICE 'Inserted % messages into conversation', v_count;
  
  -- НЕ удаляем гостевые сообщения, позволяем им существовать на всякий случай
  -- до автоматической очистки по cron job
END;
$$ LANGUAGE plpgsql;