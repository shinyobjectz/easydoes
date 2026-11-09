-- easydoes accounts (D1). Boards live in each group's Durable Object.
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, phone TEXT UNIQUE, name TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL DEFAULT '🙂',
  color TEXT NOT NULL DEFAULT '#0a84ff', agent INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS codes (phone TEXT PRIMARY KEY, hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, person_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL, invite TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  group_id TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, person_id)
);
CREATE INDEX IF NOT EXISTS members_person ON members (person_id);
-- the raea admin agent, a member of the groups it's added to
INSERT OR IGNORE INTO people (id, phone, name, emoji, color, agent, created_at) VALUES ('agent-raea', NULL, 'raea', '🐈‍⬛', '#bf5af2', 1, 0);
