/* login.js — вход */
Auth.load().then(u => { if (u) location.href = "index.html"; });

const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  const login = document.getElementById("user").value.trim();
  const pass = document.getElementById("pass").value;

  const res = await Auth.login(login, pass);
  if (!res.ok) return showMsg(msg, res.error || "Ошибка входа", "error");

  showMsg(msg, "Вход выполнен ⚡", "ok");
  setTimeout(() => location.href = "index.html", 800);
});
