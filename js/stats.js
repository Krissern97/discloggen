// Statistikk: globale KPI-er, spredningskart (SVG), per-disc-oversikt og
// økthistorikk. Alt kan filtreres på kasttype (alle / backhand / forehand).

import { $, ACTIONS, openModal, closeModal, toast, esc, fmtM, fmt1, fmtSide, fmtDate, fmtTime, rerender } from "./util.js";
import { S, saveSessions, discById, allThrows, missOf } from "./state.js";

let filter = "ALL"; // ALL | BH | FH

/* ---------- hovedvisning ---------- */

export function renderStats() {
  const v = $("#v-stats");
  const throws = allThrows(filter);
  const L = throws.filter(t => t.sm !== "P");
  const P = throws.filter(t => t.sm === "P" && t.td !== undefined);

  v.innerHTML = `
    <div class="eyebrow">Discloggen</div>
    <h1>Statistikk</h1>
    <div class="seg mt12">
      <button class="${filter === "ALL" ? "on" : ""}" data-act="sfilter" data-arg="ALL">Alle</button>
      <button class="${filter === "BH" ? "on" : ""}" data-act="sfilter" data-arg="BH">Backhand</button>
      <button class="${filter === "FH" ? "on" : ""}" data-act="sfilter" data-arg="FH">Forehand</button>
    </div>
    ${kpiHTML(L)}
    ${scatterCard(L, "Spredningskart — lengdekast")}
    ${perDiscHTML(L)}
    ${precisionHTML(P)}
    ${sessionsHTML()}
    <div style="height:12px"></div>`;
}

function kpiHTML(throws) {
  if (!throws.length) return `<div class="card mt12 center"><p class="sub">Ingen lengdekast logget${filter !== "ALL" ? " med denne kasttypen" : ""} ennå. Start en økt i Trening-fanen!</p></div>`;
  const snitt = throws.reduce((a, t) => a + t.dist, 0) / throws.length;
  const maxT = throws.reduce((a, t) => t.dist > a.dist ? t : a);
  const nSes = S.sessions.length + (S.cur ? 1 : 0);
  return `
    <div class="statrow mt12">
      <div class="stat"><b class="num">${throws.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${fmt1(snitt)}</b><span>Snitt m</span></div>
      <div class="stat gold"><b class="num">${Math.round(maxT.dist)}</b><span>Maks m</span></div>
      <div class="stat"><b class="num">${nSes}</b><span>Økter</span></div>
    </div>
    <p class="sub mt8 center">🏆 Lengste: <b>${fmtM(maxT.dist)}</b> med ${esc(discById(maxT.discId)?.navn ?? "ukjent disc")} · ${fmtDate(maxT.ts)}</p>`;
}

function perDiscHTML(throws) {
  const rows = S.discs
    .map(d => ({ d, th: throws.filter(t => t.discId === d.id) }))
    .filter(x => x.th.length)
    .sort((a, b) => avg(b.th) - avg(a.th));
  if (!rows.length) return "";
  return `<div class="card mt12"><div class="eyebrow">Per disc</div><ul class="hist">` +
    rows.map(({ d, th }) => {
      const sides = th.filter(t => t.side !== null).map(t => t.side);
      const bias = sides.length ? sides.reduce((a, s) => a + s, 0) / sides.length : null;
      const spread = sides.length > 1 ? std(sides) : null;
      return `<li>
        <span class="d"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--c${d.ci});margin-right:6px"></i>${esc(d.navn)}<br>
        <small>${th.length} kast${bias !== null ? ` · tendens ${fmtSide(bias)}` : ""}${spread !== null ? ` · spredning ±${Math.round(spread)} m` : ""}</small></span>
        <span class="v num">${fmt1(avg(th))} m<br><small style="font-weight:600;color:var(--ink2)">maks ${Math.round(Math.max(...th.map(t => t.dist)))}</small></span>
      </li>`;
    }).join("") + `</ul></div>`;
}

/* ---------- presisjonstrening (mot mål) ---------- */

function precisionHTML(P) {
  if (!P.length) return "";
  const misses = P.map(missOf);
  const snitt = misses.reduce((a, m) => a + m, 0) / misses.length;
  const inn10 = Math.round(100 * misses.filter(m => m <= 10).length / misses.length);
  const rows = S.discs
    .map(d => ({ d, th: P.filter(t => t.discId === d.id) }))
    .filter(x => x.th.length)
    .sort((a, b) => avgMiss(a.th) - avgMiss(b.th));
  return `
    <hr class="sep">
    <div class="eyebrow">🎯 Presisjonstrening</div>
    <div class="statrow mt8">
      <div class="stat"><b class="num">${P.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${fmt1(snitt)}</b><span>Snitt bom m</span></div>
      <div class="stat gold"><b class="num">${fmt1(Math.min(...misses))}</b><span>Beste m</span></div>
      <div class="stat"><b class="num">${inn10}%</b><span>Innen 10 m</span></div>
    </div>
    ${targetCard(P, "Treffbilde rundt målet")}
    <div class="card mt12"><div class="eyebrow">Per disc</div><ul class="hist">` +
    rows.map(({ d, th }) => {
      const ms = th.map(missOf);
      return `<li>
        <span class="d"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--c${d.ci});margin-right:6px"></i>${esc(d.navn)}<br>
        <small>${th.length} kast · ${Math.round(100 * ms.filter(m => m <= 10).length / ms.length)}% innen 10 m</small></span>
        <span class="v num">${fmt1(avgMiss(th))} m bom<br><small style="font-weight:600;color:var(--ink2)">beste ${fmt1(Math.min(...ms))}</small></span>
      </li>`;
    }).join("") + `</ul></div>`;
}

const avgMiss = th => th.reduce((a, t) => a + missOf(t), 0) / th.length;

/* målskive-kart: landinger relativt til målet, med avstandsringer */
function targetCard(P, title) {
  const pts = P.map(t => ({ t, x: t.side, y: t.frem - t.td }));
  const R = Math.max(6, ...pts.map(p => Math.hypot(p.x, p.y))) * 1.2;
  const W = 340, C = W / 2, PR = W / 2 - 26;
  const px = v => C + (v / R) * PR;
  const py = v => C - (v / R) * PR;
  const step = [1, 2, 5, 10, 20, 50].find(s => R / s <= 4) ?? 50;

  let rings = "";
  for (let m = step; m <= R; m += step)
    rings += `<circle cx="${C}" cy="${C}" r="${(m / R) * PR}" fill="none" stroke="var(--line)" stroke-width="1"/>
      <text x="${C + 3}" y="${py(m) + 11}" font-size="9" fill="var(--ink2)">${m} m</text>`;

  const dots = pts.map(({ t, x, y }) => {
    const d = discById(t.discId);
    const tip = `${d?.navn ?? "?"} · ${fmt1(missOf(t))} m fra målet · kast ${Math.round(t.dist)} m · ${t.kt}`;
    return `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="5"
      fill="var(--c${d?.ci ?? 0})" stroke="var(--surface)" stroke-width="1.5" data-tip="${esc(tip)}"/>`;
  }).join("");

  const used = [...new Set(P.map(t => t.discId))].map(id => discById(id)).filter(Boolean);
  const legend = used.length > 1
    ? `<div class="legend">${used.map(d => `<span><i style="background:var(--c${d.ci})"></i>${esc(d.navn)}</span>`).join("")}</div>` : "";

  return `<div class="card mt12"><div class="eyebrow">${title}</div>
    <div class="scatter mt8">
      <svg viewBox="0 0 ${W} ${W}" role="img" aria-label="Treffbilde rundt målet">
        ${rings}
        <line x1="${C - 8}" y1="${C}" x2="${C + 8}" y2="${C}" stroke="var(--ink)" stroke-width="2"/>
        <line x1="${C}" y1="${C - 8}" x2="${C}" y2="${C + 8}" stroke="var(--ink)" stroke-width="2"/>
        <text x="${C}" y="${W - 6}" text-anchor="middle" font-size="10" fill="var(--ink2)">for kort ↓ · for langt ↑ · sett fra kastested</text>
        ${dots}
      </svg>
      <div class="tip"></div>
    </div>${legend}</div>`;
}

function sessionsHTML() {
  if (!S.sessions.length) return "";
  return `<div class="card mt12"><div class="eyebrow">Økter</div><ul class="hist">` +
    [...S.sessions].reverse().map(s => {
      const th = s.rounds.flatMap(r => r.throws);
      const maks = th.length ? Math.max(...th.map(t => t.dist)) : 0;
      const P = s.sm === "P";
      const ms = P ? th.filter(t => t.td !== undefined).map(missOf) : [];
      return `<li data-act="session-open" data-arg="${s.id}" style="cursor:pointer">
        <span class="d">${P ? "🎯 " : ""}${fmtDate(s.ts)} · ${fmtTime(s.ts)}</span>
        <span class="v num">${th.length} kast · ${P
          ? (ms.length ? `snitt bom ${fmt1(ms.reduce((a, m) => a + m, 0) / ms.length)} m` : "–")
          : `maks ${Math.round(maks)} m`}</span>
      </li>`;
    }).join("") + `</ul></div>`;
}

const avg = th => th.reduce((a, t) => a + t.dist, 0) / th.length;
const avgArr = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const std = xs => {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};

/* ---------- spredningskart (SVG) ----------
   x = sideavvik fra siktelinja (+høyre/−venstre), y = meter fremover.
   Kun kast med siktepunkt kan plottes. */

function scatterCard(throws, title) {
  const pts = throws.filter(t => t.side !== null && t.frem !== null);
  const missing = throws.length - pts.length;
  if (!pts.length) {
    return throws.length ? `<div class="card mt12"><div class="eyebrow">${title}</div>
      <p class="sub mt8">Ingen kast med siktepunkt ennå — sett siktepunkt i økten for å se retningsspredning.</p></div>` : "";
  }
  const X = Math.max(12, ...pts.map(p => Math.abs(p.side))) * 1.15;
  const Y = Math.max(30, ...pts.map(p => p.frem)) * 1.1;
  const W = 340, H = 320, L = 34, Rr = 326, T = 12, B = 288, CX = (L + Rr) / 2;
  const px = s => CX + (s / X) * ((Rr - L) / 2);
  const py = f => B - (f / Y) * (B - T);
  const step = [5, 10, 20, 25, 50, 100].find(s => Y / s <= 6) ?? 100;

  let grid = "";
  for (let m = step; m <= Y; m += step)
    grid += `<line x1="${L}" y1="${py(m)}" x2="${Rr}" y2="${py(m)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 4}" y="${py(m) + 3.5}" text-anchor="end" font-size="10" fill="var(--ink2)">${m}</text>`;

  const dots = pts.map(p => {
    const d = discById(p.discId);
    const tip = `${d?.navn ?? "?"} · ${Math.round(p.dist)} m · ${fmtSide(p.side)} · ${p.kt}`;
    return `<circle cx="${px(p.side).toFixed(1)}" cy="${py(p.frem).toFixed(1)}" r="5"
      fill="var(--c${d?.ci ?? 0})" stroke="var(--surface)" stroke-width="1.5" data-tip="${esc(tip)}"/>`;
  }).join("");

  const used = [...new Set(pts.map(p => p.discId))].map(id => discById(id)).filter(Boolean);
  const legend = used.length > 1
    ? `<div class="legend">${used.map(d => `<span><i style="background:var(--c${d.ci})"></i>${esc(d.navn)}</span>`).join("")}</div>` : "";

  return `<div class="card mt12"><div class="eyebrow">${title}</div>
    <div class="scatter mt8">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spredningskart over kast">
        ${grid}
        <line x1="${CX}" y1="${T}" x2="${CX}" y2="${B}" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="4 4" opacity=".6"/>
        <line x1="${L}" y1="${B}" x2="${Rr}" y2="${B}" stroke="var(--line)" stroke-width="1"/>
        <path d="M ${CX - 6} ${B + 10} L ${CX + 6} ${B + 10} L ${CX} ${B - 1} Z" fill="var(--ink)"/>
        <text x="${L}" y="${H - 6}" font-size="10" fill="var(--ink2)">← venstre</text>
        <text x="${Rr}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--ink2)">høyre →</text>
        <text x="${L - 4}" y="${T + 4}" text-anchor="end" font-size="10" fill="var(--ink2)">m</text>
        ${dots}
      </svg>
      <div class="tip"></div>
    </div>
    ${legend}
    ${missing ? `<p class="sub mt8">${missing} kast uten siktepunkt vises ikke i kartet (telles i tallene).</p>` : ""}
  </div>`;
}

/* tooltip: trykk på en prikk */
document.addEventListener("pointerdown", e => {
  const tips = document.querySelectorAll(".scatter .tip");
  tips.forEach(t => { t.style.display = "none"; });
  const c = e.target.closest?.("circle[data-tip]");
  if (!c) return;
  const wrap = c.closest(".scatter");
  const tip = wrap.querySelector(".tip");
  const wr = wrap.getBoundingClientRect(), cr = c.getBoundingClientRect();
  tip.textContent = c.dataset.tip;
  tip.style.left = (cr.left + cr.width / 2 - wr.left) + "px";
  tip.style.top = (cr.top - wr.top) + "px";
  tip.style.display = "block";
});

/* ---------- øktdetalj ---------- */

function openSession(id) {
  const s = S.sessions.find(x => x.id === id);
  if (!s) return;
  const P = s.sm === "P";
  const th = s.rounds.flatMap(r => r.throws).filter(t => filter === "ALL" || t.kt === filter);
  const pTh = P ? th.filter(t => t.td !== undefined) : [];
  const ms = pTh.map(missOf);
  const kpi = P ? `
      <div class="stat"><b class="num">${th.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${ms.length ? fmt1(avgArr(ms)) : "–"}</b><span>Snitt bom m</span></div>
      <div class="stat gold"><b class="num">${ms.length ? fmt1(Math.min(...ms)) : "–"}</b><span>Beste m</span></div>
      <div class="stat"><b class="num">${ms.length ? Math.round(100 * ms.filter(m => m <= 10).length / ms.length) + "%" : "–"}</b><span>Innen 10 m</span></div>` : `
      <div class="stat"><b class="num">${th.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${th.length ? fmt1(avg(th)) : "–"}</b><span>Snitt m</span></div>
      <div class="stat gold"><b class="num">${th.length ? Math.round(Math.max(...th.map(t => t.dist))) : "–"}</b><span>Maks m</span></div>
      <div class="stat"><b class="num">${s.rounds.length}</b><span>Runder</span></div>`;
  $("#sd-body").innerHTML = `
    <h2>${P ? "🎯 " : ""}${fmtDate(s.ts)} · ${fmtTime(s.ts)}</h2>
    <div class="statrow">${kpi}</div>
    ${P ? (pTh.length ? targetCard(pTh, "Treffbilde denne økten") : "") : scatterCard(th, "Spredning denne økten")}
    ${roundsListHTML(s)}
    <div class="btnrow">
      <button class="ghost playbtn" data-act="session-close">Lukk</button>
      <button class="danger playbtn" data-act="session-del" data-arg="${s.id}" data-arm>Slett økt</button>
    </div>`;
  openModal("m-session");
}

/* ---------- runder innad i en økt ----------
   En runde = ett kast+hent-slag fra ett kastested. Listes under øktdetaljen;
   hver runde kan åpnes for et eget spredningskart/treffbilde. */

function roundSummary(s, r) {
  const th = r.throws.filter(t => filter === "ALL" || t.kt === filter);
  if (!th.length) return "0 kast";
  if (s.sm === "P") {
    const ms = th.filter(t => t.td !== undefined).map(missOf);
    return ms.length ? `${th.length} kast · snitt bom ${fmt1(avgArr(ms))} m` : `${th.length} kast`;
  }
  return `${th.length} kast · snitt ${fmt1(avg(th))} m`;
}

function roundsListHTML(s) {
  return `<div class="card mt12"><div class="eyebrow">Runder</div><ul class="hist">` +
    s.rounds.map((r, i) => `<li data-act="round-open" data-arg="${s.id}:${i}" style="cursor:pointer">
        <span class="d">Runde ${i + 1}${r.ts ? ` · ${fmtTime(r.ts)}` : ""}</span>
        <span class="v num">${roundSummary(s, r)}</span>
      </li>`).join("") + `</ul></div>`;
}

function openRound(sessionId, idx) {
  const s = S.sessions.find(x => x.id === sessionId);
  if (!s) return;
  const r = s.rounds[idx];
  if (!r) return;
  const P = s.sm === "P";
  const th = r.throws.filter(t => filter === "ALL" || t.kt === filter);
  const pTh = P ? th.filter(t => t.td !== undefined) : [];
  const ms = pTh.map(missOf);
  const kpi = P ? `
      <div class="stat"><b class="num">${th.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${ms.length ? fmt1(avgArr(ms)) : "–"}</b><span>Snitt bom m</span></div>
      <div class="stat gold"><b class="num">${ms.length ? fmt1(Math.min(...ms)) : "–"}</b><span>Beste m</span></div>
      <div class="stat"><b class="num">${idx + 1}</b><span>Runde</span></div>` : `
      <div class="stat"><b class="num">${th.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${th.length ? fmt1(avg(th)) : "–"}</b><span>Snitt m</span></div>
      <div class="stat gold"><b class="num">${th.length ? Math.round(Math.max(...th.map(t => t.dist))) : "–"}</b><span>Maks m</span></div>
      <div class="stat"><b class="num">${idx + 1}</b><span>Runde</span></div>`;
  $("#sd-body").innerHTML = `
    <button class="ghost playbtn" data-act="session-open" data-arg="${s.id}" style="margin-bottom:10px">← Tilbake til økt</button>
    <h2>${P ? "🎯 " : ""}Runde ${idx + 1} · ${fmtDate(s.ts)}${r.ts ? " · " + fmtTime(r.ts) : ""}</h2>
    <div class="statrow">${kpi}</div>
    ${P ? (pTh.length ? targetCard(pTh, "Treffbilde denne runden") : "<p class=\"sub mt8\">Ingen kast med mål satt i denne runden.</p>")
         : scatterCard(th, "Spredning denne runden")}
    <div class="btnrow">
      <button class="ghost playbtn" data-act="session-close">Lukk</button>
    </div>`;
  openModal("m-session");
}

Object.assign(ACTIONS, {
  "sfilter": arg => { filter = arg; renderStats(); },
  "session-open": openSession,
  "session-close": () => closeModal("m-session"),
  "session-del": id => {
    S.sessions = S.sessions.filter(x => x.id !== id);
    saveSessions();
    closeModal("m-session");
    toast("Økt slettet");
    rerender();
  },
  "round-open": arg => {
    const i = arg.lastIndexOf(":");
    openRound(arg.slice(0, i), Number(arg.slice(i + 1)));
  },
});
