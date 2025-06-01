-- Миграция для динамических пользовательских таблиц (аналог Notion)

CREATE TABLE IF NOT EXISTS user_tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS user_columns (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES user_tables(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- text, number, select, multiselect, date, etc.
  options JSONB DEFAULT NULL, -- для select/multiselect
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_rows (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES user_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_cell_values (
  id SERIAL PRIMARY KEY,
  row_id INTEGER NOT NULL REFERENCES user_rows(id) ON DELETE CASCADE,
  column_id INTEGER NOT NULL REFERENCES user_columns(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(row_id, column_id)
); 