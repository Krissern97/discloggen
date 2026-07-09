// Treningsmodus: start økt → merk kastested (+ siktepunkt) → «Kaster»: trykk
// discen for hvert kast → «Henter»: stå ved discen og trykk den → lengde og
// retning beregnes. Nye runder når du kaster tilbake andre veien.

import { $, ACTIONS, openModal, closeModal, toast, confetti, applause, esc, fmtM, fmt1, fmtSide, fmtDate, rerender, uid } from "./util.js";
import { S, saveCur, saveSessions, saveSet, snapshot, undo, canUndo, clearUndo, discById, activeDiscs, curRound, allThrows, missOf } from "./state.js";
import { measurePoint, decompose, distM } from "./geo.js";

/* ---------- rendering ---------- */

let gpsAcc = null;   // siste kjente nøyaktighet under aktiv økt
let gpsWatch = null;
let wakeLock = null;

export function renderTrain() {
  const v = $("#v-train");
  if (!S.cur) { v.innerHTML = idleHTML(); return; }
  v.innerHTML = liveHTML();
}

function idleHTML() {
  const last = S.sessions[S.sessions.length - 1];
  const discs = activeDiscs();
  let lastCard = "";
  if (last) {
    const th = last.rounds.flatMap(r => r.throws);
    const maks = th.length ? Math.max(...th.map(t => t.dist)) : 0;
    lastCard = `<div class="card mt12">
      <div class="eyebrow">Siste økt · ${fmtDate(last.ts)}</div>
      <div class="row mt8"><span class="sub">${th.length} kast</span>
      <span class="v num">maks ${fmtM(maks)}</span></div></div>`;
  }
  const noDiscs = !discs.length ? `<div class="card mt12 center">
      <p class="sub">Du har ingen discer ennå. Legg til discene dine først, så kan du logge kast på dem.</p>
      <button class="ghost mt12" data-act="tab" data-arg="discs" style="width:100%">🎒 Legg til discer</button>
    </div>` : "";
  return `
    <div class="eyebrow">Discloggen</div>
    <h1>Trening</h1>
    <div class="target-card mt12">
      <div class="bignum">🥏</div>
      <p class="sub" style="margin:4px 0 12px">Still deg der du skal kaste fra, og start økten.
      Appen merker kastestedet med GPS.</p>
      <button class="primary big playbtn" data-act="start-session" data-arg="L" ${discs.length ? "" : "disabled"}>Start lengdeøkt</button>
      <button class="ghost playbtn mt8" data-act="start-session" data-arg="P" style="width:100%;min-height:56px" ${discs.length ? "" : "disabled"}>🎯 Start presisjonsøkt</button>
      <p class="sub" style="margin-top:8px">Presisjon: velg et mål (f.eks. midt på banen) og
      logg hvor nærme hvert kast lander — fint for puttere.</p>
    </div>
    ${noDiscs}${lastCard}
    ${S.set.demo ? `<div class="chip mt12" style="align-self:center">🧪 Testmodus: simulert GPS</div>` : ""}`;
}

function liveHTML() {
  const r = curRound();
  const P = S.cur.sm === "P";
  const throws = S.cur.rounds.flatMap(x => x.throws);
  const pendAll = S.cur.rounds.flatMap(x => x.pend);
  const mode = S.mode;

  let kpi;
  if (P) {
    const misses = throws.filter(t => t.td !== undefined).map(missOf);
    const snittB = misses.length ? misses.reduce((a, m) => a + m, 0) / misses.length : 0;
    kpi = `
      <div class="stat"><b class="num">${throws.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${misses.length ? fmt1(snittB) : "–"}</b><span>Snitt bom m</span></div>
      <div class="stat gold"><b class="num">${misses.length ? fmt1(Math.min(...misses)) : "–"}</b><span>Beste m</span></div>`;
  } else {
    const snitt = throws.length ? throws.reduce((a, t) => a + t.dist, 0) / throws.length : 0;
    const maks = throws.length ? Math.max(...throws.map(t => t.dist)) : 0;
    kpi = `
      <div class="stat"><b class="num">${throws.length}</b><span>Kast</span></div>
      <div class="stat"><b class="num">${throws.length ? fmt1(snitt) : "–"}</b><span>Snitt m</span></div>
      <div class="stat gold"><b class="num">${throws.length ? Math.round(maks) : "–"}</b><span>Maks m</span></div>`;
  }

  const gps = S.set.demo
    ? `<span class="chip ok">🧪 demo</span>`
    : gpsAcc === null
      ? `<span class="chip">GPS …</span>`
      : `<span class="chip ${gpsAcc <= 12 ? "ok" : "bad"}">GPS ±${Math.round(gpsAcc)} m</span>`;

  const discs = activeDiscs();
  const grid = (mode === "kast" ? discs : discs.filter(d => r.pend.some(p => p.discId === d.id)))
    .map(d => discBtn(d, r, mode)).join("");

  const gridBody = grid || `<div class="card center" style="grid-column:1/-1">
    <p class="sub">${mode === "hent" ? "Ingen discer er ute i denne runden. Bytt til «Kaster» og logg kastene først." : "Ingen discer — legg til i Discer-fanen."}</p></div>`;

  return `
    <div class="row">
      <div><div class="eyebrow">${P ? "🎯 Presisjonsøkt" : "Lengdeøkt"} · runde ${S.cur.rounds.length}</div></div>
      <div style="display:flex;gap:6px">${gps}</div>
    </div>
    <div class="statrow mt8">${kpi}</div>
    <div class="seg mt8">
      <button class="${mode === "kast" ? "on" : ""}" data-act="mode" data-arg="kast">🥏 Kaster</button>
      <button class="${mode === "hent" ? "on" : ""}" data-act="mode" data-arg="hent">🚶 Henter${pendAll.length ? ` (${pendAll.length})` : ""}</button>
    </div>
    ${mode === "kast" ? `
    <div class="seg mt8">
      <button class="${S.set.kt === "BH" ? "on" : ""}" data-act="kt" data-arg="BH">Backhand</button>
      <button class="${S.set.kt === "FH" ? "on" : ""}" data-act="kt" data-arg="FH">Forehand</button>
    </div>
    <p class="sub mt8 center">Trykk på discen i det du kaster den${P ? " mot målet" : ""}</p>` : `
    <p class="sub mt8 center">Stå ved discen og trykk på den — posisjonen måles der du står</p>`}
    <div class="discgrid mt8">${gridBody}</div>
    ${!r.aim ? `<button class="ghost mt8 playbtn" data-act="set-aim" style="width:100%">${P ? "🎯 Merk målet (må settes før landing)" : "🎯 Sett siktepunkt (for retningsstatistikk)"}</button>` : ""}
    <div class="btnrow" style="margin-bottom:6px">
      <button class="ghost playbtn" data-act="undo" ${canUndo() ? "" : "disabled"}>↩︎ Angre</button>
      <button class="ghost playbtn" data-act="new-round">Ny runde</button>
      <button class="danger playbtn" data-act="end-session" data-arm>Avslutt</button>
    </div>`;
}

function discBtn(d, r, mode) {
  const pend = r.pend.filter(p => p.discId === d.id).length;
  const thrown = r.throws.filter(t => t.discId === d.id).length;
  const badge = mode === "kast" ? pend + thrown : pend;
  const img = d.img ? `<img src="${d.img}" alt="">` : `<span class="noimg">🥏</span>`;
  return `<button class="discbtn playbtn" data-act="disc-tap" data-arg="${d.id}" style="--dc:var(--c${d.ci})">
    ${badge ? `<span class="badge num">${badge}</span>` : ""}
    ${img}<b>${esc(d.navn)}</b><small>${esc(d.type)}</small></button>`;
}

/* ---------- økt-livssyklus ---------- */

async function startSession(sm) {
  const p = await measurePoint("Merk kastested", "start");
  if (!p) return;
  S.cur = { id: uid(), ts: Date.now(), sm, rounds: [{ start: p, aim: null, pend: [], throws: [] }] };
  S.mode = "kast";
  clearUndo();
  saveCur();
  startGpsChip();
  reqWakeLock();
  rerender();
  if (sm === "P") openAim([
    { act: "aim-new", label: "🎯 Merk målet nå", primary: true },
    { act: "aim-none", label: "Senere" },
  ], "Gå til målet ditt (f.eks. midt på banen) og merk punktet. Hvert kast måles mot dette målet.");
  else openAim([
    { act: "aim-new", label: "🎯 Mål siktepunkt nå", primary: true },
    { act: "aim-none", label: "Senere / uten siktepunkt" },
  ], "Gå mot målet ditt (eller dit du sikter) og merk punktet. Du kan også gjøre det når du henter discene.");
}

function endSession() {
  const pend = S.cur.rounds.flatMap(r => r.pend);
  if (pend.length) {
    $("#end-info").textContent =
      `${pend.length} kast har ikke fått registrert landing (${pend.map(p => discById(p.discId)?.navn ?? "?").join(", ")}). ` +
      `Avslutter du nå, telles ikke disse kastene.`;
    openModal("m-end");
    return;
  }
  finishSession();
}

function finishSession() {
  closeModal("m-end");
  const throws = S.cur.rounds.flatMap(r => r.throws);
  for (const r of S.cur.rounds) r.pend = [];
  if (throws.length) {
    S.cur.end = Date.now();
    S.sessions.push(S.cur);
    saveSessions();
    toast(`Økt lagret — ${throws.length} kast 🎉`);
  } else {
    toast("Økt avsluttet (ingen kast logget)");
  }
  S.cur = null;
  saveCur();
  clearUndo();
  stopGpsChip();
  releaseWakeLock();
  rerender();
}

/* ---------- kast og landing ---------- */

function logThrow(discId) {
  snapshot();
  curRound().pend.push({ id: uid(), discId, kt: S.set.kt, ts: Date.now() });
  saveCur();
  rerender();
  toast(`${discById(discId)?.navn ?? "Disc"} kastet (${S.set.kt})`);
}

async function logLanding(discId) {
  const r = curRound();
  const P = S.cur.sm === "P";
  if (P && !r.aim) { toast("Merk målet først 🎯"); return; }
  const d = discById(discId);
  const p = await measurePoint(`Landing: ${d?.navn ?? "disc"}`, "land");
  if (!p) return;

  // rekord/snitt beregnes mot historikken FØR dette kastet (samme øktmodus)
  const prior = allThrows().filter(t => t.discId === discId &&
    (P ? t.sm === "P" && t.td !== undefined : t.sm !== "P"));

  snapshot();
  const idx = r.pend.findIndex(x => x.discId === discId);
  const pend = idx >= 0 ? r.pend.splice(idx, 1)[0]
    : { id: uid(), discId, kt: S.set.kt, ts: Date.now() }; // glemt å logge kastet — tilgi
  const { dist, side, frem } = decompose(r.start, r.aim, p);
  const t = { id: pend.id, discId, kt: pend.kt, dist, side, frem, acc: p.acc, ts: Date.now(), pos: { la: p.la, lo: p.lo } };
  if (P) t.td = distM(r.start, r.aim);
  r.throws.push(t);
  saveCur();

  let isRecord;
  if (P) {
    const miss = missOf(t);
    const priorBest = prior.length ? Math.min(...prior.map(missOf)) : Infinity;
    const priorAvg = prior.length ? prior.reduce((a, x) => a + missOf(x), 0) / prior.length : 0;
    isRecord = prior.length >= 3 && miss < priorBest;
    showResultP(d, miss, dist, priorAvg, prior.length, isRecord);
  } else {
    const priorMax = prior.length ? Math.max(...prior.map(x => x.dist)) : 0;
    const priorAvg = prior.length ? prior.reduce((a, x) => a + x.dist, 0) / prior.length : 0;
    isRecord = prior.length >= 3 && dist > priorMax;
    showResult(d, dist, side, priorAvg, prior.length, isRecord);
  }
  if (isRecord) { confetti(); applause(S.set.lyd); }
  rerender();
}

function showResult(d, dist, side, priorAvg, priorN, isRecord) {
  const ratio = priorN >= 3 ? dist / priorAvg : null;
  const emoji = isRecord ? "🤩"
    : ratio === null ? "🥏"
    : ratio >= 1.15 ? "🤩" : ratio >= 1.05 ? "😄" : ratio >= 0.95 ? "🙂" : ratio >= 0.85 ? "😐" : "😕";
  $("#res-emoji").textContent = emoji;
  $("#res-dist").textContent = Math.round(dist);
  $("#res-unit").textContent = "meter";
  $("#res-sub").innerHTML =
    `<b>${esc(d?.navn ?? "Disc")}</b>` +
    (side !== null ? ` · ${fmtSide(side)}` : "") +
    (ratio !== null ? `<br>snitt for discen: ${fmt1(priorAvg)} m` : "");
  $("#res-record").textContent = "🏆 Ny rekord!";
  $("#res-record").style.display = isRecord ? "" : "none";
  openModal("m-result");
}

function showResultP(d, miss, dist, priorAvg, priorN, isRecord) {
  const emoji = isRecord ? "🤩"
    : miss <= 1.5 ? "🤩" : miss <= 3 ? "😄" : miss <= 6 ? "🙂" : miss <= 10 ? "😐" : "😕";
  $("#res-emoji").textContent = emoji;
  $("#res-dist").textContent = fmt1(miss);
  $("#res-unit").textContent = "meter fra målet";
  $("#res-sub").innerHTML =
    `<b>${esc(d?.navn ?? "Disc")}</b> · kastet ${fmtM(dist)}` +
    (priorN >= 3 ? `<br>snitt bom for discen: ${fmt1(priorAvg)} m` : "");
  $("#res-record").textContent = "🎯 Ny bestenotering!";
  $("#res-record").style.display = isRecord ? "" : "none";
  openModal("m-result");
}

/* ---------- ny runde + siktepunkt ---------- */

async function newRound() {
  const p = await measurePoint("Merk nytt kastested", "start");
  if (!p) return;
  snapshot();
  S.cur.rounds.push({ start: p, aim: null, pend: [], throws: [] });
  S.mode = "kast";
  saveCur();
  rerender();
  const prev = S.cur.rounds[S.cur.rounds.length - 2];
  if (S.cur.sm === "P") openAim([
    ...(prev.aim ? [{ act: "aim-keep", label: "🎯 Behold målet", primary: true }] : []),
    { act: "aim-new", label: "📍 Merk nytt mål" },
    { act: "aim-none", label: "Senere" },
  ], "Målet står som regel fast — behold det hvis du bare flyttet kastested.");
  else openAim([
    { act: "aim-prev", label: "↩️ Forrige kastested som siktepunkt", primary: true },
    ...(prev.aim ? [{ act: "aim-keep", label: "🎯 Behold forrige siktepunkt" }] : []),
    { act: "aim-new", label: "📍 Mål nytt siktepunkt" },
    { act: "aim-none", label: "Uten siktepunkt" },
  ], "Kaster du tilbake dit du kom fra, er forrige kastested det naturlige siktepunktet.");
}

function openAim(opts, hint) {
  $("#aim-opts").innerHTML =
    `<p class="sub" style="margin-bottom:10px">${hint}</p>` +
    opts.map(o => `<button class="${o.primary ? "primary" : "ghost"} playbtn mt8" style="width:100%" data-act="${o.act}">${o.label}</button>`).join("");
  openModal("m-aim");
}

async function aimNew() {
  closeModal("m-aim");
  const P = S.cur.sm === "P";
  const p = await measurePoint(P ? "Merk målet" : "Merk siktepunkt", "aim");
  if (!p) { rerender(); return; }
  curRound().aim = p;
  saveCur();
  recompute(curRound());
  toast(P ? "Mål satt 🎯" : "Siktepunkt satt 🎯");
  rerender();
}

/* når siktepunkt/mål settes/endres etter at kast alt er logget i runden */
function recompute(r) {
  const td = S.cur.sm === "P" && r.aim ? distM(r.start, r.aim) : null;
  for (const t of r.throws) {
    const { dist, side, frem } = decompose(r.start, r.aim, t.pos);
    t.dist = dist; t.side = side; t.frem = frem;
    if (td !== null) t.td = td;
  }
  saveCur();
}

/* ---------- GPS-chip + Wake Lock under aktiv økt ---------- */

function startGpsChip() {
  if (S.set.demo || !("geolocation" in navigator) || gpsWatch !== null) return;
  gpsWatch = navigator.geolocation.watchPosition(p => {
    gpsAcc = p.coords.accuracy;
    const chip = $("#v-train .chip");
    if (chip && S.cur) renderTrain();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function stopGpsChip() {
  if (gpsWatch !== null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
  gpsAcc = null;
}

async function reqWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.cur) reqWakeLock();
});

/* gjenoppta pågående økt etter reload/app-bytte */
export function resumeSession() {
  if (!S.cur) return;
  startGpsChip();
  reqWakeLock();
  toast("Pågående økt gjenopptatt");
}

/* ---------- handlinger ---------- */

Object.assign(ACTIONS, {
  "start-session": arg => startSession(arg === "P" ? "P" : "L"),
  "end-session":   endSession,
  "end-anyway":    finishSession,
  "end-cancel":    () => closeModal("m-end"),
  "mode": arg => { S.mode = arg; rerender(); },
  "kt":   arg => { S.set.kt = arg; saveSet(); rerender(); },
  "disc-tap": arg => { S.mode === "kast" ? logThrow(arg) : logLanding(arg); },
  "undo": () => { if (undo()) { toast("Angret"); rerender(); } },
  "new-round": newRound,
  "set-aim": aimNew,
  "aim-new": aimNew,
  "aim-none": () => { closeModal("m-aim"); rerender(); },
  "aim-keep": () => {
    const rounds = S.cur.rounds;
    curRound().aim = rounds[rounds.length - 2].aim;
    saveCur(); closeModal("m-aim"); rerender();
  },
  "aim-prev": () => {
    const rounds = S.cur.rounds;
    curRound().aim = rounds[rounds.length - 2].start;
    saveCur(); closeModal("m-aim"); toast("Sikter mot forrige kastested 🎯"); rerender();
  },
  "result-close": () => closeModal("m-result"),
});
