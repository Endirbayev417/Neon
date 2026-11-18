#!/usr/bin/env python3
"""NeOn — сервер с базой данных SQLite.
Только стандартная библиотека Python: ничего устанавливать не нужно.
Запуск:  python3 server.py   →   http://localhost:8000
"""
import hashlib, hmac, json, os, re, secrets, sqlite3, time
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "neon.db")      # файл базы данных
PUBLIC = os.path.join(BASE, "public")        # сайт (html/css/js)
HOST, PORT = "127.0.0.1", 8000
COOKIE = "neon_session"
SESSION_SECONDS = 30 * 24 * 3600             # вход помнится 30 дней
FAILS = {}                                   # защита от подбора пароля


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_db():
    con = db()
    con.executescript("""
    CREATE TABLE IF NOT EXISTS users(
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt          TEXT NOT NULL,
        created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions(
        token      TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS about(
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        text       TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews(
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        rating     INTEGER NOT NULL,
        text       TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );""")
    # старая база без админов: добавляем колонку
    cols = [r["name"] for r in con.execute("PRAGMA table_info(users)")]
    if "is_admin" not in cols:
        con.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    con.commit()
    con.close()


def hash_password(password, salt_hex):
    # scrypt + случайная соль: пароль в базе не восстановить
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                          n=2**14, r=8, p=1).hex()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PUBLIC, **kw)

    # ---------- вспомогательное ----------
    def send_json(self, code, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n > 10_000 or "application/json" not in self.headers.get("Content-Type", ""):
                return None
            data = json.loads(self.rfile.read(n) or b"{}")
            return data if isinstance(data, dict) else None
        except (ValueError, TypeError):
            return None

    def token(self):
        c = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        return c[COOKIE].value if COOKIE in c else None

    def current_user(self, con):
        t = self.token()
        if not t:
            return None
        return con.execute(
            "SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ? AND s.expires_at > ?", (t, int(time.time()))).fetchone()

    def cookie(self, value, age):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return f"{COOKIE}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}{secure}"

    # ---------- GET ----------
    def do_GET(self):
        route = self.path.split("?")[0]
        if not route.startswith("/api/"):
            return super().do_GET()
        con = db()
        try:
            if route == "/api/me":
                u = self.current_user(con)
                if not u:
                    return self.send_json(401, {"error": "Не авторизован"})
                has = lambda t: con.execute(f"SELECT 1 FROM {t} WHERE user_id = ?", (u["id"],)).fetchone() is not None
                return self.send_json(200, {"username": u["username"], "is_admin": bool(u["is_admin"]),
                                            "has_about": has("about"), "has_review": has("reviews")})
            if route == "/api/about":      # рассказы о себе видят все
                rows = con.execute("SELECT a.id, u.username, a.text, a.created_at FROM about a "
                                   "JOIN users u ON u.id = a.user_id ORDER BY a.id DESC").fetchall()
                return self.send_json(200, {"items": [dict(r) for r in rows]})
            if route == "/api/reviews":    # отзывы видят все
                rows = con.execute("SELECT r.id, u.username, r.rating, r.text, r.created_at FROM reviews r "
                                   "JOIN users u ON u.id = r.user_id ORDER BY r.id DESC").fetchall()
                return self.send_json(200, {"items": [dict(r) for r in rows]})
            self.send_json(404, {"error": "Не найдено"})
        finally:
            con.close()

    # ---------- POST ----------
    def do_POST(self):
        route = self.path.split("?")[0]
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Неверный запрос"})
        con = db()
        try:
            if route == "/api/register":
                return self.register(con, data)
            if route == "/api/login":
                return self.login(con, data)
            if route == "/api/logout":
                t = self.token()
                if t:
                    con.execute("DELETE FROM sessions WHERE token = ?", (t,))
                    con.commit()
                return self.send_json(200, {"ok": True}, self.cookie("", 0))
            if route == "/api/about":
                return self.add_entry(con, data, "about")
            if route == "/api/reviews":
                return self.add_entry(con, data, "reviews")
            if route == "/api/about/delete":
                return self.delete_entry(con, data, "about")
            if route == "/api/reviews/delete":
                return self.delete_entry(con, data, "reviews")
            self.send_json(404, {"error": "Не найдено"})
        finally:
            con.close()

    def add_entry(self, con, d, kind):
        u = self.current_user(con)
        if not u:
            return self.send_json(401, {"error": "Сначала войди в аккаунт"})
        text = str(d.get("text", "")).strip()
        has_about = con.execute("SELECT 1 FROM about WHERE user_id = ?", (u["id"],)).fetchone()
        if kind == "about":
            if not 10 <= len(text) <= 500:
                return self.send_json(400, {"error": "Расскажи о себе: от 10 до 500 символов"})
            if has_about:
                return self.send_json(409, {"error": "Ты уже рассказал о себе"})
            con.execute("INSERT INTO about(user_id,text,created_at) VALUES(?,?,?)",
                        (u["id"], text, int(time.time())))
        else:
            if not has_about:          # отзыв — только после рассказа о себе
                return self.send_json(403, {"error": "Сначала расскажи о себе"})
            try:
                rating = int(d.get("rating"))
            except (TypeError, ValueError):
                rating = 0
            if not 1 <= rating <= 5:
                return self.send_json(400, {"error": "Поставь оценку от 1 до 5 звёзд"})
            if not 5 <= len(text) <= 500:
                return self.send_json(400, {"error": "Отзыв: от 5 до 500 символов"})
            if con.execute("SELECT 1 FROM reviews WHERE user_id = ?", (u["id"],)).fetchone():
                return self.send_json(409, {"error": "Ты уже оставил отзыв"})
            con.execute("INSERT INTO reviews(user_id,rating,text,created_at) VALUES(?,?,?,?)",
                        (u["id"], rating, text, int(time.time())))
        con.commit()
        self.send_json(201, {"ok": True})

    def delete_entry(self, con, d, table):      # table — только "about" или "reviews"
        u = self.current_user(con)
        if not u or not u["is_admin"]:
            return self.send_json(403, {"error": "Удалять может только админ"})
        try:
            entry_id = int(d.get("id"))
        except (TypeError, ValueError):
            return self.send_json(400, {"error": "Неверный id"})
        con.execute(f"DELETE FROM {table} WHERE id = ?", (entry_id,))
        con.commit()
        self.send_json(200, {"ok": True})

    def register(self, con, d):
        username = str(d.get("username", "")).strip()
        email = str(d.get("email", "")).strip()
        password = str(d.get("password", ""))
        if not re.fullmatch(r"[\w.\-]{3,30}", username):
            return self.send_json(400, {"error": "Имя: 3–30 символов (буквы, цифры, _ . -)"})
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 120:
            return self.send_json(400, {"error": "Неверный email"})
        if not 6 <= len(password) <= 200:
            return self.send_json(400, {"error": "Пароль: минимум 6 символов"})
        if con.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            return self.send_json(409, {"error": "Такое имя уже занято"})
        if con.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            return self.send_json(409, {"error": "Этот email уже зарегистрирован"})
        salt = secrets.token_hex(16)
        try:
            con.execute("INSERT INTO users(username,email,password_hash,salt,created_at) VALUES(?,?,?,?,?)",
                        (username, email, hash_password(password, salt), salt, int(time.time())))
            con.commit()
        except sqlite3.IntegrityError:
            return self.send_json(409, {"error": "Имя или email уже заняты"})
        self.send_json(201, {"ok": True})

    def login(self, con, d):
        ip = self.client_address[0]
        if ip == "127.0.0.1":                    # запрос пришёл через туннель/прокси на этом же компьютере
            ip = self.headers.get("CF-Connecting-IP") or ip
        now = time.time()
        FAILS[ip] = [t for t in FAILS.get(ip, []) if now - t < 300]
        if len(FAILS[ip]) >= 10:
            return self.send_json(429, {"error": "Слишком много попыток. Подожди 5 минут"})
        login = str(d.get("login", "")).strip()
        password = str(d.get("password", ""))
        u = con.execute("SELECT * FROM users WHERE username = ? OR email = ?", (login, login)).fetchone()
        if not u or not hmac.compare_digest(u["password_hash"], hash_password(password, u["salt"])):
            FAILS[ip].append(now)
            return self.send_json(401, {"error": "Неверное имя или пароль"})
        token = secrets.token_urlsafe(32)
        con.execute("DELETE FROM sessions WHERE expires_at < ?", (int(now),))
        con.execute("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",
                    (token, u["id"], int(now) + SESSION_SECONDS))
        con.commit()
        self.send_json(200, {"username": u["username"]}, self.cookie(token, SESSION_SECONDS))


if __name__ == "__main__":
    init_db()
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == "--admin":      # python3 server.py --admin ИМЯ
        con = db()
        n = con.execute("UPDATE users SET is_admin = 1 WHERE username = ?", (sys.argv[2],)).rowcount
        con.commit()
        con.close()
        print(f"Готово: {sys.argv[2]} теперь админ 👑" if n else
              f"Пользователь «{sys.argv[2]}» не найден. Сначала зарегистрируйся на сайте.")
        sys.exit(0)
    print(f"NeOn запущен: http://localhost:{PORT}   (остановить: Ctrl+C)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
