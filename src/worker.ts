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

        const cleanQ = q
          .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
          .replace(/\b(karaoke|instrumental|lyrics|lyric|with|on\s+screen|version|official|video|audio|hd|hq|original|key|cover|minus\s+one|track)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim() || q;

        const cacheKey = new Request(`https://singvaza-cache.local/v16/lyrics?q=${encodeURIComponent(cleanQ.toLowerCase())}`);
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
              { headers: { 'User-Agent': 'SingVazaStudio/11.0 (https://singvaza.pages.dev)' } }
            );
            if (lrcRes.ok) {
              const list = (await lrcRes.json()) as any[];
              foundTrack = list.find((item) => item.plainLyrics) || list.find((item) => item.syncedLyrics) || null;
            }
          } catch (_) {}
        }

        if (!foundTrack) {
          try {
            const smCacheKey = new Request('https://singvaza-cache.local/v7/lyrihub-sitemap');
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
                s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/uu/g, 'u').replace(/th/g, 't').replace(/dh/g, 'd').replace(/sh/g, 's').replace(/v/g, 'w');
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
