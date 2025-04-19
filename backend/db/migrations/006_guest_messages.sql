CREATE TABLE IF NOT EXISTS guest_messages (
  id SERIAL PRIMARY KEY,
  guest_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  language VARCHAR(10) DEFAULT 'en',
  is_ai BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'guest_messages' AND indexname = 'idx_guest_messages_guest_id'
  ) THEN
    CREATE INDEX idx_guest_messages_guest_id ON guest_messages(guest_id);
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'guest_message_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN guest_message_id INTEGER;
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_messages_guest_message'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT fk_messages_guest_message
    FOREIGN KEY (guest_message_id)
    REFERENCES guest_messages(id)
    ON DELETE SET NULL;
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'messages' AND indexname = 'idx_messages_guest_message_id'
  ) THEN
    CREATE INDEX idx_messages_guest_message_id ON messages(guest_message_id);
  END IF;
END $$;