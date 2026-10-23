export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  BLOG_ADMIN_CODE?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Timezone, X-Admin-Code',
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAILY_FREE_LIMIT = 2;
const DEFAULT_ADMIN_SHA256 = 'b5098ccafc515b07d2d7033a3102e61dcd6ea5d61e91b77d1fce82a4cc3cac16';

let schemaChecked = false;

async function ensureSchema(db?: D1Database) {
  if (!db || schemaChecked) return;
  const statements = [
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
    `CREATE TABLE IF NOT EXISTS blog_posts (
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
    )`,
  ];
  for (const sql of statements) {
    try { await db.prepare(sql).run(); } catch (_) {}
  }
  schemaChecked = true;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPlainBodyToHtml(raw: string): string {
  const blocks = String(raw || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((b) => {
      const trimmed = b.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('## ')) {
        return `<h2>${escapeHtml(trimmed.slice(3).trim())}</h2>`;
      }
      if (trimmed.startsWith('### ')) {
        return `<h3>${escapeHtml(trimmed.slice(4).trim())}</h3>`;
      }
      return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function renderBlogShellHtml(opts: { origin: string; title: string; description: string; canonicalPath: string; bodyHtml: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#07090f" />
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <link rel="canonical" href="${escapeHtml(opts.origin + opts.canonicalPath)}" />
  <link rel="icon" type="image/png" href="/assets/logo.png" />
  <style>
    :root { --bg:#07090f; --surface:#111625; --border:rgba(148,163,184,0.16); --text:#f8fafc; --muted:#94a3b8; --amber:#fbbf24; --cyan:#38bdf8; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.75; padding:24px 16px 64px; }
    .wrap { max-width:860px; margin:0 auto; }
    .top { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:28px; padding-bottom:16px; border-bottom:1px solid var(--border); }
    .brand { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); font-weight:800; font-size:18px; }
    .brand img { width:34px; height:34px; border-radius:9px; }
    .nav-links { display:flex; gap:14px; flex-wrap:wrap; font-size:13.5px; }
    .nav-links a { color:var(--muted); text-decoration:none; }
    .nav-links a:hover { color:var(--amber); }
    h1 { font-size:clamp(25px,4vw,35px); line-height:1.22; margin-bottom:12px; }
    h2 { font-size:20px; margin:20px 0 8px; color:var(--amber); }
    h3 { font-size:17px; margin:16px 0 6px; color:var(--text); }
    p { color:#cbd5e1; margin-bottom:14px; font-size:15px; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:18px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(265px,1fr)); gap:16px; }
    .post-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; overflow:hidden; text-decoration:none; color:inherit; display:flex; flex-direction:column; }
    .post-card:hover { border-color:var(--amber); }
    .post-card img { width:100%; height:160px; object-fit:cover; display:block; }
    .post-body { padding:16px; flex:1; }
    .tag { font-size:11px; font-weight:800; letter-spacing:0.07em; color:var(--cyan); text-transform:uppercase; }
    .btn { display:inline-block; background:var(--amber); color:#07090f; font-weight:700; text-decoration:none; padding:9px 16px; border-radius:10px; font-size:13.5px; }
    footer { margin-top:34px; padding-top:18px; border-top:1px solid var(--border); text-align:center; font-size:12.5px; color:var(--muted); }
    footer a { color:var(--muted); margin:0 8px; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="/"><img src="/assets/logo.png" alt="SingVaza" /><span>SING<span style="color:var(--amber);">VAZA</span></span></a>
      <nav class="nav-links">
        <a href="/">Open Studio</a>
        <a href="/blog" style="color:var(--amber);font-weight:700;">Blog</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </header>
    ${opts.bodyHtml}
    <footer>
      <div>
        <a href="/">Home Studio</a> •
        <a href="/blog">Blog</a> •
        <a href="/about">About Us</a> •
        <a href="/contact">Contact Support</a> •
        <a href="/privacy">Privacy Policy</a> •
        <a href="/terms">Terms of Service</a>
      </div>
      <div style="margin-top:8px;">© 2026 SingVaza</div>
    </footer>
  </div>
</body>
</html>`;
}

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

async function isValidBlogAdmin(request: Request, env: Env): Promise<boolean> {
  const code = String(request.headers.get('X-Admin-Code') || '').trim();
  if (!code) return false;
  if (env.BLOG_ADMIN_CODE && code === env.BLOG_ADMIN_CODE) return true;
  const hashed = await sha256Hex('admin:' + code);
  return hashed === DEFAULT_ADMIN_SHA256;
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
       VALUES (?, 'guest@singvaza.com', '', 'Guest Artist', 'free', 'USD', 0)`
    ).bind(fallbackId).run();
    const u = await env.DB.prepare(
      'SELECT id, email, display_name, plan, currency, exports_this_month, pro_until, daily_date, daily_exports FROM users WHERE id = ?'
    ).bind(fallbackId).first();
    if (u) return { user: u as Record<string, any>, authenticated: false };
  }

  return {
    user: { id: fallbackId, email: 'guest@singvaza.com', display_name: 'Guest Artist', plan: 'free', currency: 'USD', exports_this_month: 0, pro_until: 0, daily_date: '', daily_exports: 0 },
    authenticated: false,
  };
}

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
      // Dynamic Sitemap XML (Automatically includes every published D1 human blog article!)
      if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
        await ensureSchema(env.DB);
        const staticPaths = [
          { p: '/', pri: '1.0' },
          { p: '/blog', pri: '0.9' },
          { p: '/about', pri: '0.8' },
          { p: '/contact', pri: '0.8' },
          { p: '/privacy', pri: '0.7' },
          { p: '/terms', pri: '0.6' },
          { p: '/refunds', pri: '0.6' },
        ];
        let postUrls = '';
        if (env.DB) {
          try {
            const rows = await env.DB.prepare('SELECT slug, updated_at FROM blog_posts ORDER BY updated_at DESC LIMIT 200').all();
            for (const r of (rows.results || []) as any[]) {
              const d = String(r.updated_at || '').slice(0, 10) || '2026-10-22';
              postUrls += `\n  <url>\n    <loc>${escapeHtml(url.origin)}/blog/${escapeHtml(r.slug)}</loc>\n    <lastmod>${d}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.85</priority>\n  </url>`;
            }
          } catch (_) {}
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticPaths
          .map((s) => `\n  <url>\n    <loc>${escapeHtml(url.origin + s.p)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${s.pri}</priority>\n  </url>`)
          .join('')}${postUrls}\n</urlset>\n`;
        return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
      }

      // Dynamic SEO Server-Side Rendered Blog Index & Single Post Pages (/blog & /blog/:slug)
      if ((url.pathname === '/blog' || url.pathname === '/blog/' || url.pathname.startsWith('/blog/')) && request.method === 'GET') {
        await ensureSchema(env.DB);
        const slugPart = url.pathname.replace(/^\/blog\/?/, '').replace(/\/$/, '').trim();
        if (!slugPart) {
          const rows = env.DB
            ? await env.DB.prepare('SELECT id, slug, title, category, cover_image, excerpt, author_name, created_at FROM blog_posts ORDER BY created_at DESC LIMIT 100').all()
            : { results: [] };
          const list = (rows.results || []) as any[];
          const bodyHtml = `
            <h1>SingVaza Blog</h1>
            <p style="color:var(--muted);margin-bottom:24px;">Original vocal recording tutorials, microphone reviews, singing techniques, and home audio guides.</p>
            ${list.length === 0
              ? `<div class="card"><p style="margin:0;">New articles are coming soon. <a href="/" style="color:var(--amber);">Open SingVaza →</a></p></div>`
              : `<div class="grid">${list.map((p) => `
                <a class="post-card" href="/blog/${escapeHtml(p.slug)}">
                  <img src="${escapeHtml(p.cover_image || '/assets/studio-girl-card.jpg')}" alt="${escapeHtml(p.title)}" />
                  <div class="post-body">
                    <div class="tag">${escapeHtml(p.category || 'Guide')}</div>
                    <h2 style="font-size:17px;color:var(--text);margin:6px 0 8px;">${escapeHtml(p.title)}</h2>
                    <p style="font-size:13.5px;color:var(--muted);margin:0;">${escapeHtml(p.excerpt || '')}</p>
                  </div>
                </a>`).join('')}</div>`
            }`;
          return new Response(
            renderBlogShellHtml({
              origin: url.origin,
              title: 'Blog — SingVaza',
              description: 'Original articles on home vocal recording, microphone setup, singing technique, and audio mixing.',
              canonicalPath: '/blog',
              bodyHtml,
            }),
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }

        const post: any = env.DB
          ? await env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slugPart).first()
          : null;
        if (!post) {
          return new Response(
            renderBlogShellHtml({
              origin: url.origin,
              title: 'Article Not Found — SingVaza',
              description: 'Article not found.',
              canonicalPath: '/blog',
              bodyHtml: `<div class="card"><h1>Article Not Found</h1><p><a class="btn" href="/blog">← View All Blog Posts</a></p></div>`,
            }),
            { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }

        const bodyHtml = `
          <article class="card">
            <p style="margin-bottom:14px;"><a href="/blog" style="color:var(--cyan);text-decoration:none;font-size:13.5px;">← Back to All Posts</a></p>
            ${post.cover_image ? `<img src="${escapeHtml(post.cover_image)}" alt="${escapeHtml(post.title)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:12px;margin-bottom:18px;" />` : ''}
            <div class="tag">${escapeHtml(post.category || 'Studio Guide')} • By ${escapeHtml(post.author_name || 'Editor')} • ${escapeHtml(String(post.created_at || '').slice(0, 10))}</div>
            <h1 style="margin-top:8px;">${escapeHtml(post.title)}</h1>
            <div style="margin-top:16px;">${renderPlainBodyToHtml(post.content)}</div>
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">
              <a class="btn" href="/">Open Vocal Studio →</a>
            </div>
          </article>
        `;
        return new Response(
          renderBlogShellHtml({
            origin: url.origin,
            title: `${post.title} — SingVaza Blog`,
            description: post.excerpt || String(post.content || '').slice(0, 155),
            canonicalPath: `/blog/${post.slug}`,
            bodyHtml,
          }),
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }

      // Blog JSON API & Admin CMS Endpoints
      if (url.pathname === '/api/blog' && request.method === 'GET') {
        await ensureSchema(env.DB);
        if (!env.DB) return json({ posts: [] });
        const rows = await env.DB.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 100').all();
        return json({ posts: rows.results || [] });
      }

      if (url.pathname === '/api/blog/verify' && request.method === 'POST') {
        const ok = await isValidBlogAdmin(request, env);
        return ok ? json({ ok: true }) : json({ error: 'Invalid admin passcode.' }, 401);
      }

      if (url.pathname === '/api/blog' && request.method === 'POST') {
        await ensureSchema(env.DB);
        if (!(await isValidBlogAdmin(request, env))) {
          return json({ error: 'Invalid admin passcode.' }, 401);
        }
        if (!env.DB) return json({ error: 'Database unavailable' }, 500);
        const body: any = await request.json();
        const title = String(body.title || '').trim();
        const content = String(body.content || '').trim();
        if (title.length < 3 || content.length < 20) {
          return json({ error: 'Please enter a post title and full article content.' }, 400);
        }
        const rawSlug = String(body.slug || title)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 80) || ('post-' + Date.now());
        const id = String(body.id || '').trim() || crypto.randomUUID();
        const category = String(body.category || 'Vocal Guide').trim().slice(0, 50);
        const coverImage = String(body.cover_image || '/assets/studio-girl-card.jpg').trim().slice(0, 400);
        const excerpt = String(body.excerpt || content.slice(0, 150) + '...').trim().slice(0, 260);
        const authorName = String(body.author_name || 'Editor').trim().slice(0, 80);

        await env.DB.prepare(
          `INSERT INTO blog_posts (id, slug, title, category, cover_image, excerpt, content, author_name, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             slug = excluded.slug,
             title = excluded.title,
             category = excluded.category,
             cover_image = excluded.cover_image,
             excerpt = excluded.excerpt,
             content = excluded.content,
             author_name = excluded.author_name,
             updated_at = CURRENT_TIMESTAMP`
        ).bind(id, rawSlug, title, category, coverImage, excerpt, content, authorName).run();

        return json({ ok: true, id, slug: rawSlug, url: `/blog/${rawSlug}` });
      }

      if (url.pathname.startsWith('/api/blog/') && request.method === 'DELETE') {
        await ensureSchema(env.DB);
        if (!(await isValidBlogAdmin(request, env))) {
          return json({ error: 'Invalid admin passcode.' }, 401);
        }
        const postId = url.pathname.split('/').pop();
        if (env.DB && postId) {
          await env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(postId).run();
        }
        return json({ ok: true, deleted: true });
      }

      const tzInfo = getUserLocalDayInfo(request);

      // 1. Instant Song Name -> Karaoke Video Search (7-Day Cloudflare Edge Cache)
      if (url.pathname === '/api/search-karaoke' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json({ videos: [] });

        const cacheKey = new Request(`https://singvaza-edge-cache.local/karaoke-v4?q=${encodeURIComponent(q.toLowerCase())}`);
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

        const sinhalaToSinglish = (input: string) => {
          const indep: Record<string, string> = {
            'අ': 'a', 'ආ': 'aa', 'ඇ': 'a', 'ඈ': 'aa', 'ඉ': 'i', 'ඊ': 'ee', 'උ': 'u', 'ඌ': 'uu',
            'ඍ': 'ru', 'එ': 'e', 'ඒ': 'e', 'ඓ': 'ai', 'ඔ': 'o', 'ඕ': 'o', 'ඖ': 'au',
          };
          const cons: Record<string, string> = {
            'ක': 'k', 'ඛ': 'kh', 'ග': 'g', 'ඝ': 'gh', 'ඞ': 'ng', 'ඟ': 'ng',
            'ච': 'ch', 'ඡ': 'ch', 'ජ': 'j', 'ඣ': 'jh', 'ඤ': 'ny', 'ඥ': 'gn', 'ඦ': 'nj',
            'ට': 't', 'ඨ': 'th', 'ඩ': 'd', 'ඪ': 'dh', 'ණ': 'n', 'ඬ': 'nd',
            'ත': 'th', 'ථ': 'th', 'ද': 'd', 'ධ': 'dh', 'න': 'n', 'ඳ': 'nd',
            'ප': 'p', 'ඵ': 'ph', 'බ': 'b', 'භ': 'bh', 'ම': 'm', 'ඹ': 'mb',
            'ය': 'y', 'ර': 'r', 'ල': 'l', 'ව': 'w', 'ශ': 'sh', 'ෂ': 'sh', 'ස': 's', 'හ': 'h', 'ළ': 'l', 'ෆ': 'f',
          };
          const signs: Record<string, string> = {
            '\u0DCA': '', '\u0DCF': 'a', '\u0DD0': 'a', '\u0DD1': 'a', '\u0DD2': 'i', '\u0DD3': 'ee',
            '\u0DD4': 'u', '\u0DD6': 'u', '\u0DD8': 'ru', '\u0DD9': 'e', '\u0DDA': 'e', '\u0DDB': 'ai',
            '\u0DDC': 'o', '\u0DDD': 'o', '\u0DDE': 'au', '\u0DDF': 'lu',
          };
          let out = '';
          const chars = Array.from(input);
          for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (indep[ch]) {
              out += indep[ch];
            } else if (cons[ch]) {
              const nxt = chars[i + 1] || '';
              if (nxt in signs) {
                out += cons[ch] + signs[nxt];
                i++;
              } else {
                out += cons[ch] + 'a';
              }
            } else if (ch === 'ං' || ch === 'ඃ') {
              out += 'n';
            } else if (ch === '\u200D' || ch === '\u200C') {
              // ignore ZWJ
            } else {
              out += ch;
            }
          }
          return out;
        };

        const cleanRaw = q
          .split(/[|•]/)[0]
          .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
          .replace(/\b(karaoke|instrumental|lyrics|lyric|with|on\s+screen|version|official|video|audio|hd|hq|original|key|cover|minus\s+one|without\s+voice|sinhala|new\s+song|track)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim() || q;

        const cleanLatin = /[\u0D80-\u0DFF]/.test(cleanRaw) ? sinhalaToSinglish(cleanRaw) : cleanRaw;

        const cacheKey = new Request(`https://singvaza-cache.local/v15.2/lyrics?q=${encodeURIComponent(cleanRaw.toLowerCase())}`);
        const edgeCache = (globalThis as any).caches?.default;
        if (edgeCache) {
          const cachedHit = await edgeCache.match(cacheKey);
          if (cachedHit) return cachedHit;
        }

        const decodeHtmlEntities = (s: string) =>
          s
            .replace(/&#8211;|&ndash;/g, '–')
            .replace(/&#8217;|&#39;|&rsquo;/g, "'")
            .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
            .replace(/&#8230;|&hellip;/g, '...')
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_m, n) => {
              const code = Number(n);
              return code > 31 ? String.fromCodePoint(code) : '';
            })
            .replace(/&amp;/g, '&');

        const promoRe = /https?:\/\/|www\.|@[a-z0-9_]|#[a-z0-9_\u0D80-\u0DFF]|[🎵🎶🔔⭐⭐️]|\b(subscribe|notifications?|7clouds|whatsapp|facebook|instagram|tiktok|spotify|apple\s*music|itunes|deezer|contact|call|booking|all\s*rights|copyright|official\s*(music|lyric|audio|video)|channel|publish|powered\s*by|distributed\s*by|stream\s*\/?\s*download|stream\s*now|download\s*now|follow\s*us|performed\s*by|written\s*by|screenplay\s*by|story\s*by|sung\s*by|music\s*by|lyrics\s*by|composed\s*by|arranged\s*by|melody\s*(&|and)\s*music|music\s*produced|song\s*credits|credits\s*:|mixing|mastering|mixed\s*(&|and|by)?|mastered\s*by|recorded\s*(at|by)|video\s*by|directed\s*by|produced\s*by|dop|cinematography|editor|colorist|artwork|thumbnail|special\s*thanks|starring|cast|backing\s*track|keyboard\s*(voices|style)|songs?\s*notation|kar[ao]+ke|midi|minus\s*one|privacy\s*policy|terms\s*of\s*use|cookie|skip\s*to\s*main|reality\s*show|cover\s*versions|related\s*songs)\b|(?:^|\s)(title|song|artist|singer|vocals?|music|melody|lyrics|lyricist|composed|composer|arranged|studio|guitars?|flute|veena|synth|violin|piano|keys|keyboards?|percussion|drums|bass|audio|video|art|category|views|updated)\s*[-:|–—]/i;
        const creditPairRe = /^[A-Za-z][A-Za-z0-9 &,/()+.']{1,26}\s*[-:|–—]\s+[A-Z0-9@]/;
        const phoneRe = /\b0\d{2}[-\s]?\d{3}[-\s]?\d{4}\b|\+\d{8,15}/;

        const extractLyricsFromYtDescription = (desc: string): string => {
          if (!desc || desc.length < 110) return '';
          const cleanedDesc = desc.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');
          // If a description explicitly contains a "Song Credits:" / "Keyboard voices" section without real lyrics, strip lines inside credits blocks
          const blocks = cleanedDesc.replace(/\r\n/g, '\n').split(/\n\s*\n+/);
          const goodStanzas: string[] = [];
          let totalCleanLines = 0;

          for (const block of blocks) {
            if (/\b(song\s*credits|credits\s*:|keyboard\s*voices|songs?\s*notation|screenplay\s*by)\b/i.test(block)) continue;
            const rawLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
            const kept: string[] = [];
            for (const ln of rawLines) {
              if (ln.length < 4 || ln.length > 96) continue;
              if (promoRe.test(ln) || creditPairRe.test(ln) || phoneRe.test(ln)) continue;
              if (/^[=\-*_~•|<>✦★☆♪♫🎵🎶▶\s]+$/.test(ln)) continue;
              if (/^--\s*.+\s*--$/.test(ln)) continue;
              if (ln.includes('|') || /\b(lyrics\s*video|official\s*video)\b/i.test(ln)) continue;
              if (ln.length > 72 && /\b(sung by|presented here|written by|composed by|melodic|romantic)\b/i.test(ln)) continue;
              kept.push(ln);
            }
            if (kept.length >= 2) {
              goodStanzas.push(kept.join('\n'));
              totalCleanLines += kept.length;
            }
          }

          if (totalCleanLines >= 10) {
            return goodStanzas.join('\n\n').trim();
          }
          return '';
        };

        const extractLyricsFromWebHtml = (rawHtml: string): string => {
          const bodyIdx = rawHtml.search(/<body[\s>]/i);
          let chunk = bodyIdx >= 0 ? rawHtml.slice(bodyIdx) : rawHtml;
          chunk = chunk
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
            .replace(/<(nav|header|footer|aside|form|button|svg|iframe|select|ul|ol)[\s\S]*?<\/\1>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|h[1-6]|pre|blockquote|section|article|tr)>/gi, '\n\n')
            .replace(/<[^>]+>/g, ' ');
          chunk = decodeHtmlEntities(chunk)
            .replace(/[ \t]+/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n');
          return extractLyricsFromYtDescription(chunk);
        };

        const normPhonetic = (s: string) =>
          sinhalaToSinglish(s)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/aa/g, 'a')
            .replace(/ee/g, 'i')
            .replace(/oo/g, 'u')
            .replace(/uu/g, 'u')
            .replace(/th/g, 't')
            .replace(/dh/g, 'd')
            .replace(/sh/g, 's')
            .replace(/ch/g, 'c')
            .replace(/v/g, 'w')
            .replace(/\s+/g, ' ')
            .trim();

        const wordsMatchToken = (candWord: string, qWord: string) => {
          if (candWord === qWord) return true;
          if (qWord.length >= 4 && candWord.length >= 4 && (candWord.startsWith(qWord) || qWord.startsWith(candWord))) return true;
          return false;
        };

        const titleMatchesCandidates = (pageTitle: string, cands: string[]) => {
          const tWords = normPhonetic(pageTitle).split(' ').filter((w) => w.length >= 2);
          if (!tWords.length) return false;
          for (const c of cands) {
            const qWords = normPhonetic(c).split(' ').filter((w) => w.length >= 2);
            if (!qWords.length) continue;
            const minReq = qWords.length <= 2 ? qWords.length : Math.ceil(qWords.length * 0.66);
            let hits = 0;
            for (const qw of qWords) {
              if (tWords.some((tw) => wordsMatchToken(tw, qw))) hits++;
            }
            if (hits >= minReq) return true;
          }
          return false;
        };

        // STAGE 1 (~350ms IN PARALLEL): LRCLIB Global Search + YouTube Live AI Spell-Corrector / Video Discovery
        let foundTrack: any = null;
        let ytCanonicalTitle = '';
        let ytRawFirstTitle = '';
        let ytVids: { id: string; title: string }[] = [];

        await Promise.all([
          (async () => {
            if (/[\u0D80-\u0DFF]/.test(cleanRaw)) return;
            const browserUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
            const qWordsRaw = cleanLatin.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
            const [lrcHit, ovhHit] = await Promise.all([
              (async () => {
                try {
                  const lrcRes = await fetch(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanLatin)}`,
                    { headers: { Accept: 'application/json', 'User-Agent': browserUa }, signal: AbortSignal.timeout(3500) }
                  );
                  if (lrcRes.ok) {
                    const list = (await lrcRes.json()) as any[];
                    return list.find((item) => {
                      if (!item.plainLyrics && !item.syncedLyrics) return false;
                      const meta = `${item.trackName || ''} ${item.name || ''} ${item.artistName || ''}`.toLowerCase();
                      return qWordsRaw.every((w) => meta.includes(w)) || (qWordsRaw.length >= 2 && qWordsRaw.filter((w) => meta.includes(w)).length >= Math.ceil(qWordsRaw.length * 0.7));
                    }) || null;
                  }
                } catch (_) {}
                return null;
              })(),
              (async () => {
                try {
                  const sugRes = await fetch(
                    `https://api.lyrics.ovh/suggest/${encodeURIComponent(cleanLatin)}`,
                    { headers: { Accept: 'application/json', 'User-Agent': browserUa }, signal: AbortSignal.timeout(3000) }
                  );
                  if (!sugRes.ok) return null;
                  const sugJson: any = await sugRes.json();
                  const cand = (sugJson?.data || []).find((d: any) => {
                    const meta = `${d?.title || ''} ${d?.artist?.name || ''}`.toLowerCase();
                    return qWordsRaw.every((w) => meta.includes(w)) || (qWordsRaw.length >= 2 && qWordsRaw.filter((w) => meta.includes(w)).length >= Math.ceil(qWordsRaw.length * 0.7));
                  });
                  if (!cand?.artist?.name || !cand?.title) return null;
                  const lyrRes = await fetch(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(cand.artist.name)}/${encodeURIComponent(cand.title)}`,
                    { headers: { Accept: 'application/json', 'User-Agent': browserUa }, signal: AbortSignal.timeout(3500) }
                  );
                  if (!lyrRes.ok) return null;
                  const lyrJson: any = await lyrRes.json();
                  const plain = String(lyrJson?.lyrics || '').replace(/^Paroles de la chanson[^\n]*\n+/i, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
                  return plain.length > 40 ? { plainLyrics: plain } : null;
                } catch (_) {}
                return null;
              })(),
            ]);
            foundTrack = lrcHit || ovhHit || null;
          })(),
          (async () => {
            try {
              const ytSearchRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  context: { client: { clientName: 'WEB', clientVersion: '2.20241001.01.00', hl: 'en', gl: 'LK' } },
                  query: `${cleanRaw} lyrics`,
                }),
                signal: AbortSignal.timeout(3500),
              });
              if (ytSearchRes.ok) {
                const sJson: any = await ytSearchRes.json();
                JSON.stringify(sJson, (_k, v) => {
                  if (v && typeof v === 'object' && v.videoRenderer?.videoId) {
                    ytVids.push({
                      id: v.videoRenderer.videoId,
                      title: (v.videoRenderer.title?.runs || []).map((r: any) => r.text).join(''),
                    });
                  }
                  return v;
                });
                if (ytVids.length > 0) {
                  ytRawFirstTitle = ytVids[0].title;
                  ytCanonicalTitle = ytVids[0].title
                    .split(/[|•]/)[0]
                    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
                    .replace(/\b(lyrics?|official|video|audio|sinhala|hd|4k|full\s*song)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                }
              }
            } catch (_) {}
          })(),
        ]);

        const searchCandidates = Array.from(
          new Set(
            [cleanRaw, cleanLatin, ytCanonicalTitle, ytRawFirstTitle.split(/[-|•(]/)[0]?.trim() || '']
              .map((s) => s.trim())
              .filter((s) => s.length >= 2)
          )
        );

        // STAGE 2 (~450ms IN PARALLEL): Dedicated Zero-Noise Pure Lyrics Databases (LRCLIB Spell-Corrected + SinhalaSongLyrics 2026 + LyriHub + SinhalaSongBook)
        if (!foundTrack) {
          const [lrc2Hit, sslHit, lyriHit, ssbHit] = await Promise.all([
            // 2A. LRCLIB Retry using YouTube's AI-corrected title
            (async () => {
              if (!ytCanonicalTitle || ytCanonicalTitle.toLowerCase() === cleanLatin.toLowerCase()) return null;
              try {
                const lrcRes2 = await fetch(
                  `https://lrclib.net/api/search?q=${encodeURIComponent(ytCanonicalTitle)}`,
                  { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; SingVaza/15.0)' }, signal: AbortSignal.timeout(3500) }
                );
                if (lrcRes2.ok) {
                  const list2 = (await lrcRes2.json()) as any[];
                  return list2.find((item) => (item.plainLyrics || item.syncedLyrics) && titleMatchesCandidates(`${item.trackName || ''} ${item.artistName || ''}`, searchCandidates)) || null;
                }
              } catch (_) {}
              return null;
            })(),

            // 2B. SinhalaSongLyrics.com WordPress REST API (Modern 2020-2026 Releases)
            (async () => {
              const results = await Promise.all(
                searchCandidates.slice(0, 2).map(async (sq) => {
                  try {
                    const r = await fetch(
                      `https://sinhalasonglyrics.com/wp-json/wp/v2/posts?per_page=8&_fields=title,content&search=${encodeURIComponent(sq)}`,
                      { signal: AbortSignal.timeout(2500) }
                    );
                    if (!r.ok) return null;
                    const posts = (await r.json()) as any[];
                    const matched = posts.find((p) => titleMatchesCandidates(decodeHtmlEntities(String(p?.title?.rendered || '').replace(/<[^>]+>/g, '')), searchCandidates));
                    if (matched?.content?.rendered) {
                      const html = String(matched.content.rendered);
                      const afterHeading = html.split(/Song\s*Lyrics\s*<\/h[1-4]>/i)[1] || html;
                      const cleaned = extractLyricsFromWebHtml(afterHeading);
                      if (cleaned.length > 50) return { plainLyrics: cleaned };
                    }
                  } catch (_) {}
                  return null;
                })
              );
              return results.find(Boolean) || null;
            })(),

            // 2C. LyriHub.lk 2,372 Sinhala Songs Index
            (async () => {
              try {
                const idxCacheKey = new Request('https://singvaza-cache.local/v15/lyrihub-compact-index');
                let indexText = '';
                if (edgeCache) {
                  const idxHit = await edgeCache.match(idxCacheKey);
                  if (idxHit) indexText = await idxHit.text();
                }
                if (!indexText) {
                  const smRes = await fetch('https://www.lyrihub.lk/sitemap-0.xml', { signal: AbortSignal.timeout(4000) });
                  if (smRes.ok) {
                    const xml = await smRes.text();
                    const slugs: string[] = [];
                    const re = /\/song\/([^/<]+)\//g;
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(xml)) !== null) slugs.push(m[1].toLowerCase());
                    indexText = slugs.join('\n');
                    if (edgeCache && slugs.length > 100) {
                      await edgeCache.put(idxCacheKey, new Response(indexText, { headers: { 'Cache-Control': 'public, max-age=604800' } }));
                    }
                  }
                }
                if (indexText) {
                  const lines = indexText.split('\n');
                  for (const candStr of searchCandidates) {
                    const qTokens = normPhonetic(candStr).split(' ').filter((t) => t.length >= 2);
                    if (!qTokens.length) continue;
                    let bestSlug = '';
                    let bestScore = 0;
                    const minRequired = qTokens.length <= 2 ? qTokens.length : Math.ceil(qTokens.length * 0.67);
                    for (let i = 0; i < lines.length; i++) {
                      const rawSlug = lines[i];
                      if (!rawSlug) continue;
                      const slugWords = normPhonetic(rawSlug).split(' ').filter(Boolean);
                      let matched = 0;
                      for (let j = 0; j < qTokens.length; j++) {
                        if (slugWords.some((sw) => wordsMatchToken(sw, qTokens[j]))) matched++;
                      }
                      if (matched >= minRequired) {
                        const score = matched / Math.max(qTokens.length, slugWords.length * 0.7);
                        if (score > bestScore) {
                          bestScore = score;
                          bestSlug = rawSlug;
                        }
                      }
                    }
                    if (bestSlug && bestScore >= 0.45) {
                      const pageRes = await fetch(`https://www.lyrihub.lk/song/${bestSlug}/`, { signal: AbortSignal.timeout(4000) });
                      if (pageRes.ok) {
                        const pageHtml = await pageRes.text();
                        const blockMatch = pageHtml.match(/class="lyri-content[\s\S]*?>([\s\S]*?)<\/div>/i);
                        if (blockMatch) {
                          const plain = decodeHtmlEntities(
                            blockMatch[1]
                              .replace(/<br\s*\/?>/gi, '\n')
                              .replace(/<\/p>/gi, '\n\n')
                              .replace(/<[^>]+>/g, '')
                          ).trim();
                          if (plain.length > 25) return { plainLyrics: plain };
                        }
                      }
                    }
                  }
                }
              } catch (_) {}
              return null;
            })(),

            // 2D. SinhalaSongBook.com 10,000+ Classics API
            (async () => {
              const results = await Promise.all(
                searchCandidates.slice(0, 2).map(async (sq) => {
                  try {
                    const ssbRes = await fetch(
                      `https://www.sinhalasongbook.com/wp-json/wp/v2/posts?per_page=12&_fields=title,content&search=${encodeURIComponent(sq)}`,
                      { signal: AbortSignal.timeout(2500) }
                    );
                    if (!ssbRes.ok) return null;
                    const posts = (await ssbRes.json()) as any[];
                    const matchedPost = posts.find((post) =>
                      titleMatchesCandidates(decodeHtmlEntities(String(post?.title?.rendered || '').replace(/<[^>]+>/g, '')), searchCandidates)
                    );
                    if (matchedPost) {
                      const html = String(matchedPost?.content?.rendered || '');
                      const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                      if (preMatch) {
                        const rawPre = decodeHtmlEntities(
                          preMatch[1].replace(/<a[^>]*>[\s\S]*?<\/a>/gi, '').replace(/<[^>]+>/g, '')
                        );
                        const cleanLines: string[] = [];
                        for (const rawLine of rawPre.split(/\r?\n/)) {
                          const ln = rawLine.trim();
                          if (!ln) {
                            if (cleanLines.length && cleanLines[cleanLines.length - 1] !== '') cleanLines.push('');
                            continue;
                          }
                          if (/^(INTRO|INTER|CHORUS|VERSE|BRIDGE|OUTRO|END)/i.test(ln)) continue;
                          if (ln.includes('|') || (/^[\-\sxA-G#bmajinsudg0-9/()+]+$/.test(ln) && !/[h-w\u0D80-\u0DFF]/i.test(ln))) continue;
                          cleanLines.push(ln);
                        }
                        const joined = cleanLines.join('\n').trim();
                        if (joined.length > 30) {
                          const cleanTitle = decodeHtmlEntities(String(matchedPost?.title?.rendered || '').replace(/<[^>]+>/g, '')).trim();
                          return { plainLyrics: cleanTitle ? `${cleanTitle}\n\n${joined}` : joined };
                        }
                      }
                    }
                  } catch (_) {}
                  return null;
                })
              );
              return results.find(Boolean) || null;
            })(),
          ]);

          foundTrack = lrc2Hit || sslHit || lyriHit || ssbHit || null;
        }

        // STAGE 3 (~350ms IN PARALLEL): YouTube Human Subtitles / CC + Clean Video Descriptions (for brand-new/indie songs not on ANY lyrics site!)
        if (!foundTrack && ytVids.length > 0) {
          try {
            const playerInfos = await Promise.all(
              ytVids.slice(0, 6).map(async (v) => {
                try {
                  const pRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      context: { client: { clientName: 'WEB', clientVersion: '2.20241001.01.00', hl: 'en', gl: 'LK' } },
                      videoId: v.id,
                    }),
                    signal: AbortSignal.timeout(3500),
                  });
                  if (!pRes.ok) return null;
                  const pJson: any = await pRes.json();
                  const tracks = pJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
                  const manualTrack = tracks.find((t: any) => t?.baseUrl && t.kind !== 'asr');
                  return {
                    title: String(pJson?.videoDetails?.title || v.title),
                    desc: String(pJson?.videoDetails?.shortDescription || ''),
                    captionUrl: manualTrack?.baseUrl ? String(manualTrack.baseUrl) : '',
                  };
                } catch (_) {
                  return null;
                }
              })
            );

            // 3A. Human Subtitles / Closed Captions (CC) — works even when Description has ZERO lyrics!
            for (const info of playerInfos) {
              if (!info?.captionUrl) continue;
              try {
                const capRes = await fetch(info.captionUrl, { signal: AbortSignal.timeout(3000) });
                if (!capRes.ok) continue;
                const capXml = await capRes.text();
                const syncedLines: string[] = [];
                const plainLines: string[] = [];
                const cueRe = /<text[^>]*start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
                let cm: RegExpExecArray | null;
                while ((cm = cueRe.exec(capXml)) !== null) {
                  const sec = parseFloat(cm[1] || '0');
                  const txt = decodeHtmlEntities(cm[2].replace(/<[^>]+>/g, ' '))
                    .replace(/[♪♫♬]+/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  if (!txt || txt.length < 3 || /^\[(music|applause|intro|instrumental)\]$/i.test(txt)) continue;
                  if (plainLines[plainLines.length - 1] === txt) continue;
                  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
                  const ss = (sec % 60).toFixed(2).padStart(5, '0');
                  syncedLines.push(`[${mm}:${ss}] ${txt}`);
                  plainLines.push(txt);
                }
                if (plainLines.length >= 6) {
                  foundTrack = { syncedLyrics: syncedLines.join('\n'), plainLyrics: plainLines.join('\n') };
                  break;
                }
              } catch (_) {}
            }

            // 3B. Clean Video Stanza Descriptions across all 6 videos
            if (!foundTrack) {
              for (const info of playerInfos) {
                if (!info || !info.desc) continue;
                const extracted = extractLyricsFromYtDescription(info.desc);
                if (extracted.length > 60) {
                  foundTrack = { plainLyrics: extracted };
                  break;
                }
              }
            }
          } catch (_) {}
        }

        // STAGE 4 (~500ms IN PARALLEL): LIVE OPEN-WEB SEARCH (DuckDuckGo HTML + Bing Web Search across EVERY public lyrics website on Earth!)
        if (!foundTrack) {
          try {
            const webQuery = `${ytCanonicalTitle || cleanRaw} lyrics`;
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
            const skipHosts = /\b(youtube\.com|youtu\.be|spotify\.com|music\.apple\.com|soundcloud\.com|shazam\.com|smule\.com|musixmatch\.com|genius\.com|facebook\.com|instagram\.com|tiktok\.com|wikipedia\.org|merriam-webster\.com|thesaurus\.com|dictionary\.cambridge\.org|wordhippo\.com|amazon\.com)\b/i;

            const [ddgLinks, bingLinks] = await Promise.all([
              (async () => {
                try {
                  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(webQuery)}`, {
                    headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
                    signal: AbortSignal.timeout(4000),
                  });
                  if (!r.ok) return [] as { title: string; href: string }[];
                  const html = await r.text();
                  const out: { title: string; href: string }[] = [];
                  const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                  let m: RegExpExecArray | null;
                  while ((m = re.exec(html)) && out.length < 6) {
                    let href = m[1];
                    const uddg = href.match(/[?&]uddg=([^&]+)/);
                    if (uddg) href = decodeURIComponent(uddg[1]);
                    const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '')).trim();
                    if (/^https?:\/\//i.test(href) && !skipHosts.test(href)) out.push({ title, href });
                  }
                  return out;
                } catch (_) {
                  return [] as { title: string; href: string }[];
                }
              })(),
              (async () => {
                try {
                  const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(webQuery)}`, {
                    headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
                    signal: AbortSignal.timeout(4000),
                  });
                  if (!r.ok) return [] as { title: string; href: string }[];
                  const html = await r.text();
                  const out: { title: string; href: string }[] = [];
                  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                  let m: RegExpExecArray | null;
                  while ((m = re.exec(html)) && out.length < 6) {
                    let href = m[1];
                    const uMatch = href.match(/(?:[?&]|&amp;)u=a1([A-Za-z0-9_-]+)/);
                    if (uMatch) {
                      try {
                        const b64 = uMatch[1].replace(/-/g, '+').replace(/_/g, '/');
                        const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
                        href = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
                      } catch (_) {}
                    }
                    const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '')).trim();
                    if (/^https?:\/\//i.test(href) && !skipHosts.test(href)) out.push({ title, href });
                  }
                  return out;
                } catch (_) {
                  return [] as { title: string; href: string }[];
                }
              })(),
            ]);

            const seenUrls = new Set<string>();
            const candidatePages = [...ddgLinks, ...bingLinks].filter((item) => {
              if (seenUrls.has(item.href)) return false;
              seenUrls.add(item.href);
              return titleMatchesCandidates(item.title, searchCandidates);
            }).slice(0, 4);

            if (candidatePages.length > 0) {
              const scraped = await Promise.all(
                candidatePages.map(async (pg) => {
                  try {
                    const pr = await fetch(pg.href, {
                      headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
                      signal: AbortSignal.timeout(4000),
                    });
                    if (!pr.ok) return '';
                    const pHtml = await pr.text();
                    return extractLyricsFromWebHtml(pHtml);
                  } catch (_) {
                    return '';
                  }
                })
              );
              const bestWeb = scraped.find((txt) => txt.length > 60);
              if (bestWeb) {
                foundTrack = { plainLyrics: bestWeb };
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

      // 3a. Official Google Sign-In
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

      // 3b. Auth Register
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

      // 4b. Permanent Account & Data Deletion
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

      // 7. Timezone-Aware Daily Export Counter
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

      // 8. Support & Feedback Contact Form Endpoint
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
