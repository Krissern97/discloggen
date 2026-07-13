// Siktepunkt valgt på satellittkart — et alternativ til å fysisk gå dit og
// GPS-måle med measurePoint(). Bruker Leaflet (vendoret lokalt, se
// vendor/leaflet/) + Esri World Imagery-fliser (gratis, ingen API-nøkkel).
// Kartbiblioteket funker offline (cachet av service worker), men selve
// flisbildene krever nett der og da — kan ikke forhåndslagres for ukjente steder.

import { $, ACTIONS, openModal, closeModal } from "./util.js";
import { distM } from "./geo.js";
import { S } from "./state.js";

let map = null;
let marker = null;
let originPt = null; // kastested — fast referansepunkt, vises men flyttes ikke
let startPos = null; // koordinater når startpunkt velges på kartet
let resolveFn = null;

/* pickAimOnMap(origin) -> Promise<{la,lo,acc:null} | null>
   origin = rundens kastested, brukes som kart-senter og avstandsreferanse. */
export function pickAimOnMap(origin) {
  originPt = origin;
  startPos = null;
  return new Promise(resolve => {
    resolveFn = resolve;
    $("#mapaim-title").textContent = "Velg siktepunkt på kartet";
    $("#mapaim-hint").textContent = "Trykk eller dra markøren dit du vil sikte.";
    const distRow = $("#mapaim-dist-row");
    if (distRow) distRow.style.display = "";
    openModal("m-mapaim");
    // Leaflet må initialiseres etter at modalen faktisk har fått størrelse på
    // skjermen (ellers blir fliskartet feilberegnet/tomt) — vent to frames.
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  });
}

/* pickStartOnMap(title, center) -> Promise<{la,lo,acc:null} | null>
   center = foreslått midtpunkt (GPS-fiks eller fallback). */
export function pickStartOnMap(title, center) {
  originPt = null;
  startPos = center || getFallbackLocation();
  return new Promise(resolve => {
    resolveFn = resolve;
    $("#mapaim-title").textContent = title;
    $("#mapaim-hint").textContent = "Trykk eller dra markøren dit du vil starte kastet fra.";
    const distRow = $("#mapaim-dist-row");
    if (distRow) distRow.style.display = "none";
    openModal("m-mapaim");
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  });
}

function getFallbackLocation() {
  if (S.sessions && S.sessions.length) {
    const lastSess = S.sessions[S.sessions.length - 1];
    if (lastSess.rounds && lastSess.rounds.length) {
      const start = lastSess.rounds[0].start;
      if (start && start.la && start.lo) {
        return { la: start.la, lo: start.lo };
      }
    }
  }
  return { la: 59.9139, lo: 10.7522 }; // default til Oslo
}

function initMap() {
  if (map) { map.remove(); map = null; }
  const center = originPt ? [originPt.la, originPt.lo] : [startPos.la, startPos.lo];
  map = L.map("mapaim-map", { attributionControl: true }).setView(center, 18);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 20,
    attribution: "Esri, Maxar, Earthstar Geographics",
  }).addTo(map);

  if (originPt) {
    // Siktepunkt-modus
    L.marker([originPt.la, originPt.lo], {
      icon: L.divIcon({ className: "", html: '<div class="mapmark mapmark-origin">▲</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
    }).addTo(map);

    marker = L.marker([originPt.la, originPt.lo], {
      // tegnestift, ikke dartskive: en pin har et entydig "punkt" (spissen
      // nederst) som skal treffe koordinaten — en sirkel har ikke det, og
      // ga inntrykk av at punktet lå et annet sted enn der man faktisk trykket.
      icon: L.divIcon({ className: "", html: '<div class="mapmark mapmark-aim">📍</div>', iconSize: [28, 28], iconAnchor: [14, 27] }),
      draggable: true,
    }).addTo(map);
    marker.on("drag", updateDist);
    map.on("click", e => { marker.setLatLng(e.latlng); updateDist(); });
    updateDist();
  } else {
    // Startpunkt-modus
    marker = L.marker([startPos.la, startPos.lo], {
      icon: L.divIcon({ className: "", html: '<div class="mapmark mapmark-aim">📍</div>', iconSize: [28, 28], iconAnchor: [14, 27] }),
      draggable: true,
    }).addTo(map);
    map.on("click", e => { marker.setLatLng(e.latlng); });
  }
}

function updateDist() {
  if (!originPt) return;
  const p = marker.getLatLng();
  $("#mapaim-dist").textContent = `${Math.round(distM(originPt, { la: p.lat, lo: p.lng }))} m`;
}

function finish(result) {
  closeModal("m-mapaim");
  if (map) { map.remove(); map = null; }
  marker = null;
  const r = resolveFn;
  resolveFn = null;
  if (r) r(result);
}

Object.assign(ACTIONS, {
  "mapaim-use": () => {
    const p = marker.getLatLng();
    finish({ la: p.lat, lo: p.lng, acc: null });
  },
  "mapaim-cancel": () => finish(null),
});
