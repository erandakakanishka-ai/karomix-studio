-- ============================================================================
-- KaroMix Studio - Cloudflare D1 (Serverless SQLite) Production Schema
-- Optimized with composite indexes to stay well inside D1 Free Tier (5M reads/day)
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro_lk' | 'pro_global'
  currency TEXT NOT NULL DEFAULT 'LKR',
  exports_this_month INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  youtube_url TEXT DEFAULT '',
  preset_key TEXT NOT NULL DEFAULT 'sinhala_ballad',
  musical_key TEXT NOT NULL DEFAULT 'A',
  musical_scale TEXT NOT NULL DEFAULT 'minor',
  vocal_offset_ms INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL,
  duration_sec REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  voice_profile TEXT DEFAULT '',
  settings_json TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Critical D1 Indexes (Zero Full-Table Scans!)
CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presets_user_created ON custom_presets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presets_public ON custom_presets(is_public, created_at DESC);

-- Seed default demo user
INSERT OR IGNORE INTO users (id, email, display_name, plan, currency, exports_this_month)
VALUES ('demo-singer-lk', 'singer@karomix.lk', 'Demo Singer (Sri Lanka)', 'free', 'LKR', 1);
