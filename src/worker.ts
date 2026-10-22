/**
 * KaroMix Studio - Production Cloudflare Worker API + D1 Database
 * Works immediately on first GitHub-to-Cloudflare deploy (even before D1 binding is attached!)
 * and automatically upgrades to live SQLite persistence as soon as `DB` D1 binding is connected!
 */

export interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
}

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

let schemaInitialized = false;

async function ensureSchema(db: D1Database) {
  if (schemaInitialized) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      currency TEXT NOT NULL DEFAULT 'LKR',
      exports_this_month INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      youtube_url TEXT DEFAULT '',
      preset_key TEXT NOT NULL DEFAULT 'sinhala_ballad',
      musical_key TEXT NOT NULL DEFAULT '9',
      musical_scale TEXT NOT NULL DEFAULT 'minor',
      vocal_offset_ms INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL,
      duration_sec REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      voice_profile TEXT DEFAULT '',
      settings_json TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_presets_user_created ON custom_presets(user_id, created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_presets_public ON custom_presets(is_public, created_at DESC)`),
    db.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, plan, currency, exports_this_month)
                VALUES ('demo-singer-lk', 'singer@karomix.lk', 'Demo Singer (Sri Lanka)', 'free', 'LKR', 0)`),
  ]);
  schemaInitialized = true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });

    const url = new URL(request.url);
    const userId = request.headers.get("X-User-Id") || "demo-singer-lk";

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        engine: "Cloudflare Workers + Static Assets",
        d1Connected: Boolean(env.DB),
        zeroAudioCpuCost: true,
      });
    }

    if (url.pathname.startsWith("/api/")) {
      // Graceful fallback if user hasn't clicked "Bind D1 Database -> DB" in Cloudflare Settings yet!
      if (!env.DB) {
        return json({
          user: { id: userId, plan: "pro_lk", currency: "LKR", exports_this_month: 0 },
          projects: [],
          presets: [],
          d1Connected: false,
        });
      }

      await ensureSchema(env.DB);

      if (url.pathname === "/api/state" && request.method === "GET") {
        const user = await env.DB.prepare(
          `SELECT id, email, display_name, plan, currency, exports_this_month FROM users WHERE id = ?`
        ).bind(userId).first();

        const { results: projects } = await env.DB.prepare(
          `SELECT id, title, youtube_url, preset_key, musical_key, musical_scale, vocal_offset_ms, settings_json, duration_sec, created_at
           FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
        ).bind(userId).all();

        const { results: presets } = await env.DB.prepare(
          `SELECT id, name, voice_profile, settings_json, created_at
           FROM custom_presets WHERE user_id = ? OR is_public = 1 ORDER BY created_at DESC LIMIT 20`
        ).bind(userId).all();

        return json({ user, projects, presets, d1Connected: true });
      }

      if (url.pathname === "/api/projects" && request.method === "POST") {
        const body = await request.json<any>();
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO projects (id, user_id, title, youtube_url, preset_key, musical_key, musical_scale, vocal_offset_ms, settings_json, duration_sec)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          userId,
          body.title || "Untitled Cover Mix",
          body.youtube_url || "",
          body.preset_key || "sinhala_ballad",
          String(body.musical_key ?? "9"),
          body.musical_scale || "minor",
          Math.round(body.vocal_offset_ms || 0),
          JSON.stringify(body.settings || {}),
          Number(body.duration_sec || 0)
        ).run();
        return json({ ok: true, id }, 201);
      }

      if (url.pathname === "/api/presets" && request.method === "POST") {
        const body = await request.json<any>();
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO custom_presets (id, user_id, name, voice_profile, settings_json, is_public)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          userId,
          body.name || "My Voice Preset",
          body.voice_profile || "",
          JSON.stringify(body.settings || {}),
          body.is_public ? 1 : 0
        ).run();
        return json({ ok: true, id }, 201);
      }

      if (url.pathname === "/api/track-export" && request.method === "POST") {
        await env.DB.prepare(
          `UPDATE users SET exports_this_month = exports_this_month + 1 WHERE id = ?`
        ).bind(userId).run();
        const updated = await env.DB.prepare(
          `SELECT plan, exports_this_month FROM users WHERE id = ?`
        ).bind(userId).first();
        return json({ ok: true, user: updated });
      }

      if (url.pathname === "/api/upgrade-demo" && request.method === "POST") {
        const body = await request.json<any>();
        const plan = body.plan || "pro_lk";
        await env.DB.prepare(`UPDATE users SET plan = ? WHERE id = ?`).bind(plan, userId).run();
        return json({ ok: true, plan });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
