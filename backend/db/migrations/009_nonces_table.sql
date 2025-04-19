CREATE TABLE IF NOT EXISTS nonces (
  id SERIAL PRIMARY KEY,
  identity_value VARCHAR(255) NOT NULL,
  nonce VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индекс для быстрого поиска по identity_value
CREATE INDEX IF NOT EXISTS idx_nonces_identity_value ON nonces(identity_value);

-- Индекс для очистки просроченных nonce
CREATE INDEX IF NOT EXISTS idx_nonces_expires_at ON nonces(expires_at);