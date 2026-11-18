/* auth.js — общая логика: общается с сервером (server.py), данные хранятся в базе */
const Auth = {
  user: null,
  info: null,

  async api(path, data) {
    try {
      const r = await fetch("/api/" + path, {
        method: data ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: data ? JSON.stringify(data) : undefined
      });
      let j = {};
      try { j = await r.json(); } catch (e) {}
      return Object.assign({ ok: r.ok }, j);
    } catch (e) {
      return { ok: false, error: "Нет связи с сервером. Запусти: python3 server.py и открой http://localhost:8000" };
    }
  },

  async load() { const r = await this.api("me"); this.info = r.ok ? r : null; this.user = r.ok ? r.username : null; return this.user; },
  register(username, email, password) { return this.api("register", { username, email, password }); },
  async login(login, password) { const r = await this.api("login", { login, password }); if (r.ok) this.user = r.username; return r; },
  async logout() { await this.api("logout", {}); this.user = null; }
};

function showMsg(el, text, type) { el.textContent = text; el.className = "msg " + type; }

document.addEventListener("click", function (e) {
  if (!e.target.classList.contains("eye")) return;
  const input = e.target.parentElement.querySelector("input");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  e.target.textContent = show ? "🙈" : "👁";
});
