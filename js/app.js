// Oppstart, fanenavigasjon og Mer-fanen (tema, lyd, testmodus, backup).

import { $, $$, ACTIONS, setRender, toast } from "./util.js";
import { S, saveSet, exportJSON, importJSON, wipeAll, allThrows } from "./state.js";
import { renderTrain, resumeSession } from "./session.js";
import { renderDiscs, seedDefaultDiscs } from "./discs.js";
import { renderStats } from "./stats.js";

// VIKTIG: bump VERSION og BUILD ved HVER deploy, sammen med CACHE i sw.js —
// dette er den enkleste måten å bekrefte på telefonen at man faktisk kjører
// nyeste versjon etter en oppdatering (se Mer-fanen).
const VERSION = "1.7";
const BUILD = "10. juli 2026, 15:45";
let tab = "train";

/* ---------- faner ---------- */

function switchTab(t) {
  tab = t;
  $$("section.view").forEach(s => s.classList.toggle("active", s.id === "v-" + t));
  $$("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.arg === t));
  renderAll();
}

function renderAll() {
  if (tab === "train") renderTrain();
  else if (tab === "discs") renderDiscs();
  else if (tab === "stats") renderStats();
  else renderMore();
}

/* ---------- Mer ---------- */

function renderMore() {
  const seg = (act, val, opts) => `<div class="seg">` + opts.map(([arg, label]) =>
    `<button class="${String(val) === arg ? "on" : ""}" data-act="${act}" data-arg="${arg}">${label}</button>`).join("") + `</div>`;

  $("#v-more").innerHTML = `
    <div class="eyebrow">Discloggen</div>
    <h1>Mer</h1>
    <div class="card mt12">
      <div class="eyebrow" style="margin-bottom:8px">Tema</div>
      ${seg("theme", S.set.theme, [["auto", "Auto"], ["light", "Lys"], ["dark", "Mørk"]])}
      <div class="eyebrow" style="margin:14px 0 8px">Lyd (applaus ved rekord)</div>
      ${seg("lyd", S.set.lyd, [["true", "På"], ["false", "Av"]])}
      <div class="eyebrow" style="margin:14px 0 8px">Testmodus (simulert GPS)</div>
      ${seg("demo", S.set.demo, [["false", "Av"], ["true", "På"]])}
      <p class="sub mt8">Testmodus lar deg prøve appen innendørs — posisjoner blir simulert i stedet for målt.</p>
    </div>
    <div class="card mt12">
      <div class="eyebrow" style="margin-bottom:8px">Backup</div>
      <p class="sub">All data ligger kun på denne enheten. Ta jevnlig backup — det er forsikringen din ved telefonbytte.</p>
      <div class="btnrow">
        <button class="ghost playbtn" data-act="export">⬇️ Eksporter</button>
        <label class="ghost playbtn" for="f-import" style="display:flex;align-items:center;justify-content:center">⬆️ Importer</label>
      </div>
      <hr class="sep">
      <button class="danger playbtn" data-act="wipe" data-arm style="width:100%">Slett all data</button>
    </div>
    <div class="card mt12 center">
      <p class="sub"><b style="color:var(--ink)">Discloggen v${VERSION}</b><br>
      Bygget ${BUILD}<br>
      ${allThrows().length} kast logget<br>
      Installer: Chrome ⋮ → «Installer app» / Safari Del → «Legg til på Hjem-skjerm»</p>
    </div>
    <div style="height:12px"></div>`;
}

/* ---------- tema ---------- */

function applyTheme() {
  const t = S.set.theme;
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/* ---------- backup ---------- */

function doExport() {
  const blob = new Blob([exportJSON()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `discloggen-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("Backup lastet ned");
}

$("#f-import").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    importJSON(await file.text());
    toast("Backup importert — laster på nytt");
    setTimeout(() => location.reload(), 800);
  } catch {
    toast("Kunne ikke lese backup-filen");
  }
});

/* ---------- handlinger ---------- */

Object.assign(ACTIONS, {
  "tab": switchTab,
  "theme": arg => { S.set.theme = arg; saveSet(); applyTheme(); renderMore(); },
  "lyd":   arg => { S.set.lyd = arg === "true"; saveSet(); renderMore(); },
  "demo":  arg => { S.set.demo = arg === "true"; saveSet(); renderAll(); toast(S.set.demo ? "Testmodus på 🧪" : "Testmodus av"); },
  "export": doExport,
  "wipe": () => { wipeAll(); location.reload(); },
});

/* ---------- oppstart ---------- */

setRender(renderAll);
seedDefaultDiscs();
applyTheme();
renderAll();
resumeSession();
