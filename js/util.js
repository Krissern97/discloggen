// Felles hjelpere: DOM, handlinger (pointerdown), feedback, modaler, konfetti, applaus.

export const $  = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

export const fmtM = m => `${Math.round(m)} m`;
export const fmt1 = m => m.toLocaleString("nb-NO", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
export const fmtSide = s => Math.abs(s) < 0.5 ? "rett på linja" : `${Math.round(Math.abs(s))} m ${s < 0 ? "venstre" : "høyre"}`;
export const fmtDate = ts => new Date(ts).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
export const fmtTime = ts => new Date(ts).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

/* ---------- handlings-register + pointerdown-delegering ----------
   Alle knapper bruker data-act (+ evt. data-arg). Reagerer på pointerdown,
   aldri click — et click kan forkastes hvis fingeren sklir 2 mm.
   data-arm = to-trykks bekreftelse (aldri confirm()/alert()). */
export const ACTIONS = {};

document.addEventListener("pointerdown", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  e.preventDefault();
  tapFeedback(e.clientX, e.clientY);
  if ("arm" in el.dataset) {
    if (el.dataset.armed) {
      delete el.dataset.armed;
      el.textContent = el.dataset.orig;
    } else {
      el.dataset.armed = "1";
      el.dataset.orig = el.textContent;
      el.textContent = "Sikker? Trykk igjen";
      setTimeout(() => {
        if (el.dataset.armed) { delete el.dataset.armed; el.textContent = el.dataset.orig; }
      }, 3000);
      return;
    }
  }
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset.arg, el);
}, { passive: false });

/* ---------- synlig + følbar trykk-bekreftelse ---------- */
function tapFeedback(x, y) {
  try { navigator.vibrate && navigator.vibrate(18); } catch {}
  const r = document.createElement("div");
  r.className = "tapring";
  r.style.left = x + "px";
  r.style.top = y + "px";
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 400);
}

/* ---------- modaler ---------- */
export const openModal  = id => $("#" + id).classList.add("open");
export const closeModal = id => $("#" + id).classList.remove("open");

/* ---------- toast ---------- */
let toastT;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- hurtigresultat (flash) ----------
   Ikke-blokkerende, autoforsvinnende popup for kastresultater. Stjeler aldri
   fokus (pointer-events:none) og krever ingen bekreftelse. Ved rask
   gjentatte trykk (flere discer hentet på rad) bare byttes innholdet og
   nedtellingen for auto-forsvinn nullstilles — ingen dobbel-blink. */
let flashT;
export function flash(html, extraClass = "") {
  const el = $("#flash");
  el.innerHTML = html;
  el.className = "show" + (extraClass ? " " + extraClass : "");
  clearTimeout(flashT);
  flashT = setTimeout(() => el.classList.remove("show"), 1000);
}

/* ---------- konfetti (110 fallende divs) ---------- */
export function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["--c0", "--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--gold"];
  for (let i = 0; i < 110; i++) {
    const d = document.createElement("div");
    d.className = "confetti";
    d.style.left = Math.random() * 100 + "vw";
    d.style.background = `var(${colors[i % colors.length]})`;
    d.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    d.style.animationDelay = Math.random() * 0.5 + "s";
    d.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3800);
  }
}

/* ---------- syntetisert applaus (bandpass-filtrert støy, ingen lydfiler) ---------- */
export function applause(enabled) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dur = 1.4;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.min(1, t * 14) * Math.exp(-t * 2.2);
      ch[i] = (Math.random() * 2 - 1) * env * (0.55 + 0.45 * Math.sin(t * 31));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start();
    src.onended = () => ctx.close();
  } catch {}
}

/* ---------- re-render-kobling (settes av app.js, brukes av modulene) ---------- */
let renderFn = () => {};
export const setRender = fn => { renderFn = fn; };
export const rerender = () => renderFn();
