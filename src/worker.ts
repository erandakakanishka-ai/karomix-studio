export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  GOOGLE_CLIENT_ID?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Timezone',
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAILY_FREE_LIMIT = 2;

let schemaChecked = false;

async function ensureSchema(db?: D1Database) {
  if (!db || schemaChecked) return;
  const alterStatements = [
    `ALTER TABLE users ADD COLUMN pro_until INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN daily_date TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN daily_exports INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email'`,
    `CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT DEFAULT 'General Inquiry',
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of alterStatements) {
    try { await db.prepare(sql).run(); } catch (_) {}
  }
  schemaChecked = true;
}

// Accurate Global Local-Day Calculator (Uses Cloudflare Edge IP Geo Timezone first + Browser IANA fallback)
function getUserLocalDayInfo(request: Request) {
  const cfTz = String((request as any).cf?.timezone || '').trim();
  const headerTz = String(request.headers.get('X-Client-Timezone') || '').trim();
  for (const candidate of [cfTz, headerTz, 'UTC']) {
    if (!candidate) continue;
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: candidate,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const parts: Record<string, string> = {};
      for (const p of fmt.formatToParts(new Date())) {
        if (p.type !== 'literal') parts[p.type] = p.value;
      }
      const localDate = `${parts.year}-${parts.month}-${parts.day}`;
      const elapsedMin = Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
      const minutesToMidnight = Math.max(1, 1440 - elapsedMin);
      return { tz: candidate, localDate, minutesToMidnight };
    } catch (_) {}
  }
  return { tz: 'UTC', localDate: new Date().toISOString().slice(0, 10), minutesToMidnight: 720 };
}

function buildQuotaSummary(user: Record<string, any> | null, authenticated: boolean, tzInfo: { tz: string; localDate: string; minutesToMidnight: number }) {
  const now = Date.now();
  const proUntil = authenticated && user ? Number(user.pro_until || 0) : 0;
  const manualPro = authenticated && user && user.plan && user.plan !== 'free';
  const proActive = Boolean(manualPro || proUntil > now);
  const proDaysLeft = proUntil > now ? Math.max(1, Math.ceil((proUntil - now) / 86400000)) : 0;
  const dailyUsed = authenticated && user && user.daily_date === tzInfo.localDate
    ? Number(user.daily_exports || 0)
    : 0;
  return {
    proActive,
    proDaysLeft,
    proUntil,
    dailyUsed,
    dailyLimit: DAILY_FREE_LIMIT,
    timezone: tzInfo.tz,
    localDate: tzInfo.localDate,
    minutesToMidnight: tzInfo.minutesToMidnight,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode('karomix_salt_v1:' + input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function resolveUser(request: Request, env: Env) {
  await ensureSchema(env.DB);
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (env.DB && token) {
    try {
      const sess = await env.DB.prepare(
        `SELECT u.id, u.email, u.display_name, u.plan, u.currency, u.exports_this_month,
                u.pro_until, u.daily_date, u.daily_exports, u.auth_provider
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
      ).bind(token).first();
      if (sess) return { user: sess as Record<string, any>, authenticated: true };
    } catch (_) {}
  }

  const fallbackId = 'demo-singer-global';
  if (env.DB) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, display_name, plan, currency, exports_this_month)
       VALUES (?, 'guest@karomixstudio.com', '', 'Guest Artist', 'free', 'USD', 0)`
    ).bind(fallbackId).run();
    const u = await env.DB.prepare(
      'SELECT id, email, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports FROM users WHERE id = ?'
    ).bind(fallbackId).first();
    if (u) return { user: u as Record<string, any>, authenticated: false };
  }

  return {
    user: { id: fallbackId, email: 'guest@karomixstudio.com', display_name: 'Guest Artist', plan: 'free', currency: 'USD', exports_this_month: 0, pro_until: 0, daily_date: '', daily_exports: 0 },
    authenticated: false,
  };
}

// Instant Zero-Key Karaoke Video Search (YouTube Primary + Piped/Invidious Public Fallbacks)
async function searchKaraokeVideos(rawQuery: string) {
  const clean = rawQuery.trim();
  if (!clean) return [];
  const lower = clean.toLowerCase();
  const fullQuery = lower.includes('karaoke') || lower.includes('instrumental')
    ? clean
    : `${clean} karaoke version`;

  try {
    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(fullQuery)}&hl=en`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }
    );
    if (ytRes.ok) {
      const html = await ytRes.text();
      const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
      if (match) {
        const data = JSON.parse(match[1]);
        const sections =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const candidates: Array<Record<string, string>> = [];
        for (const sec of sections) {
          const items = sec?.itemSectionRenderer?.contents || [];
          for (const it of items) {
            const vr = it?.videoRenderer;
            if (!vr?.videoId) continue;
            const title = (vr.title?.runs || []).map((r: any) => r.text || '').join('');
            const channel = (vr.ownerText?.runs || []).map((r: any) => r.text || '').join('');
            const duration = vr.lengthText?.simpleText || '';
            candidates.push({
              id: vr.videoId,
              title,
              channel,
              duration,
              thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
            });
            if (candidates.length >= 16) break;
          }
          if (candidates.length >= 16) break;
        }
        if (candidates.length > 0) {
          const verified = await Promise.all(
            candidates.map(async (c) => {
              try {
                const check = await fetch(
                  `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(c.id)}&format=json`
                );
                return check.status === 200 ? c : null;
              } catch (_) {
                return c;
              }
            })
          );
          const playable = verified.filter(Boolean) as Array<Record<string, string>>;
          playable.sort((a, b) => {
            const ak = /karaoke|instrumental|backing/i.test(a.title) ? 0 : 1;
            const bk = /karaoke|instrumental|backing/i.test(b.title) ? 0 : 1;
            return ak - bk;
          });
          if (playable.length > 0) return playable.slice(0, 8);
          return candidates.slice(0, 6);
        }
      }
    }
  } catch (_) {}

  const mirrors = [
    `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(fullQuery)}&type=video`,
    `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(fullQuery)}&type=video`,
  ];
  for (const url of mirrors) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) continue;
      const arr = (await r.json()) as any[];
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.slice(0, 8).map((v) => ({
          id: v.videoId,
          title: v.title || 'Karaoke Track',
          channel: v.author || 'Karaoke Channel',
          duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, '0')}` : '',
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        }));
      }
    } catch (_) {}
  }

  return [];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      const tzInfo = getUserLocalDayInfo(request);

      // 1. Instant Song Name -> Karaoke Video Search (7-Day Cloudflare Edge Cache)
      if (url.pathname === '/api/search-karaoke' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json({ videos: [] });

        const cacheKey = new Request(`https://karomix-edge-cache.local/karaoke-v4?q=${encodeURIComponent(q.toLowerCase())}`);
        const edgeCache = (globalThis as any).caches?.default;
        if (edgeCache) {
          const hit = await edgeCache.match(cacheKey);
          if (hit) return hit;
        }

        const videos = await searchKaraokeVideos(q);
        const resp = new Response(JSON.stringify({ videos }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=604800, s-maxage=604800',
            ...CORS_HEADERS,
          },
        });
        if (edgeCache && videos.length > 0) {
          try { await edgeCache.put(cacheKey, resp.clone()); } catch (_) {}
        }
        return resp;
      }

      // 2. Universal Multi-Source Global + Regional Lyrics Search (7-Day Edge Cached)
      if (url.pathname === '/api/lyrics' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json({ track: null });

        const cleanQ = q
          .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
          .replace(/\b(karaoke|instrumental|lyrics|lyric|with|on\s+screen|version|official|video|audio|hd|hq|original|key|cover|minus\s+one|track)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim() || q;

        const cacheKey = new Request(`https://karomix-cache.local/v7/lyrics?q=${encodeURIComponent(cleanQ.toLowerCase())}`);
        const edgeCache = (globalThis as any).caches?.default;
        if (edgeCache) {
          const cachedHit = await edgeCache.match(cacheKey);
          if (cachedHit) return cachedHit;
        }

        let foundTrack: any = null;

        const candidates = [cleanQ];
        if (cleanQ.includes('-')) {
          candidates.push(...cleanQ.split('-').map((s) => s.trim()).filter((s) => s.length > 2));
        }
        for (const cand of candidates) {
          if (foundTrack) break;
          try {
            const lrcRes = await fetch(
              `https://lrclib.net/api/search?q=${encodeURIComponent(cand)}`,
              { headers: { 'User-Agent': 'KaroMixStudio/10.0 (https://karomix-studio.pages.dev)' } }
            );
            if (lrcRes.ok) {
              const list = (await lrcRes.json()) as any[];
              foundTrack = list.find((item) => item.plainLyrics) || list.find((item) => item.syncedLyrics) || null;
            }
          } catch (_) {}
        }

        if (!foundTrack) {
          try {
            const smCacheKey = new Request('https://karomix-cache.local/v7/lyrihub-sitemap');
            let xml = '';
            if (edgeCache) {
              const smHit = await edgeCache.match(smCacheKey);
              if (smHit) xml = await smHit.text();
            }
            if (!xml) {
              const smRes = await fetch('https://www.lyrihub.lk/sitemap-0.xml');
              if (smRes.ok) {
                xml = await smRes.text();
                if (edgeCache && xml.length > 1000) {
                  await edgeCache.put(smCacheKey, new Response(xml, { headers: { 'Cache-Control': 'public, max-age=604800' } }));
                }
              }
            }
            if (xml) {
              const norm = (s: string) =>
                s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/th/g, 't').replace(/dh/g, 'd').replace(/sh/g, 's');
              const qTokens = norm(cleanQ).split(/\s+/).filter((t) => t.length >= 3);
              if (qTokens.length > 0) {
                let bestUrl = '';
                let bestScore = 0;
                const re = /<loc>(https:\/\/www\.lyrihub\.lk\/song\/([^/]+)\/)<\/loc>/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(xml)) !== null) {
                  const slugNorm = norm(m[2]);
                  let matched = 0;
                  for (const tok of qTokens) {
                    if (slugNorm.includes(tok)) matched++;
                  }
                  if (matched > 0) {
                    const score = matched / Math.max(qTokens.length, slugNorm.split(/\s+/).length * 0.65);
                    if (score > bestScore) {
                      bestScore = score;
                      bestUrl = m[1];
                    }
                  }
                }
                if (bestUrl && bestScore >= 0.45) {
                  const pageRes = await fetch(bestUrl);
                  if (pageRes.ok) {
                    const pageHtml = await pageRes.text();
                    const blockMatch = pageHtml.match(/class="lyri-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                    if (blockMatch) {
                      const plain = blockMatch[1]
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&#39;|&rsquo;/g, "'")
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, '&')
                        .trim();
                      if (plain.length > 20) {
                        foundTrack = { plainLyrics: plain };
                      }
                    }
                  }
                }
              }
            }
          } catch (_) {}
        }

        const outResp = new Response(JSON.stringify({ track: foundTrack }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': foundTrack ? 'public, max-age=604800, s-maxage=604800' : 'no-store',
            ...CORS_HEADERS,
          },
        });
        if (edgeCache && foundTrack) {
          try { await edgeCache.put(cacheKey, outResp.clone()); } catch (_) {}
        }
        return outResp;
      }

      // 3a. Official Google Sign-In (Gmail 1-Click OAuth Token Verification -> Instant 30-Day FREE Pro Pass!)
      if (url.pathname === '/api/auth/google' && request.method === 'POST') {
        await ensureSchema(env.DB);
        const body: any = await request.json();
        const credential = String(body.credential || '').trim();
        if (!credential) return json({ error: 'Missing Google credential token.' }, 400);
        if (!env.DB) return json({ error: 'Database unavailable' }, 500);

        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (!verifyRes.ok) {
          return json({ error: 'Invalid or expired Google sign-in token.' }, 401);
        }
        const gUser: any = await verifyRes.json();
        if (env.GOOGLE_CLIENT_ID && gUser.aud !== env.GOOGLE_CLIENT_ID) {
          return json({ error: 'Google Client ID mismatch.' }, 401);
        }
        const email = String(gUser.email || '').trim().toLowerCase();
        if (!email || String(gUser.email_verified) !== 'true') {
          return json({ error: 'Verified Gmail address required.' }, 401);
        }
        const displayName = String(gUser.name || gUser.given_name || email.split('@')[0] || 'Artist').trim();

        let existing: any = await env.DB.prepare(
          'SELECT id, email, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports FROM users WHERE email = ?'
        ).bind(email).first();

        let isNewUser = false;
        if (!existing) {
          isNewUser = true;
          const userId = crypto.randomUUID();
          const proUntil = Date.now() + THIRTY_DAYS_MS;
          await env.DB.prepare(
            `INSERT INTO users (id, email, password_hash, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports, auth_provider)
             VALUES (?, ?, '', ?, 'free', 'USD', 0, ?, ?, 0, 'google')`
          ).bind(userId, email, displayName, proUntil, tzInfo.localDate).run();
          existing = {
            id: userId, email, display_name: displayName, plan: 'free', currency: 'USD',
            exports_this_month: 0, pro_until: proUntil, daily_date: tzInfo.localDate, daily_exports: 0,
          };
        } else if (!Number(existing.pro_until || 0)) {
          // One-time 30-day Free Pro Welcome Gift if never granted before
          const proUntil = Date.now() + THIRTY_DAYS_MS;
          await env.DB.prepare('UPDATE users SET pro_until = ?, auth_provider = ? WHERE id = ?')
            .bind(proUntil, 'google', existing.id).run();
          existing.pro_until = proUntil;
        }

        const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
        await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, existing.id).run();
        const quota = buildQuotaSummary(existing, true, tzInfo);
        return json({ ok: true, isNewUser, token, user: existing, quota });
      }

      // 3b. Auth Register (Automatically grants 30 Full Days FREE Pro Studio Pass!)
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        await ensureSchema(env.DB);
        const body: any = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const displayName = String(body.display_name || email.split('@')[0] || 'Artist').trim();

        if (!email || !email.includes('@') || password.length < 4) {
          return json({ error: 'Enter a valid Gmail / email address and password (min 4 characters).' }, 400);
        }
        if (!env.DB) return json({ error: 'Database unavailable' }, 500);

        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (existing) {
          return json({ error: 'This email is already registered. Please switch to Sign In.' }, 409);
        }

        const userId = crypto.randomUUID();
        const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
        const hash = await sha256Hex(password);
        const proUntil = Date.now() + THIRTY_DAYS_MS;

        await env.DB.prepare(
          `INSERT INTO users (id, email, password_hash, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports, auth_provider)
           VALUES (?, ?, ?, ?, 'free', 'USD', 0, ?, ?, 0, 'email')`
        ).bind(userId, email, hash, displayName, proUntil, tzInfo.localDate).run();

        await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, userId).run();

        const userObj = {
          id: userId, email, display_name: displayName, plan: 'free', currency: 'USD',
          exports_this_month: 0, pro_until: proUntil, daily_date: tzInfo.localDate, daily_exports: 0,
        };
        return json({
          ok: true,
          isNewUser: true,
          token,
          user: userObj,
          quota: buildQuotaSummary(userObj, true, tzInfo),
        });
      }

      // 4. Auth Login
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        await ensureSchema(env.DB);
        const body: any = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!env.DB) return json({ error: 'Database unavailable' }, 500);

        const hash = await sha256Hex(password);
        const user: any = await env.DB.prepare(
          'SELECT id, email, password_hash, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports FROM users WHERE email = ?'
        ).bind(email).first();

        if (!user || !user.password_hash || user.password_hash !== hash) {
          return json({ error: 'Incorrect email or password.' }, 401);
        }

        if (!Number(user.pro_until || 0)) {
          const proUntil = Date.now() + THIRTY_DAYS_MS;
          await env.DB.prepare('UPDATE users SET pro_until = ? WHERE id = ?').bind(proUntil, user.id).run();
          user.pro_until = proUntil;
        }

        const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
        await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();
        const { password_hash, ...safeUser } = user;
        return json({ ok: true, token, user: safeUser, quota: buildQuotaSummary(safeUser, true, tzInfo) });
      }

      // 4b. Permanent Account & Data Deletion (GDPR + Google Play Store Requirement)
      if (url.pathname === '/api/auth/account' && request.method === 'DELETE') {
        const { user: authUser, authenticated } = await resolveUser(request, env);
        if (!authenticated || !authUser || !env.DB) {
          return json({ error: 'Not signed in' }, 401);
        }
        await env.DB.batch([
          env.DB.prepare('DELETE FROM projects WHERE user_id = ?').bind(authUser.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(authUser.id),
          env.DB.prepare('DELETE FROM users WHERE id = ?').bind(authUser.id),
        ]);
        return json({ ok: true, deleted: true });
      }

      // 5. State + Global Timezone Daily Quota Status
      if (url.pathname === '/api/state' && request.method === 'GET') {
        if (!env.DB) {
          return json({
            user: { id: 'demo', display_name: 'Guest Artist', plan: 'free', currency: 'USD', exports_this_month: 0 },
            projects: [],
            presets: [],
            d1Connected: false,
            authenticated: false,
            quota: buildQuotaSummary(null, false, tzInfo),
            googleClientId: env.GOOGLE_CLIENT_ID || '',
          });
        }
        const { user, authenticated } = await resolveUser(request, env);
        const projects = await env.DB.prepare(
          'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 25'
        ).bind(user.id).all();
        const presets = await env.DB.prepare(
          'SELECT * FROM custom_presets WHERE is_public = 1 OR user_id = ? ORDER BY created_at DESC LIMIT 20'
        ).bind(user.id).all();

        return json({
          user,
          projects: projects.results,
          presets: presets.results,
          d1Connected: true,
          authenticated,
          quota: buildQuotaSummary(user, authenticated, tzInfo),
          googleClientId: env.GOOGLE_CLIENT_ID || '',
        });
      }

      // 6. Save Project
      if (url.pathname === '/api/projects' && request.method === 'POST') {
        const body: any = await request.json();
        const id = body.id || crypto.randomUUID();
        if (env.DB) {
          const { user } = await resolveUser(request, env);
          await env.DB.prepare(
            `INSERT INTO projects (id, user_id, title, youtube_url, preset_key, musical_key, musical_scale, vocal_offset_ms, settings_json, duration_sec, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               youtube_url = excluded.youtube_url,
               preset_key = excluded.preset_key,
               musical_key = excluded.musical_key,
               musical_scale = excluded.musical_scale,
               vocal_offset_ms = excluded.vocal_offset_ms,
               settings_json = excluded.settings_json,
               duration_sec = excluded.duration_sec,
               updated_at = CURRENT_TIMESTAMP`
          ).bind(
            id, user.id, body.title || 'Untitled Studio Cover', body.youtube_url || '',
            body.preset_key || 'sinhala_ballad', body.musical_key || 'A', body.musical_scale || 'minor',
            Number(body.vocal_offset_ms || 0), JSON.stringify(body.settings || {}), Number(body.duration_sec || 0)
          ).run();
        }
        return json({ ok: true, id });
      }

      if (url.pathname.startsWith('/api/projects/') && request.method === 'DELETE') {
        const projId = url.pathname.split('/').pop();
        if (env.DB && projId) {
          const { user } = await resolveUser(request, env);
          await env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(projId, user.id).run();
        }
        return json({ ok: true });
      }

      if (url.pathname === '/api/presets' && request.method === 'POST') {
        const body: any = await request.json();
        const id = crypto.randomUUID();
        if (env.DB) {
          const { user } = await resolveUser(request, env);
          await env.DB.prepare(
            `INSERT INTO custom_presets (id, user_id, name, voice_profile, settings_json, is_public)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(id, user.id, body.name || 'Custom Vocal Chain', body.voice_profile || 'balanced', JSON.stringify(body.settings || {}), body.is_public ? 1 : 0).run();
        }
        return json({ ok: true, id });
      }

      // 7. Timezone-Aware Daily Export Counter (2/day local midnight reset + Unlimited during 30-day Free Pro Pass)
      if (url.pathname === '/api/track-export' && request.method === 'POST') {
        if (env.DB) {
          const { user, authenticated } = await resolveUser(request, env);
          if (authenticated) {
            const currentQuota = buildQuotaSummary(user, true, tzInfo);
            if (!currentQuota.proActive && currentQuota.dailyUsed >= DAILY_FREE_LIMIT) {
              return json({ ok: false, allowed: false, quota: currentQuota }, 429);
            }
            const nextDaily = user.daily_date === tzInfo.localDate ? Number(user.daily_exports || 0) + 1 : 1;
            await env.DB.prepare(
              'UPDATE users SET exports_this_month = exports_this_month + 1, daily_date = ?, daily_exports = ? WHERE id = ?'
            ).bind(tzInfo.localDate, nextDaily, user.id).run();
            user.daily_date = tzInfo.localDate;
            user.daily_exports = nextDaily;
            return json({ ok: true, allowed: true, quota: buildQuotaSummary(user, true, tzInfo) });
          }
        }
        return json({ ok: true, allowed: true, quota: buildQuotaSummary(null, false, tzInfo) });
      }

      if (url.pathname === '/api/upgrade-demo' && request.method === 'POST') {
        const body: any = await request.json();
        const plan = body.plan || 'pro_global';
        if (env.DB) {
          const { user } = await resolveUser(request, env);
          await env.DB.prepare('UPDATE users SET plan = ? WHERE id = ?').bind(plan, user.id).run();
        }
        return json({ ok: true, plan });
      }

      // 8. Support & Feedback Contact Form Endpoint (Stored directly in Cloudflare D1!)
      if (url.pathname === '/api/contact' && request.method === 'POST') {
        await ensureSchema(env.DB);
        const body: any = await request.json();
        const name = String(body.name || '').trim().slice(0, 120);
        const email = String(body.email || '').trim().slice(0, 160);
        const subject = String(body.subject || 'General Inquiry').trim().slice(0, 160);
        const message = String(body.message || '').trim().slice(0, 3000);
        if (!name || !email.includes('@') || message.length < 5) {
          return json({ error: 'Please fill in your name, email address, and message.' }, 400);
        }
        if (env.DB) {
          await env.DB.prepare(
            'INSERT INTO contact_messages (id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
          ).bind(crypto.randomUUID(), name, email, subject, message).run();
        }
        return json({ ok: true, received: true });
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: 'Not found' }, 404);
    } catch (err: any) {
      return json({ error: err?.message || 'Internal error' }, 500);
    }
  },
};
