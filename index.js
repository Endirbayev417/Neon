/* index.js — главная: меню, «О себе», отзывы, админ, анимации */
const menu = document.getElementById("menu");
const startBtn = document.getElementById("startBtn");
const aboutBox = document.getElementById("aboutBox"), aboutList = document.getElementById("aboutList");
const reviewBox = document.getElementById("reviewBox"), reviewList = document.getElementById("reviewList");
let me = null;            // данные о вошедшем пользователе (или null)
let justPosted = false;   // только что рассказал о себе → подсветить форму отзыва

/* ---------- помощники (всё через textContent: чужой текст не сможет сломать страницу) ---------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function link(text, href, cls) { const a = el("a", cls, text); a.href = href; return a; }
function li(child) { const l = document.createElement("li"); l.appendChild(child); return l; }
function infoPanel(text, ...buttons) {
  const p = el("div", "panel center");
  p.appendChild(el("p", "", text));
  buttons.forEach(b => p.appendChild(b));
  return p;
}
const loginButtons = () => [link("Войти", "login.html", "btn"), link("Регистрация", "registration.html", "btn")];

/* ---------- меню ---------- */
function renderMenu() {
  menu.replaceChildren(li(link("О нас", "#about")), li(link("О себе", "#people")), li(link("Отзывы", "#reviews")));
  if (!me) {
    menu.append(li(link("Вход", "login.html")), li(link("Регистрация", "registration.html", "btn")));
    startBtn.textContent = "Начать"; startBtn.href = "registration.html";
    return;
  }
  menu.appendChild(el("li", "user-badge", (me.is_admin ? "👑 " : "👤 ") + me.username + (me.is_admin ? " · админ" : "")));
  const out = link("Выйти", "#", "btn");
  out.addEventListener("click", async e => { e.preventDefault(); await Auth.logout(); location.reload(); });
  menu.appendChild(li(out));
  startBtn.textContent = "Привет, " + me.username + "!"; startBtn.href = "#people";
}

/* ---------- форма «О себе» ---------- */
function aboutForm() {
  const form = el("form", "panel");
  const ta = el("textarea");
  ta.maxLength = 500; ta.required = true;
  ta.placeholder = "Как тебя зовут, чем занимаешься, что любишь... (от 10 символов)";
  const counter = el("span", "counter", "0 / 500");
  const btn = el("button", "btn", "Рассказать"); btn.type = "submit";
  const err = el("p", "err");
  const row = el("div", "row"); row.append(counter, btn);
  form.append(ta, row, err);
  ta.addEventListener("input", () => counter.textContent = ta.value.length + " / 500");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const r = await Auth.api("about", { text: ta.value.trim() });
    if (!r.ok) { err.textContent = r.error || "Ошибка"; return; }
    justPosted = true;
    await refresh();                                   // после этого открывается форма отзыва
    document.getElementById("reviews").scrollIntoView({ behavior: "smooth" });
  });
  return form;
}

/* ---------- форма отзыва (появляется только после «О себе») ---------- */
function reviewForm(pulse) {
  const form = el("form", "panel" + (pulse ? " pulse" : ""));
  form.appendChild(el("p", "hint", "Спасибо, что рассказал о себе! Теперь оцени сайт и оставь отзыв 💜"));
  let rating = 0;
  const stars = el("div", "stars"), btns = [];
  for (let n = 1; n <= 5; n++) {
    const b = el("button", "star", "★"); b.type = "button";
    b.addEventListener("click", () => { rating = n; btns.forEach((x, i) => x.classList.toggle("on", i < n)); });
    btns.push(b); stars.appendChild(b);
  }
  const ta = el("textarea");
  ta.maxLength = 500; ta.required = true; ta.placeholder = "Твой отзыв (от 5 символов)";
  const counter = el("span", "counter", "0 / 500");
  const btn = el("button", "btn", "Отправить отзыв"); btn.type = "submit";
  const err = el("p", "err");
  const row = el("div", "row"); row.append(counter, btn);
  form.append(stars, ta, row, err);
  ta.addEventListener("input", () => counter.textContent = ta.value.length + " / 500");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const r = await Auth.api("reviews", { rating, text: ta.value.trim() });
    if (!r.ok) { err.textContent = r.error || "Ошибка"; return; }
    await refresh();
  });
  return form;
}

function renderBoxes() {
  aboutBox.replaceChildren(
    !me ? infoPanel("Войди в аккаунт, чтобы рассказать о себе 👋", ...loginButtons())
    : me.has_about ? infoPanel("Ты уже рассказал о себе ✨ Твоя запись ниже.")
    : aboutForm());
  reviewBox.replaceChildren(
    !me ? infoPanel("Отзыв могут оставить только зарегистрированные пользователи.", ...loginButtons())
    : !me.has_about ? infoPanel("🔒 Сначала расскажи о себе — тогда здесь откроется форма отзыва.", link("Рассказать о себе", "#people", "btn"))
    : !me.has_review ? reviewForm(justPosted)
    : infoPanel("Спасибо за отзыв 💜"));
}

/* ---------- стена записей ---------- */
function note(item, kind) {
  const n = el("article", "note");
  const head = el("div", "head"), who = el("div");
  who.append(el("div", "name", item.username), el("div", "date", new Date(item.created_at * 1000).toLocaleDateString("ru-RU")));
  head.append(el("div", "avatar", item.username[0].toUpperCase()), who);
  n.appendChild(head);
  if (kind === "reviews") n.appendChild(el("div", "rate", "★".repeat(item.rating) + "☆".repeat(5 - item.rating)));
  n.appendChild(el("p", "", item.text));
  if (me && me.is_admin) {                              // кнопка удаления — только у админа
    const del = el("button", "del", "🗑 Удалить"); del.type = "button";
    del.addEventListener("click", async () => {
      if (!confirm("Удалить эту запись навсегда?")) return;
      const r = await Auth.api(kind + "/delete", { id: item.id });
      if (!r.ok) alert(r.error || "Не получилось удалить");
      await refresh();
    });
    n.appendChild(del);
  }
  return n;
}
async function renderList(kind, box) {
  const r = await Auth.api(kind);
  const items = r.ok ? r.items : [];
  box.replaceChildren();
  if (!items.length) {
    box.appendChild(el("p", "empty", kind === "about" ? "Пока никто не рассказал о себе — стань первым!" : "Отзывов пока нет."));
    return;
  }
  items.forEach((it, i) => { const n = note(it, kind); n.style.animationDelay = i * 0.08 + "s"; box.appendChild(n); });
}

async function refresh() {
  await Auth.load();
  me = Auth.info;
  renderMenu();
  renderBoxes();
  justPosted = false;
  await Promise.all([renderList("about", aboutList), renderList("reviews", reviewList)]);
}
refresh();

/* ===== анимации главной ===== */
const io = new IntersectionObserver(function (items) {
  items.forEach(function (it) {
    if (it.isIntersecting) { it.target.classList.add("show"); io.unobserve(it.target); }
  });
}, { threshold: 0.2 });
document.querySelectorAll(".card").forEach((c, n) => { c.style.animationDelay = n * 0.12 + "s"; io.observe(c); });

// бегущая строка: дублируем набор, чтобы цикл был бесшовным
const track = document.getElementById("track");
track.innerHTML += track.innerHTML;

// печатающийся текст
const typed = document.getElementById("typed");
const words = ["Учись.", "Создавай.", "Запускай свои идеи."];
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
  typed.textContent = words.join(" ");
} else {
  let w = 0, i = 0, erasing = false;
  (function type() {
    const word = words[w];
    typed.textContent = word.slice(0, i);
    let delay = erasing ? 40 : 90;
    if (!erasing && i === word.length) { erasing = true; delay = 1400; }
    else if (erasing && i === 0) { erasing = false; w = (w + 1) % words.length; delay = 350; }
    else i += erasing ? -1 : 1;
    setTimeout(type, delay);
  })();
}

// параллакс: заголовок едет медленнее прокрутки
const heroTitle = document.querySelector(".hero h1");
addEventListener("scroll", function () {
  if (scrollY < innerHeight) heroTitle.style.transform = "translateY(" + scrollY * 0.25 + "px)";
}, { passive: true });
