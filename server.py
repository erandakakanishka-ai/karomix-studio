#!/usr/bin/env python3
"""
Local D1-Compatible Preview Server for KaroMix Studio.
Mirrors Cloudflare Workers + Pages Static Assets + D1 (SQLite) locally on 0.0.0.0:3000.
"""
import json
import os
import sqlite3
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DB_PATH = os.path.join(BASE_DIR, "local-d1.sqlite")
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            conn.executescript(f.read())


class StudioHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-User-Id")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        user_id = self.headers.get("X-User-Id", "demo-singer-lk")

        if parsed.path == "/api/health":
            return self.send_json({"ok": True, "engine": "Cloudflare Workers + D1 (Local SQLite)", "zeroAudioCpuCost": True})

        if parsed.path == "/api/state":
            with get_db() as conn:
                user_row = conn.execute(
                    "SELECT id, email, display_name, plan, currency, exports_this_month FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
                projects = [
                    dict(r)
                    for r in conn.execute(
                        """SELECT id, title, youtube_url, preset_key, musical_key, musical_scale,
                                  vocal_offset_ms, settings_json, duration_sec, created_at
                           FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 20""",
                        (user_id,),
                    ).fetchall()
                ]
                presets = [
                    dict(r)
                    for r in conn.execute(
                        """SELECT id, name, voice_profile, settings_json, created_at
                           FROM custom_presets WHERE user_id = ? OR is_public = 1 ORDER BY created_at DESC LIMIT 20""",
                        (user_id,),
                    ).fetchall()
                ]
            return self.send_json({
                "user": dict(user_row) if user_row else None,
                "projects": projects,
                "presets": presets,
            })

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        user_id = self.headers.get("X-User-Id", "demo-singer-lk")
        body = self.read_json()

        with get_db() as conn:
            if parsed.path == "/api/projects":
                pid = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO projects
                       (id, user_id, title, youtube_url, preset_key, musical_key, musical_scale, vocal_offset_ms, settings_json, duration_sec)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        pid,
                        user_id,
                        body.get("title") or "Untitled Cover Mix",
                        body.get("youtube_url") or "",
                        body.get("preset_key") or "sinhala_ballad",
                        body.get("musical_key") or "A",
                        body.get("musical_scale") or "minor",
                        round(float(body.get("vocal_offset_ms") or 0)),
                        json.dumps(body.get("settings") or {}),
                        float(body.get("duration_sec") or 0),
                    ),
                )
                return self.send_json({"ok": True, "id": pid}, 201)

            if parsed.path == "/api/presets":
                prid = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO custom_presets (id, user_id, name, voice_profile, settings_json, is_public)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        prid,
                        user_id,
                        body.get("name") or "My Custom Voice Preset",
                        body.get("voice_profile") or "",
                        json.dumps(body.get("settings") or {}),
                        1 if body.get("is_public") else 0,
                    ),
                )
                return self.send_json({"ok": True, "id": prid}, 201)

            if parsed.path == "/api/track-export":
                conn.execute(
                    "UPDATE users SET exports_this_month = exports_this_month + 1 WHERE id = ?",
                    (user_id,),
                )
                row = conn.execute(
                    "SELECT plan, exports_this_month FROM users WHERE id = ?", (user_id,)
                ).fetchone()
                return self.send_json({"ok": True, "user": dict(row) if row else {}})

            if parsed.path == "/api/upgrade-demo":
                plan = body.get("plan") or "pro_lk"
                conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
                return self.send_json({"ok": True, "plan": plan})

        return self.send_json({"error": "Not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        user_id = self.headers.get("X-User-Id", "demo-singer-lk")
        if parsed.path.startswith("/api/projects/"):
            pid = parsed.path.split("/")[-1]
            with get_db() as conn:
                conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (pid, user_id))
            return self.send_json({"ok": True})
        return self.send_json({"error": "Not found"}, 404)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "3000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), StudioHandler)
    print(f"KaroMix Studio running on http://0.0.0.0:{port}", flush=True)
    server.serve_forever()
