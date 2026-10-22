import hashlib
import json
import os
import re
import sqlite3
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DB_PATH = os.path.join(BASE_DIR, ".local_studio.db")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    with open(os.path.join(BASE_DIR, "schema.sql"), "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    try:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


def hash_pw(pw: str) -> str:
    return hashlib.sha256(("karomix_salt_v1:" + pw).encode("utf-8")).hexdigest()


def search_karaoke_videos(raw_q: str):
    clean = raw_q.strip()
    if not clean:
        return []
    full_q = clean if ("karaoke" in clean.lower() or "instrumental" in clean.lower()) else f"{clean} karaoke version"
    try:
        req = urllib.request.Request(
            "https://www.youtube.com/results?search_query=" + urllib.parse.quote(full_q) + "&hl=en",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        html = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", errors="ignore")
        m = re.search(r"var ytInitialData = (\{.*?\});</script>", html)
        if m:
            data = json.loads(m.group(1))
            sections = (
                data.get("contents", {})
                .get("twoColumnSearchResultsRenderer", {})
                .get("primaryContents", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
            out = []
            for sec in sections:
                for it in sec.get("itemSectionRenderer", {}).get("contents", []):
                    vr = it.get("videoRenderer")
                    if not vr or not vr.get("videoId"):
                        continue
                    vid = vr["videoId"]
                    out.append(
                        {
                            "id": vid,
                            "title": "".join(r.get("text", "") for r in vr.get("title", {}).get("runs", [])),
                            "channel": "".join(r.get("text", "") for r in vr.get("ownerText", {}).get("runs", [])),
                            "duration": vr.get("lengthText", {}).get("simpleText", ""),
                            "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                        }
                    )
                    if len(out) >= 16:
                        break
                if len(out) >= 16:
                    break
            if out:
                from concurrent.futures import ThreadPoolExecutor

                def is_embeddable(item):
                    try:
                        r = urllib.request.urlopen(
                            f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={item['id']}&format=json",
                            timeout=4,
                        )
                        return item if r.status == 200 else None
                    except Exception:
                        return None

                with ThreadPoolExecutor(max_workers=8) as ex:
                    playable = [x for x in ex.map(is_embeddable, out) if x]
                playable.sort(key=lambda x: 0 if re.search(r"karaoke|instrumental|backing", x["title"], re.I) else 1)
                return (playable or out)[:8]
    except Exception:
        pass
    return []


class StudioHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def resolve_user(self, conn):
        auth = self.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.startswith("Bearer ") else ""
        if token:
            row = conn.execute(
                """SELECT u.id, u.email, u.display_name, u.plan, u.currency, u.exports_this_month
                   FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?""",
                (token,),
            ).fetchone()
            if row:
                return dict(row), True

        conn.execute(
            """INSERT OR IGNORE INTO users (id, email, password_hash, display_name, plan, currency, exports_this_month)
               VALUES ('demo-singer-global', 'artist@karomix.ai', '', 'Guest Artist', 'free', 'USD', 0)"""
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, email, display_name, plan, currency, exports_this_month FROM users WHERE id = 'demo-singer-global'"
        ).fetchone()
        return dict(row), False

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/search-karaoke":
            q = (params.get("q") or [""])[0]
            return self.send_json({"videos": search_karaoke_videos(q)})

        if parsed.path == "/api/lyrics":
            q = (params.get("q") or [""])[0].strip()
            if not q:
                return self.send_json({"track": None})
            clean_q = re.sub(r"\b(karaoke|instrumental|lyrics|version|official|acoustic)\b", "", q, flags=re.I).strip() or q
            try:
                req = urllib.request.Request(
                    "https://lrclib.net/api/search?q=" + urllib.parse.quote(clean_q),
                    headers={"User-Agent": "KaroMixAIStudio/3.0"},
                )
                items = json.loads(urllib.request.urlopen(req, timeout=8).read().decode("utf-8"))
                best = next((i for i in items if i.get("syncedLyrics")), None) or next((i for i in items if i.get("plainLyrics")), None)
                return self.send_json({"track": best})
            except Exception:
                return self.send_json({"track": None})

        if parsed.path == "/api/state":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            user, authenticated = self.resolve_user(conn)
            projects = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 25",
                    (user["id"],),
                ).fetchall()
            ]
            presets = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM custom_presets WHERE is_public = 1 OR user_id = ? ORDER BY created_at DESC LIMIT 20",
                    (user["id"],),
                ).fetchall()
            ]
            conn.close()
            return self.send_json(
                {
                    "user": user,
                    "projects": projects,
                    "presets": presets,
                    "d1Connected": True,
                    "authenticated": authenticated,
                }
            )
        return super().do_GET()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/projects/"):
            proj_id = parsed.path.split("/")[-1]
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            user, _ = self.resolve_user(conn)
            conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (proj_id, user["id"]))
            conn.commit()
            conn.close()
            return self.send_json({"ok": True})
        return self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        body = self.read_json()
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row

        try:
            if parsed.path == "/api/auth/register":
                email = str(body.get("email", "")).strip().lower()
                pw = str(body.get("password", ""))
                name = str(body.get("display_name") or email.split("@")[0] or "Artist").strip()
                if not email or "@" not in email or len(pw) < 4:
                    return self.send_json({"error": "Enter a valid email and password (min 4 characters)."}, 400)
                if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
                    return self.send_json({"error": "This email is already registered. Please sign in."}, 409)
                uid = str(uuid.uuid4())
                tok = str(uuid.uuid4()) + uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO users (id, email, password_hash, display_name, plan, currency, exports_this_month) VALUES (?, ?, ?, ?, 'free', 'USD', 0)",
                    (uid, email, hash_pw(pw), name),
                )
                conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (tok, uid))
                conn.commit()
                return self.send_json(
                    {
                        "ok": True,
                        "token": tok,
                        "user": {
                            "id": uid,
                            "email": email,
                            "display_name": name,
                            "plan": "free",
                            "currency": "USD",
                            "exports_this_month": 0,
                        },
                    }
                )

            if parsed.path == "/api/auth/login":
                email = str(body.get("email", "")).strip().lower()
                pw = str(body.get("password", ""))
                row = conn.execute(
                    "SELECT id, email, password_hash, display_name, plan, currency, exports_this_month FROM users WHERE email = ?",
                    (email,),
                ).fetchone()
                if not row or row["password_hash"] != hash_pw(pw):
                    return self.send_json({"error": "Incorrect email or password."}, 401)
                tok = str(uuid.uuid4()) + uuid.uuid4().hex
                conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (tok, row["id"]))
                conn.commit()
                u = dict(row)
                u.pop("password_hash", None)
                return self.send_json({"ok": True, "token": tok, "user": u})

            user, _ = self.resolve_user(conn)

            if parsed.path == "/api/projects":
                pid = body.get("id") or str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO projects (id, user_id, title, youtube_url, preset_key, musical_key, musical_scale, vocal_offset_ms, settings_json, duration_sec)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET
                         title = excluded.title, youtube_url = excluded.youtube_url, preset_key = excluded.preset_key,
                         musical_key = excluded.musical_key, musical_scale = excluded.musical_scale,
                         vocal_offset_ms = excluded.vocal_offset_ms, settings_json = excluded.settings_json,
                         duration_sec = excluded.duration_sec, updated_at = CURRENT_TIMESTAMP""",
                    (
                        pid,
                        user["id"],
                        body.get("title", "Untitled Studio Cover"),
                        body.get("youtube_url", ""),
                        body.get("preset_key", "sinhala_ballad"),
                        body.get("musical_key", "A"),
                        body.get("musical_scale", "minor"),
                        int(body.get("vocal_offset_ms", 0)),
                        json.dumps(body.get("settings", {})),
                        float(body.get("duration_sec", 0)),
                    ),
                )
                conn.commit()
                return self.send_json({"ok": True, "id": pid})

            if parsed.path == "/api/presets":
                cid = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO custom_presets (id, user_id, name, voice_profile, settings_json, is_public) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        cid,
                        user["id"],
                        body.get("name", "Custom Vocal Chain"),
                        body.get("voice_profile", "balanced"),
                        json.dumps(body.get("settings", {})),
                        1 if body.get("is_public") else 0,
                    ),
                )
                conn.commit()
                return self.send_json({"ok": True, "id": cid})

            if parsed.path == "/api/track-export":
                conn.execute("UPDATE users SET exports_this_month = exports_this_month + 1 WHERE id = ?", (user["id"],))
                conn.commit()
                return self.send_json({"ok": True})

            if parsed.path == "/api/upgrade-demo":
                plan = body.get("plan", "pro_global")
                conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user["id"]))
                conn.commit()
                return self.send_json({"ok": True, "plan": plan})

            return self.send_json({"error": "Unknown API route"}, 404)
        finally:
            conn.close()


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "3000"))
    print(f"KaroMix AI Studio v3 running on http://0.0.0.0:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), StudioHandler).serve_forever()
