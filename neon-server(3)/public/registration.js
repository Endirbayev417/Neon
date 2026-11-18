/* registration.js — регистрация (данные уходят на сервер в базу) */
Auth.load().then(u => { if (u) location.href = "index.html"; });

const form = document.getElementById("regForm");
const msg = document.getElementById("msg");

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  const username = document.getElementById("user").value.trim();
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("pass").value;
  const pass2 = document.getElementById("pass2").value;

  if (username.length < 3) return showMsg(msg, "Имя — минимум 3 символа", "error");
  if (pass.length < 6) return showMsg(msg, "Пароль — минимум 6 символов", "error");
  if (pass !== pass2) return showMsg(msg, "Пароли не совпадают", "error");

  const res = await Auth.register(username, email, pass);
  if (!res.ok) return showMsg(msg, res.error || "Ошибка регистрации", "error");

  showMsg(msg, "Готово! Аккаунт создан ✨ Переходим ко входу...", "ok");
  form.reset();
  setTimeout(() => location.href = "login.html", 1400);
});
