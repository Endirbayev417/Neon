/* fx.js — общие анимации: частицы, курсор, магнитные кнопки, наклон карточек, полоска прокрутки */
(function () {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(hover: none)").matches;

  /* 1. Полоска прокрутки + умное меню */
  const bar = document.createElement("div");
  bar.id = "fx-progress";
  document.body.appendChild(bar);
  let lastY = 0;
  addEventListener("scroll", function () {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? y / max * 100 : 0) + "%";
    const nav = document.querySelector("nav");
    if (!nav) return;
    nav.classList.toggle("solid", y > 20);
    nav.classList.toggle("hide", y > lastY && y > 120);   // вниз — прячем, вверх — показываем
    lastY = y;
  }, { passive: true });

  if (reduced) return;

  /* 2. Частицы: неоновая «сеть», отталкивается от курсора */
  const c = document.createElement("canvas");
  c.id = "fx-canvas";
  document.body.appendChild(c);
  const ctx = c.getContext("2d");
  const mouse = { x: -999, y: -999 };
  let W, H, P = [];
  function resize() {
    W = c.width = innerWidth; H = c.height = innerHeight;
    const n = Math.min(70, Math.floor(W * H / 22000));
    P = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4, r: Math.random() * 1.6 + .6
    }));
  }
  addEventListener("resize", resize);
  addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  (function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of P) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = "rgba(0,240,255,.8)"; ctx.fill();
    }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const d = Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y);
      if (d < 130) {
        ctx.strokeStyle = "rgba(122,92,255," + ((1 - d / 130) * .35) + ")";
        ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke();
      }
    }
    requestAnimationFrame(frame);
  })();
  resize();

  /* 3. Волна при клике (работает и на телефоне) */
  document.addEventListener("click", function (e) {
    const b = e.target.closest(".btn");
    if (!b) return;
    const r = b.getBoundingClientRect(), s = document.createElement("span");
    s.className = "ripple";
    s.style.left = (e.clientX - r.left) + "px";
    s.style.top = (e.clientY - r.top) + "px";
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });

  if (touch) return;

  /* 4. Свечение и кольцо за курсором */
  const glow = document.createElement("div"), ring = document.createElement("div");
  glow.className = "fx-glow"; ring.className = "fx-ring";
  document.body.append(glow, ring);
  let tx = innerWidth / 2, ty = innerHeight / 2, gx = tx, gy = ty;
  addEventListener("mousemove", e => { tx = e.clientX; ty = e.clientY; });
  (function follow() {
    gx += (tx - gx) * .12; gy += (ty - gy) * .12;       // плавное «догоняние»
    glow.style.transform = "translate(" + gx + "px," + gy + "px)";
    ring.style.transform = "translate(" + gx + "px," + gy + "px)";
    requestAnimationFrame(follow);
  })();
  document.addEventListener("mouseover", e => ring.classList.toggle("big", !!e.target.closest("a,button,.card")));

  /* 5. Магнитные кнопки + 3D-наклон карточек и формы */
  let cur = null;
  document.addEventListener("mousemove", function (e) {
    const t = e.target.closest ? e.target.closest(".btn,.card,.form") : null;
    if (cur && cur !== t) { cur.style.transform = ""; cur = null; }
    if (!t) return;
    cur = t;
    const r = t.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    if (t.classList.contains("btn")) {
      t.style.transform = "translate(" + px * 14 + "px," + (py * 10 - 3) + "px)";
    } else if (t.classList.contains("card")) {
      t.style.transform = "perspective(700px) rotateX(" + (-py * 12) + "deg) rotateY(" + (px * 12) + "deg) translateY(-8px)";
    } else if (!t.matches(":focus-within")) {
      t.style.transform = "perspective(900px) rotateX(" + (-py * 4) + "deg) rotateY(" + (px * 4) + "deg)";
    }
  });
})();
