// GPS: haversine, peiling, sideavvik — og målemodalen som samler målinger
// og gir et vektet snitt. Geolocation krever HTTPS (GitHub Pages) eller localhost.

import { $, ACTIONS, openModal, closeModal } from "./util.js";
import { S, curRound } from "./state.js";

const R = 6371000;
const rad = x => x * Math.PI / 180;

/* avstand i meter mellom {la,lo} */
export function distM(a, b) {
  const dLat = rad(b.la - a.la), dLon = rad(b.lo - a.lo);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.la)) * Math.cos(rad(b.la)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* peiling a→b i grader (0 = nord) */
export function bearing(a, b) {
  const dLon = rad(b.lo - a.lo);
  const y = Math.sin(dLon) * Math.cos(rad(b.la));
  const x = Math.cos(rad(a.la)) * Math.sin(rad(b.la)) -
    Math.sin(rad(a.la)) * Math.cos(rad(b.la)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/* nytt punkt gitt utgangspunkt, peiling (grader) og avstand (meter) */
export function destination(p, brg, dist) {
  const d = dist / R, b = rad(brg), la1 = rad(p.la), lo1 = rad(p.lo);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1),
    Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { la: la2 * 180 / Math.PI, lo: lo2 * 180 / Math.PI };
}

/* kast dekomponert relativt til siktelinja start→aim:
   frem = meter langs linja, side = meter på tvers (+høyre, −venstre) */
export function decompose(start, aim, landing) {
  const dist = distM(start, landing);
  if (!aim) return { dist, side: null, frem: null };
  const diff = rad(((bearing(start, landing) - bearing(start, aim) + 540) % 360) - 180);
  return { dist, side: dist * Math.sin(diff), frem: dist * Math.cos(diff) };
}

/* ---------- målemodal ----------
   measurePoint("Merk kastested") → Promise<{la,lo,acc} | null>
   Samler GPS-fikser mens brukeren står stille og gir et vektet snitt av de
   beste. Brukeren bestemmer når punktet er godt nok («Bruk punkt»). */

let meas = null; // {watchId, samples, resolve}

export function measurePoint(title, kind = "land") {
  if (S.set.demo) return Promise.resolve(demoPoint(kind));
  return new Promise(resolve => {
    $("#ms-title").textContent = title;
    $("#ms-acc").textContent = "–";
    $("#ms-acc").className = "acc num";
    $("#ms-hint").textContent = "Venter på GPS-signal … stå i ro.";
    $("#ms-use").disabled = true;
    openModal("m-measure");
    meas = { samples: [], resolve, watchId: startWatch(), kind };
  });
}

function startWatch() {
  if (!("geolocation" in navigator)) {
    $("#ms-hint").textContent = "Denne enheten har ikke GPS/stedstjenester.";
    return null;
  }
  return navigator.geolocation.watchPosition(p => {
    if (!meas) return;
    meas.samples.push({ la: p.coords.latitude, lo: p.coords.longitude, acc: p.coords.accuracy });
    const b = best(meas.samples);
    const el = $("#ms-acc");
    el.textContent = `±${Math.round(b.acc)} m`;
    el.className = "acc num " + (b.acc <= 12 ? "good" : "bad");
    $("#ms-hint").textContent = b.acc <= 12
      ? "Godt signal — trykk «Bruk punkt»."
      : "Dårlig nøyaktighet (mål: under 12 m). Vent litt, eller bruk punktet likevel.";
    $("#ms-use").disabled = false;
  }, err => {
    if (!meas) return;
    $("#ms-hint").textContent = err.code === 1
      ? "Stedstilgang avslått — gi appen tilgang til posisjon i nettleseren."
      : "Fikk ikke GPS-posisjon. Prøv «Mål på nytt».";
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}

/* vektet snitt av fiksene med best nøyaktighet */
function best(samples) {
  const minAcc = Math.min(...samples.map(s => s.acc));
  const use = samples.filter(s => s.acc <= minAcc * 1.5);
  let la = 0, lo = 0, w = 0;
  for (const s of use) {
    const wi = 1 / (s.acc * s.acc);
    la += s.la * wi; lo += s.lo * wi; w += wi;
  }
  return { la: la / w, lo: lo / w, acc: Math.max(minAcc, minAcc / Math.sqrt(use.length)) };
}

function stopMeasure(result) {
  if (!meas) return;
  if (meas.watchId !== null) navigator.geolocation.clearWatch(meas.watchId);
  const { resolve } = meas;
  meas = null;
  closeModal("m-measure");
  resolve(result);
}

Object.assign(ACTIONS, {
  "measure-use":    () => { if (meas && meas.samples.length) stopMeasure(best(meas.samples)); },
  "measure-cancel": () => stopMeasure(null),
  "measure-retry":  () => {
    if (!meas) return;
    if (meas.watchId !== null) navigator.geolocation.clearWatch(meas.watchId);
    meas.samples = [];
    $("#ms-acc").textContent = "–";
    $("#ms-acc").className = "acc num";
    $("#ms-use").disabled = true;
    meas.watchId = startWatch();
  },
  "measure-map": async () => {
    if (!meas) return;
    const title = $("#ms-title").textContent;
    const kind = meas.kind;
    const samples = meas.samples;
    const center = samples.length ? best(samples) : null;
    const resolve = meas.resolve;
    if (meas.watchId !== null) navigator.geolocation.clearWatch(meas.watchId);
    meas = null;
    closeModal("m-measure");
    if (kind === "start") {
      const { pickStartOnMap } = await import("./mapaim.js");
      const result = await pickStartOnMap(title, center);
      resolve(result);
    } else {
      const r = curRound();
      const origin = r ? r.start : null;
      if (origin) {
        const { pickAimOnMap } = await import("./mapaim.js");
        const result = await pickAimOnMap(origin);
        resolve(result);
      } else {
        const { pickStartOnMap } = await import("./mapaim.js");
        const result = await pickStartOnMap(title, center);
        resolve(result);
      }
    }
  },
});

/* ---------- testmodus: simulert GPS (for utprøving innendørs/på PC) ---------- */
const DEMO_BASE = { la: 59.9139, lo: 10.7522 };
let demoStart = null;

export function demoPoint(kind) {
  const jitter = 3;
  const j = p => destination(p, Math.random() * 360, Math.random() * jitter);
  if (kind === "start") {
    demoStart = demoStart ? destination(demoStart, 180, 80) : { ...DEMO_BASE };
    return { ...j(demoStart), acc: 4 };
  }
  const presisjon = S.cur?.sm === "P";
  if (kind === "aim") {
    const from = curRound()?.start ?? demoStart ?? DEMO_BASE;
    return { ...destination(j(from), 0, presisjon ? 25 : 120), acc: 5 };
  }
  const r = curRound();
  const from = r?.start ?? demoStart ?? DEMO_BASE;
  const brg = r?.aim ? bearing(r.start, r.aim) : 0;
  if (presisjon && r?.aim) // landinger klumper seg rundt målet
    return { ...destination(r.aim, Math.random() * 360, Math.random() * 7), acc: 4 };
  const p = destination(destination(from, brg, 40 + Math.random() * 55),
    brg + 90, (Math.random() - 0.5) * 24);
  return { ...p, acc: 4 };
}
