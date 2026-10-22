/**
 * KaroMix Studio Pro - Cloudflare Worker API + D1 Database
 * Ultra-lightweight (< 1ms CPU/request) using Web Crypto SHA-256 auth + Indexed D1 queries.
 */

export interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
}

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode("karomix-salt-v2:" + input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let schemaReady = false;

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'free',
      currency TEXT NOT NULL DEFAULT 'LKR',
      exports_this_month INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
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
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_presets_user_created ON custom_presets(user_id, created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_presets_public ON custom_presets(is_public, created_at DESC)`),
    db.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, plan, currency, exports_this_month)
                VALUES ('demo-singer-lk', 'guest@karomix.studio', 'Guest Studio', 'free', 'LKR', 0)`),
  ]);
  // Add password_hash column seamlessly if upgrading from v1 table
  try {
    await db.prepare(`ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''`).run();
  } catch (_) {}
  schemaReady = true;
}

async function resolveUserId(request: Request, db: D1Database): Promise<string> {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const now = Math.floor(Date.now() / 1000);
      const sess = await db
        .prepare(`SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?`)
        .bind(token, now)
        .first<{ user_id: string }>();
      if (sess?.user_id) return sess.user_id;
    }
  }
  return request.headers.get("X-User-Id") || "demo-singer-lk";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        engine: "Cloudflare Workers + Static Assets + D1",
        d1Connected: Boolean(env.DB),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!env.DB) {
        return json({
          user: { id: "demo-singer-lk", display_name: "Guest Studio", plan: "free", currency: "LKR", exports_this_month: 0 },
          projects: [],
          presets: [],
          d1Connected: false,
        });
      }

      await ensureSchema(env.DB);

      // Auth: Register
      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        const body = await request.json<any>();
        const email = String(body.email || "").trim().toLowerCase();
        const name = String(body.display_name || "").trim();
        const password = String(body.password || "");
        if (!email || !email.includes("@") || password.length < 4) {
          return json({ error: "Valid email and password (min 4 chars) required" }, 400);
        }
        const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
        if (existing) {
          return json({ error: "An account with this email already exists" }, 409);
        }
        const userId = crypto.randomUUID();
        const pwHash = await sha256Hex(email + ":" + password);
        await env.DB.prepare(
          `INSERT INTO users (id, email, display_name, password_hash, plan, currency, exports_this_month)
           VALUES (?, ?, ?, ?, 'free', 'LKR', 0)`
        ).bind(userId, email, name || email.split("@")[0], pwHash).run();

        const token = crypto.randomUUID() + "-" + crypto.randomUUID();
        const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
        await env.DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
          .bind(token, userId, expires).run();

        return json({
          ok: true,
          token,
          user: { id: userId, email, display_name: name || email.split("@")[0], plan: "free", exports_this_month: 0 },
        }, 201);
      }

      // Auth: Login
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const body = await request.json<any>();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const pwHash = await sha256Hex(email + ":" + password);
        const user = await env.DB.prepare(
          `SELECT id, email, display_name, password_hash, plan, currency, exports_this_month FROM users WHERE email = ?`
        ).bind(email).first<any>();

        if (!user || user.password_hash !== pwHash) {
          return json({ error: "Invalid email or password" }, 401);
        }
        const token = crypto.randomUUID() + "-" + crypto.randomUUID();
        const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
        await env.DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
          .bind(token, user.id, expires).run();

        delete user.password_hash;
        return json({ ok: true, token, user });
      }

      const userId = await resolveUserId(request, env.DB);

      if (url.pathname === "/api/state" && request.method === "GET") {
        const user = await env.DB.prepare(
          `SELECT id, email, display_name, plan, currency, exports_this_month FROM users WHERE id = ?`
        ).bind(userId).first();

        const { results: projects } = await env.DB.prepare(
          `SELECT id, title, youtube_url, preset_key, musical_key, musical_scale, vocal_offset_ms, settings_json, duration_sec, created_at
           FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
        ).bind(userId).all();

        const { results: presets } = await env.DB.prepare(
          `SELECT id, name, voice_profile, settings_json, created_at
           FROM custom_presets WHERE user_id = ? OR is_public = 1 ORDER BY created_at DESC LIMIT 30`
        ).bind(userId).all();

        return json({ user, projects, presets, d1Connected: true, authenticated: userId !== "demo-singer-lk" });
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

      if (url.pathname.startsWith("/api/projects/") && request.method === "DELETE") {
        const pid = url.pathname.split("/").pop();
        await env.DB.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).bind(pid, userId).run();
        return json({ ok: true });
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
          body.name || "My Voice Chain",
          body.voice_profile || "",
          JSON.stringify(body.settings || {}),
          body.is_public ? 1 : 0
        ).run();
        return json({ ok: true, id }, 201);
      }

      if (url.pathname === "/api/track-export" && request.method === "POST") {
        await env.DB.prepare(`UPDATE users SET exports_this_month = exports_this_month + 1 WHERE id = ?`)
          .bind(userId).run();
        const updated = await env.DB.prepare(`SELECT plan, exports_this_month FROM users WHERE id = ?`)
          .bind(userId).first();
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
