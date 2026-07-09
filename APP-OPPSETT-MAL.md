# Mobilapp-oppsett (mal fra Dartloggen)

> **Til Claude:** Dette dokumentet beskriver oppsettet og designsystemet fra en tidligere app
> (Dartloggen, en dart-treningslogg) som brukeren er godt fornøyd med. Bygg den nye appen
> med samme arkitektur, designsystem og UX-regler. Legg denne filen i prosjektroten
> (gjerne som `CLAUDE.md`) og følg den gjennom hele prosjektet.

## Neste prosjekt: Disc golf tracker

Treningsapp for disc golf som bruker **GPS/lokasjon til å logge kast**. Se egen seksjon nederst.

---

## 1. Arkitektur

- **Én selvstendig HTML-fil** (`index.html`): all CSS, HTML og JS inline. Ingen rammeverk,
  ingen byggesteg, ingen eksterne CDN-er eller fonter. Vanilla JS.
- **PWA på GitHub Pages**: appen installeres fra Chrome (Android) / Safari (iPhone) som
  ekte app med eget ikon, fullskjerm og offline-støtte.
- **All data i localStorage** på enheten. Ingen server, ingen konto. Hver enhet har sin
  egen statistikk.
- Utvikles i VS Code, pushes rett til GitHub, deployes automatisk via GitHub Pages
  (Settings → Pages → Deploy from branch → main / root).

### Filstruktur i repoet

```
index.html            ← hele appen
manifest.webmanifest  ← navn, ikoner, standalone, theme-color
sw.js                 ← service worker, cache-first offline
icon-512.png          ← app-ikon (også 192 og 180 for iOS)
icon-192.png
icon-180.png
```

### `sw.js`-mal (VIKTIG: bump `CACHE`-versjonen ved HVER deploy, ellers ser brukeren gammel versjon)

```js
const CACHE = "appnavn-v1"; // ← v2, v3 … ved hver endring
const FILES = ["./", "./index.html", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png", "./icon-180.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(hit => hit ||
    fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; })
    .catch(() => caches.match("./index.html"))));
});
```

### `index.html`-hode (PWA-registrering)

```html
<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#131110">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
</head>
<!-- … app … og nederst: -->
<script>
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
</script>
</html>
```

---

## 2. Designsystem (brukeren liker dette — behold stilen)

Mobilførst, maks 480 px bred sentrert kolonne, faste faner nederst i tommelsonen
(`padding-bottom` med `env(safe-area-inset-bottom)`), systemfont, `tabular-nums` på alle tall.

### Fargetokens —定 ALT via CSS-variabler, aldri hardkodede farger i komponenter

Lyst og mørkt tema med token-pattern: definer på `:root`, overstyr i
`@media (prefers-color-scheme: dark)`, og gjenta begge under `:root[data-theme="light"]` /
`:root[data-theme="dark"]` slik at en manuell toggle vinner over OS-innstillingen.

```css
:root{ /* lys (varm, kremhvit grunntone) */
  --bg:#F2EDE2; --surface:#FFFDF7; --surface2:#EAE3D4;
  --ink:#2A241B; --ink2:#6F6555; --line:#DCD3C0;
  --green:#1E7A44; --green-ink:#FFFFFF; --green-soft:#E0EDE2; --green-mid:#C4E0CB;
  --red:#B3312E; --red-soft:#F6E5E2;
  --gold:#A5802F; --gold-soft:#F1E8D2;
  --shadow:0 1px 3px rgba(42,36,27,.12);
}
/* mørk (varm nesten-svart): */
/* --bg:#131110; --surface:#1D1A17; --surface2:#26221D;
   --ink:#EFE7D7; --ink2:#A79C8A; --line:#332E27;
   --green:#4BA96B; --green-ink:#0E1F14; --green-soft:#1E2B21; --green-mid:#2C4A36;
   --red:#D8574F; --red-soft:#2E1D1A; --gold:#C9A45C; --gold-soft:#2C2618; --shadow:none; */
```

Semantikk: **grønn = positiv handling/treff**, **rød = bom/fare** (myke `-soft`-varianter som
bakgrunn med farget tekst), **gull = rekorder/høydepunkter**. For disc golf kan grønnfargen
gjerne vris mot gress/skog, men behold token-navnene og strukturen.

### Gjenbrukbare komponentklasser

- `.card` — flate kort: surface-bakgrunn, 1px `--line`-ramme, 14px radius, myk skygge
- `.stat` / `.statrow` — små KPI-bokser øverst (stor verdi + 9px UPPERCASE-etikett)
- `.eyebrow` — 11px, bold, `letter-spacing:.16em`, uppercase, `--ink2`
- `.primary` — stor grønn hovedknapp (min. 84 px høy for hovedhandlinger i spillflyt)
- `.ghost` — sekundærknapp med ramme; `.danger` — rød outline for sletting
- `.seg` — segmentkontroll (rad av knapper, aktiv = grønn fylt)
- `.hist li` — historikkliste: dato i `--ink2` til venstre, verdier med `font-weight:800` til høyre
- `.modal` — enkel overlay-dialog (aldri `alert()`/`confirm()` — kan blokkeres i PWA)
- Stort «måltall» i `.target-card`: `font-size:clamp(104px,34vw,160px)` — synlig på avstand
- Fanenavigasjon: `nav.tabs` fast nederst, aktiv fane = grønn tekst på `--green-soft`

---

## 3. UX-regler (KRITISKE — lærdom fra forrige app)

1. **Alle spill-/loggeknapper reagerer på `pointerdown`, ikke `click`.** Et click kan
   forkastes av nettleseren hvis fingeren sklir 2 mm (tolkes som scroll) — da mister
   brukeren registreringer. Standard-helper:

   ```js
   function onTap(el, fn){
     el.addEventListener("pointerdown", e => {
       if (el.disabled) return;
       e.preventDefault(); // hindrer dobbel-firing via click
       fn();
     });
   }
   ```

2. **`touch-action:none` på alle spilleknapper** (CSS) så et trykk aldri kan starte scroll.
   `touch-action:manipulation` + `user-select:none` på alle knapper generelt.
   `html{overscroll-behavior:none}`.
3. **Hoved-/loggesiden skal aldri kunne scrolle** — alt synlig på én skjerm. Statistikk-sider
   kan scrolle fritt.
4. **Synlig og følbar trykk-bekreftelse på ALT**: global `pointerdown`-lytter som gir
   blink-animasjon (gullring + scale) og `navigator.vibrate(18)`. Brukeren skal alltid vite
   at trykket ble registrert.
5. **Aldri `confirm()`/`alert()`** — bruk to-trykks bekreftelse:

   ```js
   function armConfirm(btn, action){ // 1. trykk: «Sikker? Trykk igjen» (3 s), 2. trykk: utfør
     const orig = btn.textContent;
     onTap(btn, () => {
       if (btn.dataset.armed){ delete btn.dataset.armed; btn.textContent = orig; action(); }
       else { btn.dataset.armed = "1"; btn.textContent = "Sikker? Trykk igjen";
              setTimeout(() => { if (btn.dataset.armed){ delete btn.dataset.armed; btn.textContent = orig; } }, 3000); }
     });
   }
   ```

6. **Angre-knapp på alt som logger data** — snapshot-basert undo-stack (dyp kopi av
   tilstanden per handling, maks ~200 innslag).
7. **Belønning gjør loggingen gøy**: humørfjes-overlay etter hver logging (😠→🤩 etter
   prestasjon), konfetti (110 fallende CSS-divs) + syntetisert applaus via WebAudio
   (bandpass-filtrert støy — ingen lydfiler) ved toppresultater. Lyd av/på-bryter i
   innstillinger. Respekter `prefers-reduced-motion`.
8. Norsk språk i hele UI-et.

---

## 4. Dataregler

- **Alle localStorage-nøkler har app-prefiks** (Dartloggen brukte `dart_`; bruk f.eks.
  `disc_` nå). Muliggjør felles eksport/import/sletting med én løkke over prefikset.
- **Nøkkelnavn og datastruktur er hellige etter første deploy** — aldri rename uten
  migreringskode. Brukerens historikk finnes bare der.
- Pågående økt lagres fortløpende i egen `*_current`-nøkkel så en reload/app-bytte aldri
  mister noe. Slettes ved fullført økt.
- **Eksporter/importer backup** (JSON-fil med alle prefiks-nøkler, lastes ned med dato i
  filnavnet) skal med fra første versjon — det er brukerens eneste forsikring ved
  telefonbytte.
- «Slett all statistikk» med `armConfirm`, fjerner alle prefiks-nøkler.

---

## 5. Deploy-arbeidsflyt (VS Code → GitHub Pages)

1. `git init` → commit → push til GitHub-repo (public).
2. Repo → Settings → Pages → «Deploy from a branch» → `main` + `/ (root)` → Save.
3. Appen ligger på `https://<brukernavn>.github.io/<repo>/` etter 1–2 min.
4. Installasjon: Chrome (Android) ⋮ → «Installer app» / «Legg til på startsiden»;
   Safari (iPhone) → Del → «Legg til på Hjem-skjerm».
5. **Ved hver oppdatering:** bump `CACHE` i `sw.js` (v2→v3→…) → commit → push.
   Brukeren får ny versjon neste gang appen åpnes (evt. etter én ekstra lukk/åpne).

---

## 6. Spesielt for disc golf-trackeren (GPS)

- **Geolocation krever HTTPS** — GitHub Pages er HTTPS, så det fungerer rett ut av boksen.
  Fungerer IKKE fra `file://`, så testing av GPS må skje via Pages-URL-en (eller localhost).
- Bruk `navigator.geolocation.watchPosition(cb, err, {enableHighAccuracy:true, maximumAge:1000, timeout:10000})`
  under aktiv runde; `getCurrentPosition` for enkeltpunkter (merk kastested / merk landingssted).
- **Kastlengde = haversine-avstand** mellom to GPS-punkter:

  ```js
  function distM(a, b){ // {lat,lon} → meter
    const R = 6371000, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
    const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  ```

- **Vis GPS-nøyaktighet** (`coords.accuracy`, meter) i UI og advar/vent når den er dårlig
  (> ~10 m) før et punkt logges — ellers blir kastlengdene søppel. La brukeren logge punktet
  manuelt på nytt («mål igjen»).
- Typisk flyt per kast: stå ved disken → «Merk kastested» → kast → gå til disken →
  «Merk landing» → lengde beregnes og logges. Samme pointerdown-/store-knapper-regler som over.
- Foreslått datamodell (juster ved behov): runde `{ts, bane?, hull:[{nr, par?, kast:[{lat, lon, lengdeM, disc?, type?}]}]}`
  + statistikk per disc/kasttype: snittlengde, lengste kast (rekord med gull/konfetti),
  utvikling over tid — gjenbruk graf- og statistikkmønstrene fra seksjon 2.
- **Wake Lock** (`navigator.wakeLock.request("screen")`) under aktiv runde så skjermen ikke
  låser seg mellom kast; re-request ved `visibilitychange`.
- GPS fungerer offline (uavhengig av nett) — appen kan logge en hel runde i skogen uten
  dekning. Ikke avhengig av kartfliser i v1; lengder og statistikk trenger ikke kart.
- Be om lokasjonstillatelse først når brukeren starter en runde (ikke ved app-start), med
  en kort forklaring i UI-et før prompten.
