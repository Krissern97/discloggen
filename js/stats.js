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
    ${precisionHTML(P)}
    ${perDiscUnifiedHTML(L, P)}
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

/* ---------- presisjonstrening (mot mål) ---------- */

function precisionHTML(P) {
  if (!P.length) return "";
  const misses = P.map(missOf);
  const snitt = misses.reduce((a, m) => a + m, 0) / misses.length;
  const inn10 = Math.round(100 * misses.filter(m => m <= 10).length / misses.length);
  return `
    <hr class="sep">
    <div class="eyebrow">🎯 Presisjonstrening</div>
    <div class="statrow mt8">
      <div class="stat"><b class="num">${P.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${fmt1(snitt)}</b><span>Snitt bom m</span></div>
      <div class="stat gold"><b class="num">${fmt1(Math.min(...misses))}</b><span>Beste m</span></div>
      <div class="stat"><b class="num">${inn10}%</b><span>Innen 10 m</span></div>
    </div>
    ${targetCard(P, "Treffbilde rundt målet")}`;
}

/* ---------- disc-ikon (bilde med farget ramme, eller fargeprikk-fallback) ---------- */

function discIconHTML(d, cls) {
  return d.img
    ? `<img class="${cls}" src="${d.img}" alt="" style="--dc:var(--c${d.ci})">`
    : `<span class="${cls} ph" style="--dc:var(--c${d.ci})">🥏</span>`;
}

/* ---------- samlet, sorterbar per-disc-oversikt ----------
   «Totalt» er en komposittscore: hver discs snittlengde og snittbom
   normaliseres til 0..1 min-max RELATIVT TIL BRUKERENS EGNE DISCER (ikke en
   absolutt fasit) — slik kan en kort, presis putter og en lang driver
   rangeres på samme skala uten å blande meter-lengde og meter-bom urettferdig.
   Komposittscore = snitt av de to (der begge finnes), ellers den ene som finnes. */
let discSort = "totalt"; // "lengde" | "presisjon" | "totalt"

function perDiscUnifiedHTML(L, P) {
  const rows = S.discs.map(d => {
    const dl = L.filter(t => t.discId === d.id);
    const dp = P.filter(t => t.discId === d.id);
    if (!dl.length && !dp.length) return null;
    return { d, dl, dp, lengthAvg: dl.length ? avg(dl) : null, missAvg: dp.length ? avgArr(dp.map(missOf)) : null };
  }).filter(Boolean);
  if (!rows.length) return "";

  const lengths = rows.map(r => r.lengthAvg).filter(v => v !== null);
  const misses = rows.map(r => r.missAvg).filter(v => v !== null);
  const lMin = lengths.length ? Math.min(...lengths) : 0, lMax = lengths.length ? Math.max(...lengths) : 0;
  const mMin = misses.length ? Math.min(...misses) : 0, mMax = misses.length ? Math.max(...misses) : 0;
  for (const r of rows) {
    const ls = r.lengthAvg === null ? null : (lMax > lMin ? (r.lengthAvg - lMin) / (lMax - lMin) : 1);
    const ms = r.missAvg === null ? null : (mMax > mMin ? (mMax - r.missAvg) / (mMax - mMin) : 1);
    r.totalScore = ls !== null && ms !== null ? (ls + ms) / 2 : (ls ?? ms ?? 0);
  }

  const sorters = {
    lengde: (a, b) => (b.lengthAvg ?? -Infinity) - (a.lengthAvg ?? -Infinity),
    presisjon: (a, b) => (a.missAvg ?? Infinity) - (b.missAvg ?? Infinity),
    totalt: (a, b) => b.totalScore - a.totalScore,
  };
  const sorted = [...rows].sort(sorters[discSort]);

  const seg = ["lengde", "presisjon", "totalt"].map(k =>
    `<button class="${discSort === k ? "on" : ""}" data-act="dsort" data-arg="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("");

  return `<div class="card mt12">
    <div class="eyebrow">Per disc</div>
    <div class="seg mt8">${seg}</div>
    <ul class="hist mt8">${sorted.map(discRowHTML).join("")}</ul>
  </div>`;
}

function discRowHTML({ d, dl, dp, lengthAvg, missAvg }) {
  return `<li data-act="disc-open" data-arg="${d.id}" style="cursor:pointer">
    <span class="d" style="display:flex; align-items:center; gap:10px">
      ${discIconHTML(d, "discmini")}
      <span><b style="color:var(--ink); font-weight:800">${esc(d.navn)}</b><br>
      <small>${dl.length + dp.length} kast</small></span>
    </span>
    <span class="v num">
      ${lengthAvg !== null ? `${fmt1(lengthAvg)} m snitt` : ""}${lengthAvg !== null && missAvg !== null ? "<br>" : ""}
      ${missAvg !== null ? `<small style="font-weight:600;color:var(--ink2)">${fmt1(missAvg)} m bom</small>` : ""}
    </span>
  </li>`;
}

/* ---------- kart-markører ----------
   Hver markør har en usynlig, romslig trykkflate (r=14) uansett synlig stil,
   så «trykk på discen og se lengden» funker pålitelig på touch. Har discen
   et bilde, brukes det (sirkelbeskåret) som ikon; ellers en farget prikk. */
const MARK_ICON = 20; // diameter (px, i SVG-koordinater) på bilde-ikon

function clipDefs() {
  return `<defs><clipPath id="discclip" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs>`;
}

/* fint, lesbart gridline-intervall for en gitt akse-range (delt av alle kart) */
function niceStep(range, maxLines = 5) {
  return [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => range / s <= maxLines) ?? 500;
}

/* legend under kart: bilde av discen når det finnes, ellers fargeprikk */
function legendHTML(used) {
  if (used.length <= 1) return "";
  return `<div class="legend">${used.map(d =>
    `<span>${d.img ? `<img class="legicon" src="${d.img}" alt="">` : `<i style="background:var(--c${d.ci})"></i>`}${esc(d.navn)}</span>`
  ).join("")}</div>`;
}

function markerSVG(cx, cy, d, tip) {
  cx = cx.toFixed(1); cy = cy.toFixed(1);
  const ring = `var(--c${d?.ci ?? 0})`;
  const hit = `<circle cx="${cx}" cy="${cy}" r="14" fill="transparent" data-tip="${esc(tip)}"/>`;
  const mark = d?.img
    ? `<image href="${d.img}" x="${(cx - MARK_ICON / 2).toFixed(1)}" y="${(cy - MARK_ICON / 2).toFixed(1)}"
         width="${MARK_ICON}" height="${MARK_ICON}" clip-path="url(#discclip)" style="pointer-events:none"/>
       <circle cx="${cx}" cy="${cy}" r="${MARK_ICON / 2}" fill="none" stroke="${ring}" stroke-width="1.5" style="pointer-events:none"/>`
    : `<circle cx="${cx}" cy="${cy}" r="5" fill="${ring}" stroke="var(--surface)" stroke-width="1.5" style="pointer-events:none"/>`;
  return hit + mark;
}

/* målskive-kart: landinger relativt til målet, med avstandsringer.
   Senterlinja (stiplet, med trekant nederst = «du, kastestedet») er samme
   enkle visuelle referanse som i spredningskartet for lengdekast — bare en
   retningslinje, ikke skala-riktig til faktisk avstand (målet er alltid i
   sentrum her, kastestedet er ofte 30–100+ m unna og ville uansett havnet
   langt utenfor et kart zoomet inn på selve treffspredningen). */
function targetCard(P, title) {
  const pts = P.map(t => ({ t, x: t.side, y: t.frem - t.td }));
  const R = Math.max(6, ...pts.map(p => Math.hypot(p.x, p.y))) * 1.2;
  const W = 340, C = W / 2, PR = W / 2 - 26;
  const px = v => C + (v / R) * PR;
  const py = v => C - (v / R) * PR;
  const step = niceStep(R, 4);

  let rings = "";
  for (let m = step; m <= R; m += step)
    rings += `<circle cx="${C}" cy="${C}" r="${(m / R) * PR}" fill="none" stroke="var(--line)" stroke-width="1"/>
      <text x="${C + 3}" y="${py(m) + 11}" font-size="9" fill="var(--ink2)">${m} m</text>`;

  const dots = pts.map(({ t, x, y }) => {
    const d = discById(t.discId);
    const tip = `${fmt1(missOf(t))} m fra målet · ${esc(d?.navn ?? "?")} · kast ${Math.round(t.dist)} m · ${t.kt}`;
    return markerSVG(px(x), py(y), d, tip);
  }).join("");

  const used = [...new Set(P.map(t => t.discId))].map(id => discById(id)).filter(Boolean);

  return `<div class="card mt12"><div class="eyebrow">${title}</div>
    <div class="scatter mt8">
      <svg viewBox="0 0 ${W} ${W}" role="img" aria-label="Treffbilde rundt målet">
        ${clipDefs()}
        ${rings}
        <line x1="${C}" y1="0" x2="${C}" y2="${W}" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="4 4" opacity=".6"/>
        <path d="M ${C - 6} ${W - 1} L ${C + 6} ${W - 1} L ${C} ${W - 10} Z" fill="var(--ink)"/>
        <line x1="${C - 8}" y1="${C}" x2="${C + 8}" y2="${C}" stroke="var(--ink)" stroke-width="2"/>
        <line x1="${C}" y1="${C - 8}" x2="${C}" y2="${C + 8}" stroke="var(--ink)" stroke-width="2"/>
        ${dots}
      </svg>
      <div class="tip"></div>
    </div>${legendHTML(used)}
    <p class="sub mt8">Trykk et punkt for å se nøyaktig lengde. Trekanten nederst er kastested.</p></div>`;
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
  const step = niceStep(Y, 6);

  let grid = "";
  for (let m = step; m <= Y; m += step)
    grid += `<line x1="${L}" y1="${py(m)}" x2="${Rr}" y2="${py(m)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 4}" y="${py(m) + 3.5}" text-anchor="end" font-size="10" fill="var(--ink2)">${m}</text>`;

  const dots = pts.map(p => {
    const d = discById(p.discId);
    const tip = `${Math.round(p.dist)} m · ${fmtSide(p.side)} · ${esc(d?.navn ?? "?")} · ${p.kt}`;
    return markerSVG(px(p.side), py(p.frem), d, tip);
  }).join("");

  const used = [...new Set(pts.map(p => p.discId))].map(id => discById(id)).filter(Boolean);

  return `<div class="card mt12"><div class="eyebrow">${title}</div>
    <div class="scatter mt8">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spredningskart over kast">
        ${clipDefs()}
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
    ${legendHTML(used)}
    <p class="sub mt8">Trykk et punkt for å se nøyaktig lengde.${missing ? ` ${missing} kast uten siktepunkt vises ikke (telles i tallene).` : ""}</p>
  </div>`;
}

/* tooltip: trykk på en prikk (click, ikke pointerdown — se util.js) */
document.addEventListener("click", e => {
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

/* ---------- disc-detalj: trend over tid ----------
   Grupperer kast per økt (kronologisk via sessId/sessTs fra allThrows()) og
   plotter snitt per økt som en linje. X-aksen er øktrekkefølge, ikke
   kalenderdato — store pauser mellom økter klemmer da ikke sammen den
   interessante utviklingen. Gjenbruker samme .scatter/.tip-tap-mønster som
   spredningskartene, bare med en linje i stedet for et prikk-sky. */
function sessionTrend(throws, metricFn) {
  const bySess = new Map();
  for (const t of throws) {
    if (!bySess.has(t.sessId)) bySess.set(t.sessId, { ts: t.sessTs, vals: [] });
    bySess.get(t.sessId).vals.push(metricFn(t));
  }
  return [...bySess.values()].sort((a, b) => a.ts - b.ts).map(x => ({ ts: x.ts, v: avgArr(x.vals) }));
}

function trendCard(color, points, title, unit) {
  if (!points.length) return "";
  if (points.length < 2) return `<div class="card mt12"><div class="eyebrow">${title}</div>
    <p class="sub mt8">Trenden vises når du har data fra minst to økter.</p></div>`;

  const W = 340, H = 170, L = 34, R = 320, T = 14, B = 138;
  const vals = points.map(p => p.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const pad = (maxV - minV) * 0.2 || Math.max(1, maxV * 0.1);
  const Y0 = minV - pad, Y1 = maxV + pad;
  const px = i => L + (i / (points.length - 1)) * (R - L);
  const py = v => B - ((v - Y0) / (Y1 - Y0)) * (B - T);
  const step = niceStep(Y1 - Y0, 4);

  let grid = "";
  for (let g = Math.ceil(Y0 / step) * step; g <= Y1; g += step)
    grid += `<line x1="${L}" y1="${py(g).toFixed(1)}" x2="${R}" y2="${py(g).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 4}" y="${(py(g) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--ink2)">${Math.round(g * 10) / 10}</text>`;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${py(p.v).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) => {
    const tip = `${fmtDate(p.ts)} · ${fmt1(p.v)} ${unit}`;
    const cx = px(i).toFixed(1), cy = py(p.v).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="14" fill="transparent" data-tip="${esc(tip)}"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="1.5" style="pointer-events:none"/>`;
  }).join("");

  return `<div class="card mt12"><div class="eyebrow">${title}</div>
    <div class="scatter mt8">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
        ${grid}
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
        ${dots}
      </svg>
      <div class="tip"></div>
    </div>
    <p class="sub mt8">${points.length} økter · trykk et punkt for dato og verdi.</p>
  </div>`;
}

function openDiscDetail(discId) {
  const d = discById(discId);
  if (!d) return;
  const all = allThrows().filter(t => t.discId === discId);
  const L = all.filter(t => t.sm !== "P");
  const P = all.filter(t => t.sm === "P" && t.td !== undefined);
  const color = `var(--c${d.ci})`;

  const kpi = `<div class="statrow mt12">
      <div class="stat"><b class="num">${all.length}</b><span>Kast totalt</span></div>
      ${L.length ? `<div class="stat"><b class="num">${fmt1(avg(L))}</b><span>Snitt m</span></div>
        <div class="stat gold"><b class="num">${Math.round(Math.max(...L.map(t => t.dist)))}</b><span>Rekord m</span></div>` : ""}
      ${P.length ? `<div class="stat"><b class="num">${fmt1(avgArr(P.map(missOf)))}</b><span>Snitt bom m</span></div>
        <div class="stat gold"><b class="num">${fmt1(Math.min(...P.map(missOf)))}</b><span>Beste m</span></div>` : ""}
    </div>`;

  $("#sd-body").innerHTML = `
    <div style="display:flex; align-items:center; gap:12px">
      ${discIconHTML(d, "discmini")}
      <div><h2 style="margin:0">${esc(d.navn)}</h2><p class="sub" style="margin:0">${esc(d.type)}</p></div>
    </div>
    ${kpi}
    ${trendCard(color, sessionTrend(L, t => t.dist), "Lengdeutvikling", "m")}
    ${trendCard(color, sessionTrend(P, missOf), "Presisjonsutvikling", "m bom")}
    ${L.length ? scatterCard(L, "Spredning — alle lengdekast") : ""}
    ${P.length ? targetCard(P, "Treffbilde — alle presisjonskast") : ""}
    <div class="btnrow">
      <button class="ghost playbtn" data-act="session-close">Lukk</button>
    </div>`;
  openModal("m-session");
}

/* ---------- øktdetalj ---------- */
/* En runde = ett kast+hent-slag fra ett kastested. Faner («Alle», «R1», «R2» …)
   lar deg bla mellom aggregert visning og enkeltrunder uten å forlate skjermen. */

let sessionRoundSel = "ALL"; // "ALL" | rundeindeks som streng

function openSession(id) {
  sessionRoundSel = "ALL";
  paintSession(id);
  openModal("m-session");
}

function roundTabsHTML(s) {
  if (s.rounds.length < 2) return "";
  const tab = (val, label) => `<button class="${sessionRoundSel === val ? "on" : ""}" data-act="round-sel" data-arg="${s.id}:${val}">${label}</button>`;
  return `<div class="roundtabs mt12">${tab("ALL", "Alle")}${s.rounds.map((r, i) => tab(String(i), `Runde ${i + 1}`)).join("")}</div>`;
}

function paintSession(id) {
  const s = S.sessions.find(x => x.id === id);
  if (!s) return;
  const P = s.sm === "P";
  const sel = sessionRoundSel;
  const round = sel === "ALL" ? null : s.rounds[Number(sel)];
  if (sel !== "ALL" && !round) sessionRoundSel = "ALL"; // rundedata mangler — fall tilbake
  const throwsRaw = sel === "ALL" ? s.rounds.flatMap(r => r.throws) : (round?.throws ?? []);
  const th = throwsRaw.filter(t => filter === "ALL" || t.kt === filter);
  const pTh = P ? th.filter(t => t.td !== undefined) : [];
  const ms = pTh.map(missOf);
  const tds = pTh.map(t => t.td);
  const avstand = tds.length ? Math.round(avgArr(tds)) : null; // snitt hvis flere runder/mål; lik verdi for én runde
  const kpi = P ? `
      <div class="stat"><b class="num">${th.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${ms.length ? fmt1(avgArr(ms)) : "–"}</b><span>Snitt bom m</span></div>
      <div class="stat gold"><b class="num">${ms.length ? fmt1(Math.min(...ms)) : "–"}</b><span>Beste m</span></div>
      <div class="stat"><b class="num">${ms.length ? Math.round(100 * ms.filter(m => m <= 10).length / ms.length) + "%" : "–"}</b><span>Innen 10 m</span></div>
      <div class="stat"><b class="num">${avstand !== null ? avstand : "–"}</b><span>Avstand mål</span></div>` : `
      <div class="stat"><b class="num">${th.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${th.length ? fmt1(avg(th)) : "–"}</b><span>Snitt m</span></div>
      <div class="stat gold"><b class="num">${th.length ? Math.round(Math.max(...th.map(t => t.dist))) : "–"}</b><span>Maks m</span></div>
      <div class="stat"><b class="num">${sel === "ALL" ? s.rounds.length : Number(sel) + 1}</b><span>${sel === "ALL" ? "Runder" : "Runde"}</span></div>`;
  const title = sel === "ALL" ? `${fmtDate(s.ts)} · ${fmtTime(s.ts)}` : `Runde ${Number(sel) + 1} · ${fmtDate(s.ts)}`;
  const chart = P
    ? (pTh.length ? targetCard(pTh, sel === "ALL" ? "Treffbilde denne økten" : "Treffbilde denne runden") : `<p class="sub mt12">Ingen kast med mål satt ${sel === "ALL" ? "i denne økten" : "i denne runden"}.</p>`)
    : scatterCard(th, sel === "ALL" ? "Spredning denne økten" : "Spredning denne runden");
  $("#sd-body").innerHTML = `
    <h2>${P ? "🎯 " : ""}${title}</h2>
    ${roundTabsHTML(s)}
    <div class="statrow mt12">${kpi}</div>
    ${chart}
    <div class="btnrow">
      <button class="ghost playbtn" data-act="session-close">Lukk</button>
      <button class="danger playbtn" data-act="session-del" data-arg="${s.id}" data-arm>Slett økt</button>
    </div>`;
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
  "round-sel": arg => {
    const i = arg.lastIndexOf(":");
    sessionRoundSel = arg.slice(i + 1);
    paintSession(arg.slice(0, i));
  },
  "disc-open": openDiscDetail,
  "dsort": arg => { discSort = arg; renderStats(); },
});
