CREATE TABLE IF NOT EXISTS ipfs_publications (
  id SERIAL PRIMARY KEY,
  cid TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMP DEFAULT NOW()
); 