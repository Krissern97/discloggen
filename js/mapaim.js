// Kartvalg av punkter — et alternativ til å fysisk gå dit og GPS-måle med
// measurePoint(). Bruker Leaflet (vendoret lokalt, se vendor/leaflet/) +
// Esri World Imagery-fliser (gratis, ingen API-nøkkel). Kartbiblioteket
// funker offline (cachet av service worker), men selve flisbildene krever
// nett der og da — kan ikke forhåndslagres for ukjente steder.
//
// Tre modi deler samme modal (#m-mapaim):
//  - "aim":    velg ett siktepunkt/mål, kastested vises fast som referanse
//  - "start":  velg ett startpunkt (kastested)
//  - "review": se/juster BÅDE kastested og siktepunkt for aktiv runde,
//              pluss et levende «du er her»-punkt fra kontinuerlig GPS

import { $, ACTIONS, openModal, closeModal } from "./util.js";
import { distM } from "./geo.js";
import { S } from "./state.js";

let map = null;
let mode = null; // "aim" | "start" | "review"
let originPt = null;  // aim-modus: kastested, fast referanse
let startPos = null;  // start-modus: foreslått senter
let marker = null;    // aim/start-modus: den ene dragbare markøren
let startMarker = null, aimMarker = null; // review-modus
let reviewStart = null, reviewAim = null;
let liveMarker = null, liveGetter = null, liveTimer = null;
let resolveFn = null;

export function pickAimOnMap(origin) {
  mode = "aim";
  originPt = origin;
  return new Promise(resolve => {
    resolveFn = resolve;
    $("#mapaim-title").textContent = "Velg siktepunkt på kartet";
    $("#mapaim-hint").textContent = "Trykk eller dra markøren dit du vil sikte.";
    setDistRow(true);
    setUseLabel("Bruk punkt");
    openModal("m-mapaim");
    // Leaflet må initialiseres etter at modalen faktisk har fått størrelse på
    // skjermen (ellers blir fliskartet feilberegnet/tomt) — vent to frames.
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  });
}

/* pickStartOnMap(title, center) -> Promise<{la,lo,acc:null} | null>
   center = foreslått midtpunkt (GPS-fiks eller fallback). */
export function pickStartOnMap(title, center) {
  mode = "start";
  startPos = center || getFallbackLocation();
  return new Promise(resolve => {
    resolveFn = resolve;
    $("#mapaim-title").textContent = title;
    $("#mapaim-hint").textContent = "Trykk eller dra markøren dit du vil starte kastet fra.";
    setDistRow(false);
    setUseLabel("Bruk punkt");
    openModal("m-mapaim");
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  });
}

/* reviewOnMap(start, aim, liveFixGetter) -> Promise<{start,aim}|null>
   start/aim = rundens nåværende punkter (aim kan være null — vises da ikke,
   for å legge til et nytt siktepunkt bruk vanlig «Sett siktepunkt» i stedet).
   liveFixGetter() kalles periodisk og skal returnere siste kjente GPS-fiks
   ({la,lo}) eller null — polles fra den kontinuerlige GPS-en som allerede
   kjører under økten; starter ingen ny posisjonsforespørsel her. */
export function reviewOnMap(start, aim, liveFixGetter) {
  mode = "review";
  reviewStart = start;
  reviewAim = aim;
  liveGetter = liveFixGetter;
  return new Promise(resolve => {
    resolveFn = resolve;
    $("#mapaim-title").textContent = "Kart for runden";
    $("#mapaim-hint").textContent = "▲ kastested, 📍 siktepunkt — dra for å justere. Den blå prikken er posisjonen din nå.";
    setDistRow(false);
    setUseLabel("Lagre endringer");
    openModal("m-mapaim");
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  });
}

function setDistRow(show) {
  const el = $("#mapaim-dist-row");
  if (el) el.style.display = show ? "" : "none";
}
function setUseLabel(text) {
  const el = $("#mapaim-use-btn");
  if (el) el.textContent = text;
}

function getFallbackLocation() {
  if (S.sessions && S.sessions.length) {
    const lastSess = S.sessions[S.sessions.length - 1];
    if (lastSess.rounds && lastSess.rounds.length) {
      const start = lastSess.rounds[0].start;
      if (start && start.la && start.lo) return { la: start.la, lo: start.lo };
    }
  }
  return { la: 59.9139, lo: 10.7522 }; // default til Oslo
}

function addTiles() {
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 20,
    attribution: "Esri, Maxar, Earthstar Geographics",
  }).addTo(map);
}

function originIcon() {
  return L.divIcon({ className: "", html: '<div class="mapmark mapmark-origin">▲</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
}
function aimIcon() {
  // tegnestift, ikke dartskive: en pin har et entydig "punkt" (spissen
  // nederst) som skal treffe koordinaten — en sirkel har ikke det, og ga
  // inntrykk av at punktet lå et annet sted enn der man faktisk trykket.
  return L.divIcon({ className: "", html: '<div class="mapmark mapmark-aim">📍</div>', iconSize: [28, 28], iconAnchor: [14, 27] });
}
function liveIcon() {
  return L.divIcon({ className: "", html: '<div class="mapmark-live"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
}

function initMap() {
  if (map) { map.remove(); map = null; }
  clearLiveTimer();

  if (mode === "aim") {
    map = L.map("mapaim-map", { attributionControl: true }).setView([originPt.la, originPt.lo], 18);
    addTiles();
    L.marker([originPt.la, originPt.lo], { icon: originIcon(), interactive: false }).addTo(map);
    marker = L.marker([originPt.la, originPt.lo], { icon: aimIcon(), draggable: true }).addTo(map);
    marker.on("drag", updateDist);
    map.on("click", e => { marker.setLatLng(e.latlng); updateDist(); });
    updateDist();
  } else if (mode === "start") {
    map = L.map("mapaim-map", { attributionControl: true }).setView([startPos.la, startPos.lo], 18);
    addTiles();
    marker = L.marker([startPos.la, startPos.lo], { icon: aimIcon(), draggable: true }).addTo(map);
    map.on("click", e => { marker.setLatLng(e.latlng); });
  } else if (mode === "review") {
    map = L.map("mapaim-map", { attributionControl: true }).setView([reviewStart.la, reviewStart.lo], 18);
    addTiles();
    startMarker = L.marker([reviewStart.la, reviewStart.lo], { icon: originIcon(), draggable: true }).addTo(map);
    aimMarker = reviewAim
      ? L.marker([reviewAim.la, reviewAim.lo], { icon: aimIcon(), draggable: true }).addTo(map)
      : null;
    startLiveTimer();
  }
}

/* ---------- levende «du er her»-punkt (kun review-modus) ---------- */

function startLiveTimer() {
  updateLiveMarker();
  liveTimer = setInterval(updateLiveMarker, 3000);
}
function clearLiveTimer() {
  if (liveTimer !== null) { clearInterval(liveTimer); liveTimer = null; }
  liveMarker = null;
}
function updateLiveMarker() {
  if (!map || !liveGetter) return;
  const fix = liveGetter();
  if (!fix) return;
  if (liveMarker) liveMarker.setLatLng([fix.la, fix.lo]);
  else liveMarker = L.marker([fix.la, fix.lo], { icon: liveIcon(), interactive: false, zIndexOffset: 1000 }).addTo(map);
}

function updateDist() {
  if (mode !== "aim") return;
  const p = marker.getLatLng();
  $("#mapaim-dist").textContent = `${Math.round(distM(originPt, { la: p.lat, lo: p.lng }))} m`;
}

function finish(result) {
  closeModal("m-mapaim");
  clearLiveTimer();
  if (map) { map.remove(); map = null; }
  marker = null; startMarker = null; aimMarker = null;
  mode = null;
  const r = resolveFn;
  resolveFn = null;
  if (r) r(result);
}

Object.assign(ACTIONS, {
  "mapaim-use": () => {
    if (mode === "review") {
      const sp = startMarker.getLatLng();
      const ap = aimMarker ? aimMarker.getLatLng() : null;
      finish({
        start: { la: sp.lat, lo: sp.lng, acc: null },
        aim: ap ? { la: ap.lat, lo: ap.lng, acc: null } : null,
      });
      return;
    }
    const p = marker.getLatLng();
    finish({ la: p.lat, lo: p.lng, acc: null });
  },
  "mapaim-cancel": () => finish(null),
});
