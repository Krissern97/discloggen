// Disc-biblioteket: legg til/rediger discer med kamerabilde (sirkulær
// visningsflate, kvadratisk 256×256-raster under), type, flight numbers og
// fast statistikkfarge.

import { $, ACTIONS, openModal, closeModal, toast, esc, fmt1, fmtM, rerender, uid } from "./util.js";
import { S, saveDiscs, saveSet, discById, allThrows, missOf } from "./state.js";

const TYPES = ["Putter", "Midrange", "Fairway", "Driver"];
const NCOLORS = 8;

/* ---------- startdiscer ----------
   Ved helt fersk installasjon sås fire vanlige discer (én per type) så
   appen aldri føles tom/låst før man har lagt inn noe selv. Kjøres kun én
   gang (styrt av set.seeded), så sletter man dem senere kommer de ikke igjen. */
const DEFAULT_DISCS = [
  { navn: "Putter",  type: "Putter",   sp: 2,  gl: 3, tu: 0,  fa: 1 },
  { navn: "Midrange", type: "Midrange", sp: 4,  gl: 4, tu: 0,  fa: 1 },
  { navn: "Fairway",  type: "Fairway",  sp: 7,  gl: 5, tu: -1, fa: 1 },
  { navn: "Driver",   type: "Driver",   sp: 10, gl: 5, tu: -1, fa: 2 },
];

export function seedDefaultDiscs() {
  if (S.set.seeded) return;
  S.set.seeded = true;
  saveSet();
  if (S.discs.length || S.sessions.length || S.cur) return; // ikke fersk — ikke rør
  DEFAULT_DISCS.forEach((base, i) => S.discs.push({
    id: uid(), ...base, ci: i, img: null, ark: false, ts: Date.now(),
  }));
  saveDiscs();
}

/* ---------- visning ---------- */

/* Sortering: type (fast rekkefølge Putter→Driver), speed (flight-tall, høyest
   først), lengste (personlig rekord, lengst først) eller presisjon (snitt bom,
   lavest/best først). Discer uten relevant data for valgt sortering havner sist. */
let discsSort = "type";

function sortDiscs(list, throws) {
  const stat = new Map(list.map(d => {
    const thL = throws.filter(t => t.discId === d.id && t.sm !== "P");
    const thP = throws.filter(t => t.discId === d.id && t.sm === "P" && t.td !== undefined);
    return [d.id, {
      maxDist: thL.length ? Math.max(...thL.map(t => t.dist)) : null,
      avgMiss: thP.length ? thP.reduce((a, t) => a + missOf(t), 0) / thP.length : null,
    }];
  }));
  const sorters = {
    type: (a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.navn.localeCompare(b.navn, "nb"),
    speed: (a, b) => (b.sp ?? -Infinity) - (a.sp ?? -Infinity),
    lengste: (a, b) => (stat.get(b.id).maxDist ?? -Infinity) - (stat.get(a.id).maxDist ?? -Infinity),
    presisjon: (a, b) => (stat.get(a.id).avgMiss ?? Infinity) - (stat.get(b.id).avgMiss ?? Infinity),
  };
  return [...list].sort(sorters[discsSort]);
}

function sortSegHTML() {
  const opts = [["type", "Type"], ["speed", "Speed"], ["lengste", "Lengste"], ["presisjon", "Presisjon"]];
  return `<div class="seg mt12">${opts.map(([k, label]) =>
    `<button class="${discsSort === k ? "on" : ""}" data-act="dlsort" data-arg="${k}">${label}</button>`).join("")}</div>`;
}

export function renderDiscs() {
  const v = $("#v-discs");
  const throws = allThrows();
  const act = sortDiscs(S.discs.filter(d => !d.ark), throws);
  const ark = sortDiscs(S.discs.filter(d => d.ark), throws);

  const row = d => {
    const thL = throws.filter(t => t.discId === d.id && t.sm !== "P");
    const thP = throws.filter(t => t.discId === d.id && t.sm === "P" && t.td !== undefined);
    const flight = [d.sp, d.gl, d.tu, d.fa].some(x => x !== null && x !== undefined && x !== "")
      ? ` · ${[d.sp, d.gl, d.tu, d.fa].map(x => x ?? "–").join(" / ")}` : "";
    let mini;
    if (discsSort === "speed") mini = d.sp !== null && d.sp !== undefined ? `<b>${d.sp}</b> speed` : "–";
    else if (discsSort === "lengste") mini = thL.length ? `<b>${Math.round(Math.max(...thL.map(t => t.dist)))} m</b> lengste` : "ingen kast";
    else if (discsSort === "presisjon") mini = thP.length ? `<b>${fmt1(thP.reduce((a, t) => a + missOf(t), 0) / thP.length)} m</b> bom` : "ingen kast";
    else mini = thL.length
      ? `<b>${fmt1(thL.reduce((a, t) => a + t.dist, 0) / thL.length)} m</b>${thL.length + thP.length} kast`
      : thP.length
        ? `<b>${fmt1(thP.reduce((a, t) => a + missOf(t), 0) / thP.length)} m bom</b>${thP.length} kast`
        : "ingen kast";
    return `<button class="discrow mt8" data-act="edit-disc" data-arg="${d.id}" style="--dc:var(--c${d.ci})">
      ${d.img ? `<img src="${d.img}" alt="">` : `<span class="noimg">🥏</span>`}
      <span class="info"><b>${esc(d.navn)}${d.ark ? " (arkivert)" : ""}</b>
      <small>${esc(d.type)}${flight}</small></span>
      <span class="mini num">${mini}</span>
    </button>`;
  };

  v.innerHTML = `
    <div class="eyebrow">Discloggen</div>
    <h1>Discer</h1>
    <button class="primary mt12 playbtn" data-act="add-disc">+ Legg til disc</button>
    ${act.length > 1 ? sortSegHTML() : ""}
    ${act.length ? act.map(row).join("") : `<div class="card mt12 center"><p class="sub">Ingen discer ennå. Legg til den første — ta gjerne bilde av den, så kjenner du den igjen i treningsmodus.</p></div>`}
    ${ark.length ? `<hr class="sep"><div class="eyebrow">Arkiverte</div>${ark.map(row).join("")}` : ""}
    <div style="height:12px"></div>`;
}

/* ---------- skjema ---------- */

let draft = null; // {id?, navn, type, sp, gl, tu, fa, ci, img, ark}

function nextColor() {
  const used = S.discs.filter(d => !d.ark).map(d => d.ci);
  for (let i = 0; i < NCOLORS; i++) if (!used.includes(i)) return i;
  return S.discs.length % NCOLORS;
}

function openDiscModal(id) {
  const d = id ? discById(id) : null;
  draft = d ? { ...d } : { navn: "", type: "Midrange", sp: "", gl: "", tu: "", fa: "", ci: nextColor(), img: null, ark: false };
  $("#dm-title").textContent = d ? "Rediger disc" : "Ny disc";
  $("#dm-name").value = draft.navn;
  for (const k of ["sp", "gl", "tu", "fa"]) $("#dm-" + k).value = draft[k] ?? "";
  $("#dm-delrow").style.display = d ? "" : "none";
  paintDiscModal();
  openModal("m-disc");
}

function paintDiscModal() {
  $("#dm-photo").innerHTML = draft.img
    ? `<img src="${draft.img}" alt="">`
    : `<span class="ph">📷 Ta bilde</span>`;
  $("#dm-type").innerHTML = TYPES.map(t =>
    `<button data-act="dm-type" data-arg="${t}" class="${draft.type === t ? "on" : ""}">${t}</button>`).join("");
  $("#dm-colors").innerHTML = Array.from({ length: NCOLORS }, (_, i) =>
    `<button data-act="dm-color" data-arg="${i}" class="${draft.ci === i ? "on" : ""}" style="background:var(--c${i})"></button>`).join("");
}

function saveDisc() {
  draft.navn = $("#dm-name").value.trim();
  if (!draft.navn) { toast("Gi discen et navn"); return; }
  for (const k of ["sp", "gl", "tu", "fa"]) {
    const v = $("#dm-" + k).value.trim();
    draft[k] = v === "" ? null : Number(v.replace(",", "."));
  }
  if (draft.id) {
    Object.assign(discById(draft.id), draft);
  } else {
    draft.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    draft.ts = Date.now();
    S.discs.push(draft);
  }
  saveDiscs();
  closeModal("m-disc");
  toast("Disc lagret 🥏");
  rerender();
}

function deleteDisc() {
  const hasThrows = allThrows().some(t => t.discId === draft.id);
  if (hasThrows) {
    // discen finnes i historikken — arkiver så statistikken beholdes
    discById(draft.id).ark = true;
    toast("Disc arkivert (statistikken beholdes)");
  } else {
    S.discs = S.discs.filter(d => d.id !== draft.id);
    toast("Disc slettet");
  }
  saveDiscs();
  closeModal("m-disc");
  rerender();
}

/* ---------- kamera + sirkulær beskjæring ----------
   <input capture="environment"> åpner kameraet direkte på mobil.
   Rådata beskjæres til et kvadratisk 256×256 JPEG-raster (dra for å flytte,
   skyv for å zoome); #cropwrap er sirkulær via CSS så brukeren ser/beskjærer
   sirkulært — samme sirkulære visning brukes overalt bildet vises siden. */

const SIZE = 256;
let crop = null; // {img, zoom, cx, cy}  cx/cy = midtpunkt i bildekoordinater

$("#f-photo").addEventListener("change", e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    crop = { img, zoom: 1, cx: img.width / 2, cy: img.height / 2 };
    $("#cropzoom").value = 1;
    drawCrop();
    openModal("m-crop");
  };
  img.src = URL.createObjectURL(file);
});

function visibleSide() { // synlig kvadrat-side i bildekoordinater
  return Math.min(crop.img.width, crop.img.height) / crop.zoom;
}

function clampCrop() {
  const s = visibleSide() / 2;
  crop.cx = Math.min(Math.max(crop.cx, s), crop.img.width - s);
  crop.cy = Math.min(Math.max(crop.cy, s), crop.img.height - s);
}

function drawCrop() {
  clampCrop();
  const cv = $("#cropcv"), ctx = cv.getContext("2d");
  const s = visibleSide();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(crop.img, crop.cx - s / 2, crop.cy - s / 2, s, s, 0, 0, SIZE, SIZE);
}

let drag = null;
$("#cropcv").addEventListener("pointerdown", e => {
  e.preventDefault();
  drag = { x: e.clientX, y: e.clientY };
  e.target.setPointerCapture(e.pointerId);
});
$("#cropcv").addEventListener("pointermove", e => {
  if (!drag || !crop) return;
  const scale = visibleSide() / $("#cropcv").getBoundingClientRect().width;
  crop.cx -= (e.clientX - drag.x) * scale;
  crop.cy -= (e.clientY - drag.y) * scale;
  drag = { x: e.clientX, y: e.clientY };
  drawCrop();
});
$("#cropcv").addEventListener("pointerup", () => { drag = null; });
$("#cropzoom").addEventListener("input", e => {
  if (!crop) return;
  crop.zoom = Number(e.target.value);
  drawCrop();
});

/* ---------- handlinger ---------- */

Object.assign(ACTIONS, {
  "add-disc":  () => openDiscModal(null),
  "edit-disc": id => openDiscModal(id),
  "dlsort":    arg => { discsSort = arg; renderDiscs(); },
  "dm-type":   t => { draft.type = t; paintDiscModal(); },
  "dm-color":  i => { draft.ci = Number(i); paintDiscModal(); },
  "dm-save":   saveDisc,
  "dm-cancel": () => closeModal("m-disc"),
  "dm-del":    deleteDisc,
  "crop-ok":   () => {
    draft.img = $("#cropcv").toDataURL("image/jpeg", 0.82);
    closeModal("m-crop");
    paintDiscModal();
  },
  "crop-cancel": () => closeModal("m-crop"),
});
