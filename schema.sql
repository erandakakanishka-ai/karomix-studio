-- SingCraft Studio v11.0 - Cloudflare D1 Database Schema (Human Blog CMS + Global Timezone Quota + 30-Day Free Pro Pass + Auth + Contact)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT DEFAULT '',
  display_name TEXT DEFAULT 'Guest Artist',
  plan TEXT DEFAULT 'free',
  currency TEXT DEFAULT 'USD',
  exports_this_month INTEGER DEFAULT 0,
  pro_until INTEGER DEFAULT 0,
  daily_date TEXT DEFAULT '',
  daily_exports INTEGER DEFAULT 0,
  auth_provider TEXT DEFAULT 'email',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  youtube_url TEXT DEFAULT '',
  preset_key TEXT DEFAULT 'smule_hall',
  musical_key TEXT DEFAULT 'A',
  musical_scale TEXT DEFAULT 'minor',
  vocal_offset_ms INTEGER DEFAULT 0,
  settings_json TEXT NOT NULL,
  duration_sec REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  voice_profile TEXT DEFAULT 'balanced',
  settings_json TEXT NOT NULL,
  is_public INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT DEFAULT 'General Inquiry',
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Studio Guide',
  cover_image TEXT DEFAULT '/assets/studio-girl-card.jpg',
  excerpt TEXT DEFAULT '',
  content TEXT NOT NULL,
  author_name TEXT DEFAULT 'Editor',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (id, email, password_hash, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports, auth_provider)
VALUES ('demo-singer-global', 'guest@singcraftstudio.com', '', 'Guest Artist', 'free', 'USD', 0, 0, '', 0, 'guest');
