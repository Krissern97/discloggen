// Siktepunkt valgt på satellittkart — et alternativ til å fysisk gå dit og
// GPS-måle med measurePoint(). Bruker Leaflet (vendoret lokalt, se
// vendor/leaflet/) + Esri World Imagery-fliser (gratis, ingen API-nøkkel).
// Kartbiblioteket funker offline (cachet av service worker), men selve
// flisbildene krever nett der og da — kan ikke forhåndslagres for ukjente steder.

import { $, ACTIONS, openModal, closeModal } from "./util.js";
import { distM } from "./geo.js";

let map = null;
let marker = null;
let originPt = null; // kastested — fast referansepunkt, vises men flyttes ikke
let resolveFn = null;

/* pickAimOnMap(origin) -> Promise<{la,lo,acc:null} | null>
   origin = rundens kastested, brukes som kart-senter og avstandsreferanse. */
export function pickAimOnMap(origin) {
  originPt = origin;
  return new Promise(resolve => {
    resolveFn = resolve;
    openModal("m-mapaim");
    // Leaflet må initialiseres etter at modalen faktisk har fått størrelse på
    // skjermen (ellers blir fliskartet feilberegnet/tomt) — vent to frames.
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  });
}

function initMap() {
  if (map) { map.remove(); map = null; }
  map = L.map("mapaim-map", { attributionControl: true }).setView([originPt.la, originPt.lo], 18);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 20,
    attribution: "Esri, Maxar, Earthstar Geographics",
  }).addTo(map);

  L.marker([originPt.la, originPt.lo], {
    icon: L.divIcon({ className: "", html: '<div class="mapmark mapmark-origin">▲</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    interactive: false,
  }).addTo(map);

  marker = L.marker([originPt.la, originPt.lo], {
    icon: L.divIcon({ className: "", html: '<div class="mapmark mapmark-aim">🎯</div>', iconSize: [30, 30], iconAnchor: [15, 26] }),
    draggable: true,
  }).addTo(map);
  marker.on("drag", updateDist);
  map.on("click", e => { marker.setLatLng(e.latlng); updateDist(); });
  updateDist();
}

function updateDist() {
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
