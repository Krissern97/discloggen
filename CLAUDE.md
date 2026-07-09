# Discloggen — disc golf treningslogg (PWA)

Treningsapp for disc golf: logg kast med GPS og se statistikk på lengde og retning,
per disc og globalt. Basert på oppsettet fra Dartloggen (se `APP-OPPSETT-MAL.md`),
men delt i moduler i stedet for én fil.

## Arkitektur

- **Vanilla JS, ingen byggesteg, ingen eksterne avhengigheter.** ES-moduler rett i
  nettleseren. Deploy = push til GitHub Pages.
- **PWA**: installeres fra Chrome (Android) / Safari (iPhone). Offline via service
  worker (cache-first).
- **All data i localStorage** med `disc_`-prefiks. Ingen server, ingen konto.

```
index.html      markup + alle modaler
css/app.css     designsystem: tokens (lys/mørk), komponenter, disc-palett --c0..--c7
js/app.js       oppstart, faner, Mer-fanen (tema/lyd/testmodus/backup)
js/util.js      $, ACTIONS + pointerdown-delegering, armConfirm, toast, modal,
                konfetti, applaus, rerender-kobling
js/state.js     lasting/lagring, S (app-state), undo-stack, eksport/import
js/geo.js       haversine, peiling, decompose (side/frem), målemodal, simulert GPS
js/session.js   treningsflyt: økt → runder → kast (pend) → landinger (throws)
js/discs.js     disc-CRUD + kamerabilde med kvadratisk beskjæring (256×256 JPEG)
js/stats.js     KPI-er, spredningskart (SVG), per-disc, økthistorikk
sw.js           service worker — BUMP `CACHE`-versjonen ved HVER deploy
```

## Datamodell (HELLIG etter første deploy — aldri rename uten migrering)

- `disc_discs`: `[{id, navn, type, sp, gl, tu, fa, ci, img, ark, ts}]`
  — `ci` = fast fargeindeks 0–7, `img` = dataURL 256×256, `ark` = arkivert
- `disc_sessions`: `[{id, ts, end, rounds:[{start, aim, pend, throws}]}]`
  — `start`/`aim`: `{la, lo, acc}` | null. `pend`: kastet men ikke hentet
  (`{id, discId, kt, ts}`). `throws`: `{id, discId, kt, dist, side, frem, acc, ts, pos}`.
  `kt` = "BH"/"FH". `side` = meter fra siktelinja (+høyre/−venstre), null uten siktepunkt.
- `disc_current`: pågående økt, lagres fortløpende (overlever reload)
- `disc_settings`: `{theme, lyd, kt, demo}`

## Kjerneflyt (treningsmodus)

To økttyper (`sm`): **Lengdeøkt ("L")** og **Presisjonsøkt ("P")**.

1. «Start økt» → GPS-måling av kastested → siktepunkt (L, valgfritt) / mål (P, påkrevd
   før landing — f.eks. midt på banen).
2. Modus **Kaster**: velg BH/FH, trykk discen for hvert kast → havner i `pend`
3. Modus **Henter**: stå ved discen, trykk den → GPS-måling → `decompose()` gir
   lengde + sideavvik → flyttes til `throws`. Glemt kast tilgis (opprettes implisitt).
   I P lagres også `td` (avstand kastested→mål); bom = `missOf(t)` = avstand fra målet.
4. «Ny runde» ved kast tilbake — forrige kastested tilbys som nytt siktepunkt (L),
   målet beholdes (P).
5. Rekord (>3 tidligere kast med discen, samme øktmodus) → konfetti + applaus.
   L: lengste kast. P: minste bom.

Statistikken holder L og P helt adskilt (snittlengde blandes aldri med presisjonskast),
og alt kan filtreres på BH/FH. P har eget målskive-kart med avstandsringer.

## UX-regler (kritiske — fra Dartloggen)

- Alle spilleknapper reagerer på **pointerdown**, aldri click (`data-act`-delegering
  i util.js). `touch-action:none` på spilleknapper (`.playbtn`, `.seg button`).
- Aldri `alert()`/`confirm()` — `data-arm` gir to-trykks bekreftelse.
- Treningsskjermen scroller aldri (disc-grid scroller internt).
- Trykk-feedback: gullring + `vibrate(18)` på alle `data-act`-trykk.
- Undo (snapshot-stack) på alt som logger data i økten.
- Norsk språk i hele UI-et. Respekter `prefers-reduced-motion`.

## GPS

- Krever HTTPS (Pages) eller localhost — IKKE `file://`. Testmodus i Mer-fanen
  simulerer GPS for testing innendørs/på PC.
- Målemodalen samler fikser via `watchPosition` og bruker vektet snitt av de beste;
  brukeren godkjenner med «Bruk punkt». Advarsel når nøyaktighet > 12 m.
- Wake Lock holder skjermen våken under økt (re-request ved `visibilitychange`).

## Farger

Alt via CSS-tokens (`--bg`, `--ink`, `--green` …) — aldri hardkodede farger i
komponenter. Disc-palett `--c0`–`--c7` er CVD-validert i både lys og mørk modus;
fast rekkefølge, tildeles nye discer som første ledige indeks.

## Deploy

1. Endre kode → **bump `CACHE` i `sw.js`** (discloggen-v2, v3 …) → commit → push.
2. GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.
3. App-URL: `https://krissern97.github.io/<repo>/`
