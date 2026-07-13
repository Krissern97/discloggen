# Discloggen — disc golf treningslogg (PWA)

Treningsapp for disc golf: logg kast med GPS og se statistikk på lengde og retning,
per disc og globalt. Basert på oppsettet fra Dartloggen (se `APP-OPPSETT-MAL.md`),
men delt i moduler i stedet for én fil.

## Arkitektur

- **Vanilla JS, ingen byggesteg.** ES-moduler rett i nettleseren. Deploy = push
  til GitHub Pages.
- **Eneste eksterne avhengighet: Leaflet** (`vendor/leaflet/`, vendoret lokalt —
  ikke lastet fra CDN ved kjøretid) for kartvalg av siktepunkt, se «Kartvalg».
  Alt annet er fortsatt egenskrevet, ingen andre biblioteker/rammeverk.
- **PWA**: installeres fra Chrome (Android) / Safari (iPhone). Offline via service
  worker (cache-first) — MED ETT unntak, se «Kartvalg».
- **All data i localStorage** med `disc_`-prefiks. Ingen server, ingen konto.

```
index.html      markup + alle modaler
css/app.css     designsystem: tokens (lys/mørk), komponenter, disc-palett --c0..--c7
js/app.js       oppstart, faner, Mer-fanen (tema/lyd/testmodus/backup)
js/util.js      $, ACTIONS + click-delegering (slipp-basert, se «UX-regler»), armConfirm,
                toast, flash (ikke-blokkerende hurtigresultat), modal, konfetti, applaus,
                rerender-kobling
js/state.js     lasting/lagring, S (app-state), undo-stack, eksport/import
js/geo.js       haversine, peiling, decompose (side/frem), målemodal, simulert GPS
js/session.js   treningsflyt: økt → runder → kast (pend) → instant landing (throws),
                kontinuerlig GPS-fiks, samme-sted/nytt-sted ny runde
js/discs.js     disc-CRUD + kamerabilde med sirkulær visningsflate (kvadratisk
                256×256-raster under, se «Bilder»), sår startdiscer ved fersk install,
                sorterbar liste (type/speed/lengste/presisjon)
js/stats.js     KPI-er, spredningskart/målskive (SVG, markørene bruker discens
                bilde som ikon når det finnes), sorterbar per-disc-oversikt,
                disc-detalj med trendgrafer, økthistorikk, rundefaner
js/mapaim.js    kartvalg av siktepunkt (Leaflet + Esri-satellittfliser), se «Kartvalg»
vendor/leaflet/ Leaflet 1.9.4, vendoret lokalt (ikke CDN)
sw.js           service worker — BUMP `CACHE`-versjonen ved HVER deploy
```

## Datamodell (HELLIG etter første deploy — aldri rename uten migrering)

- `disc_discs`: `[{id, navn, type, sp, gl, tu, fa, ci, img, ark, ts}]`
  — `ci` = fast fargeindeks 0–7, `img` = dataURL 256×256, `ark` = arkivert
- `disc_sessions`: `[{id, ts, end, sm, rounds:[{ts, start, aim, pend, throws}]}]`
  — en **runde** = ett kast+hent-slag fra ett kastested (`ts` = når runden startet).
  `start`/`aim`: `{la, lo, acc}` | null (`acc` er `null` for `aim` satt via
  kartvalg — se «Kartvalg», ellers alltid et GPS-nøyaktighetstall). `pend`: kastet men ikke hentet
  (`{id, discId, kt, ts}`). `throws`: `{id, discId, kt, dist, side, frem, acc, ts, pos}`.
  `kt` = "BH"/"FH". `side` = meter fra siktelinja (+høyre/−venstre), null uten siktepunkt.
- `disc_current`: pågående økt, lagres fortløpende (overlever reload)
- `disc_settings`: `{theme, lyd, kt, demo, seeded}` — `seeded`: startdiscer er forsøkt sådd
  (kun ved fersk install, se «Onboarding»)

## Kjerneflyt (treningsmodus)

To økttyper (`sm`): **Lengdeøkt ("L")** og **Presisjonsøkt ("P")**. En økt inneholder
én eller flere **runder** (`S.cur.rounds`); en runde er ett kast+hent-slag fra ett
kastested — f.eks. kast 20 discer, gå og hent dem, det er én runde.

1. «Start økt» → GPS-måling av kastested (deliberat, `measurePoint`) → siktepunkt
   (L, valgfritt) / mål (P, påkrevd før landing — f.eks. midt på banen). Kastested
   markeres alltid FØR mål/siktepunkt (bevisst rekkefølge — kastestedet er
   fundamentet all annen geometri i runden beregnes fra: avstand til mål, sikte-
   strek, sideavvik osv., så det gir mest mening å sette det først, deretter gå/
   peke mot der man skal sikte).
   I P vises **avstand til mål** som egen KPI-stat øverst i live-visningen så
   snart mål er satt (`Math.round(distM(r.start, r.aim))` i `liveHTML()`).
   Målskive-kartet (`targetCard()` i stats.js) har i tillegg en stiplet
   senterlinje + en liten trekant nederst («kastested») — samme rene visuelle
   referanse-mønster som spredningskartet for lengdekast bruker, IKKE en
   skala-riktig avstand eller et tall på selve streken (målet sitter alltid i
   sentrum av dette kartet, mens kastestedet reelt er 30–100+ m unna og ville
   uansett havnet langt utenfor et kart zoomet inn på selve treffspredningen).
2. Modus **Kaster**: velg BH/FH, trykk discen for hvert kast → havner i `pend`
   (rent synkront, ingen GPS involvert — bruker rundens `start`-punkt senere).
3. Modus **Henter**: GPS kjører kontinuerlig i bakgrunnen gjennom hele økten
   (`startGpsWatch`/`gpsFix` i session.js). Trykk discen der den ligger → siste kjente
   posisjon brukes **øyeblikkelig** (ingen ventemodal) → `decompose()` gir lengde +
   sideavvik → flyttes til `throws`. Resultatet vises som en ikke-blokkerende
   `flash()`-boks (~1 sek, autoforsvinner, `pointer-events:none` — stjeler ALDRI
   fokus eller krever et trykk for å lukkes) — se `util.js`.
   Glemt kast tilgis (opprettes implisitt). I P lagres også `td` (avstand
   kastested→mål); bom = `missOf(t)` = avstand fra målet.
4. «Ny runde»: velg **«Samme sted»** (gjenbruker forrige rundes kastested/mål
   direkte, ingen GPS-venting — for repeterte bøtter fra samme spot, typisk
   presisjon/putting) eller **«Nytt sted»** (måler nytt kastested via `measurePoint`,
   deretter samme siktepunkt/mål-valg som ved øktstart).
5. Rekord (>3 tidligere kast med discen, samme øktmodus) → konfetti + applaus.
   L: lengste kast. P: minste bom.

Kast-registrering (steg 2) og landing (steg 3) er alltid instant/synkron — kun
kastested/siktepunkt/mål-markering (foundational for hele runden, sjelden handling)
bruker den deliberate `measurePoint`-modalen som venter på god nøyaktighet.

Statistikken holder L og P helt adskilt (snittlengde blandes aldri med presisjonskast),
og alt kan filtreres på BH/FH. P har eget målskive-kart med avstandsringer.
I Statistikk-fanen viser øktdetaljen **rundefaner** («Alle» + «Runde 1», «Runde 2» …,
kun synlig ved 2+ runder) — trykk for å bla mellom aggregert og enkelt-runde-visning
uten å forlate skjermen (`stats.js`: `openSession` → `paintSession`, styrt av modul-
variabelen `sessionRoundSel`, handling `"round-sel"`).

**Discer-fanen** har sin egen, enklere sortering (`discs.js`: `discsSort`, handling
`"dlsort"`) — Type (fast rekkefølge Putter→Driver) / Speed (flight-tall) / Lengste
(personlig rekord) / Presisjon (snitt bom). Ministatistikken i hver rad viser den
metrikken man faktisk sorterer etter, så rekkefølgen er selvforklarende. Egen greie
fra Statistikk-fanens `perDiscUnifiedHTML`/`discSort` under — to forskjellige lister
med to forskjellige formål (bla i biblioteket vs. sammenligne prestasjon).

**Per disc-oversikt** (`perDiscUnifiedHTML`) er sorterbar — Lengde / Presisjon / Totalt
(`discSort`, handling `"dsort"`). «Totalt» er en komposittscore: snittlengde og
snittbom normaliseres hver for seg til 0..1 med min-max **relativt til brukerens
egne discer** (ikke en absolutt fasit), så en kort presisjons-putter og en lang
driver kan rangeres side om side uten å blande meter-lengde/meter-bom urettferdig.
Har discen bare én type data, brukes den scoren alene. Trykk en disc-rad →
**disc-detalj** (`openDiscDetail`): KPI-er, trendgraf for lengde og presisjon hver
for seg (`trendCard`, snitt **per økt** kronologisk via `sessId`/`sessTs` fra
`allThrows()` — se `sessionTrend()`), pluss et spredningskart/målskive filtrert til
kun den ene discen (gjenbruker `scatterCard`/`targetCard`).

## UX-regler

- **Alle knapper reagerer på standard `click` (slipp-basert), IKKE `pointerdown`.**
  (`data-act`-delegering i util.js.) Dette er bevisst annerledes enn Dartloggen-
  malen (`APP-OPPSETT-MAL.md`), som brukte pointerdown for maksimal respons i et
  ikke-skrollende dart-spill. I Discloggen ligger tap-mål ofte i skrollbare lister
  (øktoversikt, disc-bibliotek, per-disc-liste) — pointerdown fyrer FØR nettleseren
  vet om brukeren egentlig ville scrolle, som ga falske registreringer midt i en
  scroll-bevegelse. `click` avbrytes automatisk av nettleseren ved bevegelse
  (native scroll-vs-tap-disambiguering), akkurat det vi vil ha.
- `touch-action:manipulation` (IKKE `none`) på alle knapper/spilleknapper
  (`.playbtn`, `.seg button`, `.roundtabs button`, `.discbtn`, `.colorrow button`)
  — dobbelttrykk-zoom er avskrudd (ingen 300ms-forsinkelse), men scroll fungerer
  normalt gjennom dem. Eneste unntak: `#cropwrap` (bilde-beskjæring) beholder
  `touch-action:none` — det er en dra-for-å-panorere-flate, ikke en knapp, og skal
  aldri tolkes som sidescroll.
- Aldri `alert()`/`confirm()` — `data-arm` gir to-trykks bekreftelse.
- Treningsskjermen scroller aldri på øverste nivå (disc-grid scroller internt,
  nå fritt siden touch-action ikke lenger blokkerer det).
- Trykk-feedback: gullring + `vibrate(18)` på alle `data-act`-trykk.
- Kart-tooltip (trykk et punkt for lengde/dato) bruker samme `click`-mønster
  (egen delegert lytter i stats.js, uavhengig av `data-act`-systemet).
- Undo (snapshot-stack) på alt som logger data i økten.
- Norsk språk i hele UI-et. Respekter `prefers-reduced-motion`.

## GPS

- Krever HTTPS (Pages) eller localhost — IKKE `file://`. Testmodus i Mer-fanen
  simulerer GPS for testing innendørs/på PC (`demoPoint()` i geo.js, kalt synkront
  for hvert instant-trykk slik at testmodus også føles momentant).
- To ulike GPS-mønstre, bevisst valgt ulikt:
  - **Anker-punkter** (kastested/siktepunkt/mål): `measurePoint()` i geo.js —
    åpner modal, samler fikser via `watchPosition`, vektet snitt av de beste,
    brukeren godkjenner med «Bruk punkt». Disse punktene definerer hele rundens
    referanseramme, så presisjon prioriteres over hastighet her.
  - **Kast/landing** (høyfrekvent, opptil ~40 trykk per runde): kontinuerlig
    `watchPosition` fra øktstart (`startGpsWatch()` i session.js) holder `gpsFix`
    oppdatert i bakgrunnen. Et trykk på en disc i hentemodus bruker `gpsFix` direkte,
    uten å vente — hastighet prioriteres over ceremoni her.
- GPS-chippen (`gpsChipHTML()`) oppdateres målrettet via `outerHTML`-bytte på hver
  `watchPosition`-tikk, IKKE full `rerender()` — unngår DOM-churn og bevarer
  `#flash`-elementet (som ligger utenfor `#v-train` nettopp for å overleve rerender).
- Wake Lock holder skjermen våken under økt (re-request ved `visibilitychange`).

## Kartvalg av siktepunkt (lengdeøkt)

- **`js/mapaim.js`** — tredje måte å sette siktepunkt på (i tillegg til fysisk
  GPS-måling / «forrige kastested»/«behold»): et satellittkart der du trykker
  eller drar en markør dit du vil sikte, uten å måtte gå dit selv. Kun for
  **lengdeøkt** — presisjonsøktens mål går fortsatt alltid via fysisk måling
  (`measurePoint`), siden nøyaktighet der bør prioriteres over hastighet.
  `pickAimOnMap(origin)` returnerer `Promise<{la,lo,acc:null}|null>`, samme
  async-mønster som `measurePoint()`, så kalleren i session.js (`aimMap()`)
  ser lik ut som de andre sikte-valgene.
- **Leaflet** (vendoret i `vendor/leaflet/`) + **Esri World Imagery**-fliser
  (gratis, ingen API-nøkkel, hentes fra `server.arcgisonline.com` ved kjøretid).
  Valgt fremfor Google Maps (krever API-nøkkel + betalingskort-bundet
  Cloud-konto — bryter med at appen ikke krever konto) og fremfor å åpne
  telefonens native kartapp (kan ikke bygges inn med trykk-for-å-plassere).
- **Eneste unntak fra full offline-støtte**: selve kartbibliotek-filene er
  cachet av service workeren som alt annet, men de FAKTISKE flisbildene
  (satellittbildene) må hentes fra nett der og da — kan ikke forhåndslagres
  for ukjente steder. Uten nett viser kartmodalen seg, men uten bilder.
- Markørene er `L.divIcon` med emoji (▲ for kastested, fast/ikke-flyttbar;
  🎯 for siktepunktet, drabar + trykk-hvor-som-helst-på-kartet flytter den) —
  ikke Leaflets standard-markørbilder, så ingen ekstra ikon-filer å vendorere.
  `#mapaim-map` må ha eksplisitt størrelse FØR `L.map()` initialiseres (ellers
  blir fliskartet feilberegnet) — derfor venter `pickAimOnMap()` to
  `requestAnimationFrame`-runder etter `openModal()` før kartet bygges.

## Farger

Alt via CSS-tokens (`--bg`, `--ink`, `--green` …) — aldri hardkodede farger i
komponenter. Disc-palett `--c0`–`--c7` er CVD-validert i både lys og mørk modus;
fast rekkefølge, tildeles nye discer som første ledige indeks.

## Bilder

- Disc-bilder lagres alltid som et **kvadratisk** 256×256 JPEG-raster (`d.img`,
  dataURL) — beskjæringsverktøyet (`js/discs.js`) endrer aldri denne rastergeometrien.
  «Sirkulær» er en **visningsegenskap**: `#cropwrap` og alle steder bildet vises
  (`.discbtn img`, `.discrow img`, `.photobox`) er `border-radius:50%`, så brukeren
  ser/beskjærer alltid sirkulært selv om rådata er kvadratisk under.
- I spredningskart/målskive (`stats.js`) brukes samme bilde som **markørikon** på
  kartet via `markerSVG()`: et SVG `<image>` klippet sirkulært med en delt
  `<clipPath id="discclip">` (definert i hver SVG via `clipDefs()`). Har discen
  intet bilde, faller markøren tilbake til en farget prikk (`--c{ci}`) som før.
  Hver markør har i tillegg en usynlig `r=14`-trykkflate (uavhengig av synlig
  ikon-størrelse) for pålitelig trykk-til-lengde på touch — se `markerSVG()`.
- Samme bilde-eller-fallback-prinsipp gjelder **legenden under kartet**
  (`legendHTML()`) og **disc-ikonet i per-disc-lista/disc-detaljen**
  (`discIconHTML()`, CSS-klasse `.discmini`) — bilde med farget ramme (`--dc`),
  eller en emoji-fallback i en farget sirkel uten bilde. Alle tre bruker samme
  `--dc:var(--c{ci})`-mønster som resten av appen.

## Onboarding

Ved helt fersk installasjon (`S.set.seeded` false, ingen discer/økter) sås fire
standard-discer (én per type) via `seedDefaultDiscs()` i discs.js, kalt fra app.js
ved oppstart — appen skal aldri føles tom eller låst før brukeren har gjort noe.
Kjøres kun én gang (flagget settes permanent), så sletter man alle discene senere
kommer de ikke tilbake. «Start økt»-knappene er aldri disabled, uansett antall
discer — en tom rundegrid mens man kaster gir en snarvei til Discer-fanen i stedet
for å blokkere.

## Deploy

1. Endre kode → **bump `CACHE` i `sw.js`** (discloggen-v2, v3 …) **OG `VERSION`/`BUILD`
   i `js/app.js`** (vises nederst på Mer-siden) → commit → push til `main`.
   Disse to MÅ bumpes sammen — `VERSION`/`BUILD` er brukerens eneste enkle måte å
   bekrefte på telefonen at riktig versjon faktisk kjører etter en oppdatering,
   uten det er lett å glemme (skjedde tidligere i dette prosjektet).
2. Deploy skjer automatisk via GitHub Actions (`.github/workflows/pages.yml`) —
   IKKE legacy «Deploy from branch»/Jekyll (den hang seg fast ved første forsøk).
   `.nojekyll` i repo-roten sørger for at statiske filer serveres som de er.
3. App-URL: `https://krissern97.github.io/discloggen/`
4. **Selvoppdaterende siden v1.8**: GitHub Pages serverer `sw.js` med
   `Cache-Control: max-age=600` (ingen mulighet å endre dette — statisk host,
   ingen custom headers) — uten mottiltak kunne nettleseren gå opptil 10 min
   uten å i det hele tatt sjekke om `sw.js` var endret, og brukeren måtte lukke
   appen helt (ofte to ganger) for å få oppdateringen. Løst i `index.html`:
   `register("sw.js", {updateViaCache:"none"})` tvinger sjekken forbi HTTP-
   cachen, `reg.update()` sjekker med en gang appen åpnes, og en
   `controllerchange`-lytter reloader siden automatisk ÉN gang når ny versjon
   tar over — trygt siden pågående økt uansett lagres fortløpende og
   gjenopprettes (`resumeSession()`). **Denne fiksen bootstrapper seg selv
   først etter én ordinær (evt. treg) oppdatering** — først når brukeren har
   fått index.html med denne nye registreringskoden, blir ALLE senere
   oppdateringer automatiske uten manuell lukk/åpne.
