CREATE TABLE IF NOT EXISTS optcg_backup (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vault_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS optcg_backup_operations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS optcg_backup_history (
  revision INTEGER PRIMARY KEY,
  saved_at TEXT NOT NULL,
  data TEXT NOT NULL
);
