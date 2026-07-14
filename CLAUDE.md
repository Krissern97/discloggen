# Discloggen — disc golf treningslogg (PWA)

Treningsapp for disc golf: logg kast med GPS og se statistikk på lengde og retning,
per disc og globalt. Basert på oppsettet fra Dartloggen (se `APP-OPPSETT-MAL.md`),
men delt i moduler i stedet for én fil.

## Arkitektur

- **Vanilla JS, ingen byggesteg.** ES-moduler rett i nettleseren. Deploy = push
  til GitHub Pages.
- **Eksterne avhengigheter: Leaflet** (`vendor/leaflet/`, vendoret lokalt — ikke
  lastet fra CDN ved kjøretid) for kartvalg, se «Kartvalg», **+ Open-Meteo** for
  live vær, se «Vær» — begge gratis, ingen API-nøkkel/konto. Alt annet er
  fortsatt egenskrevet, ingen andre biblioteker/rammeverk.
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
js/geo.js       haversine, peiling, decompose (side/frem), målemodal (med live GPS-
                minikart, se «GPS»), simulert GPS
js/session.js   treningsflyt: økt → disc-utvalg → runder → kast (pend) → instant
                landing (throws), kontinuerlig GPS-fiks, samme-sted/nytt-sted ny
                runde, «Kast alle», vind-chip, vær-chip, live kart underveis
js/discs.js     disc-CRUD + kamerabilde med sirkulær visningsflate (kvadratisk
                256×256-raster under, se «Bilder»), sår startdiscer ved fersk install,
                sorterbar liste (type/speed/lengste/presisjon)
js/stats.js     KPI-er, spredningskart/målskive (SVG, markørene bruker discens
                bilde som ikon når det finnes, valgfritt varmekart), disctype-filter,
                sorterbar per-disc-oversikt, disc-detalj med trendgrafer,
                økthistorikk, rundefaner, vindfilter
js/mapaim.js    kartvalg: siktepunkt/mål, startpunkt, og «se/juster kart underveis
                i økten» (Leaflet + Esri-satellittfliser), se «Kartvalg»
js/weather.js   live værdata under trening (Open-Meteo), se «Vær»
vendor/leaflet/ Leaflet 1.9.4, vendoret lokalt (ikke CDN)
sw.js           service worker — BUMP `CACHE`-versjonen ved HVER deploy
```

## Datamodell (HELLIG etter første deploy — aldri rename uten migrering)

- `disc_discs`: `[{id, navn, type, sp, gl, tu, fa, ci, img, ark, ts}]`
  — `ci` = fast fargeindeks 0–7, `img` = dataURL 256×256, `ark` = arkivert
- `disc_sessions`: `[{id, ts, end, sm, rounds:[{ts, start, aim, wind?, pend, throws}]}]`
  — en **runde** = ett kast+hent-slag fra ett kastested (`ts` = når runden startet).
  `start`/`aim`: `{la, lo, acc}` | null (`acc` er `null` for `aim` satt via
  kartvalg — se «Kartvalg», ellers alltid et GPS-nøyaktighetstall). `pend`: kastet men ikke hentet
  (`{id, discId, kt, ts}`). `throws`: `{id, discId, kt, dist, side, frem, acc, ts, pos}`.
  `kt` = "BH"/"FH". `side` = meter fra siktelinja (+høyre/−venstre), null uten siktepunkt.
  `wind`: `{d, s}` | undefined — se «Vind».
- `disc_current`: pågående økt, lagres fortløpende (overlever reload). I tillegg
  til feltene over har den `discSel: [discId, …]` — discene valgt for DENNE
  økten (se «Disc-utvalg»). Eldre pågående økter uten feltet viser alle discer,
  som før funksjonen fantes.
- `disc_settings`: `{theme, lyd, kt, demo, seeded}` — `seeded`: startdiscer er forsøkt sådd
  (kun ved fersk install, se «Onboarding»)

## Kjerneflyt (treningsmodus)

To økttyper (`sm`): **Lengdeøkt ("L")** og **Presisjonsøkt ("P")**. En økt inneholder
én eller flere **runder** (`S.cur.rounds`); en runde er ett kast+hent-slag fra ett
kastested — f.eks. kast 20 discer, gå og hent dem, det er én runde.

1. «Start økt» → **velg discer for økten** (`pickDiscsForSession()`, forhåndsvalgt
   med forrige økts utvalg via `S.set.lastDiscSel`, eller alle aktive discer på
   fersk install) → GPS-måling av kastested (deliberat, `measurePoint`) → siktepunkt
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
Hovedsidens spredningskart kan i tillegg filtreres på disctype (`discTypeFilter`
— Alle/Putter/Midrange/Fairway/Driver, kun dette kartet, ikke resten av siden)
og byttes til et **varmekart** (`heatmapMode`, `toggle-heatmap`) — et rutenett
fargelagt etter kast-tetthet (`heatmapSVG()`, `var(--green)` med varierende
`fill-opacity` — sekvensiell éncoding fordi hensikten er MENGDE, ikke hvilken
disc) i stedet for enkelt-markører, siden hundrevis av kast med disc-bilder
fort blir uleselig rotete. Tooltip-lytteren matcher nå `[data-tip]` generelt
(ikke bare `circle[data-tip]`) så både vanlige markører og varmekart-ruter
kan trykkes for detaljer.
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

## Disc-utvalg og sortering i kasteøkta

- **`S.cur.discSel`** — discene valgt for aktiv økt (array av id-er), satt ved
  øktstart og redigerbar når som helst via «🎒 Discer (N)»-knappen i live-
  visningen (`pickDiscsForSession()`/`paintDiscSel()` i session.js, delt modal
  `#m-discsel`). Kastegridet viser KUN valgte (og aktive/ikke-arkiverte) discer
  — hensikten er å slippe å bla forbi hele biblioteket for å finne discen man
  faktisk skal kaste. Siste utvalg huskes (`S.set.lastDiscSel`) som forslag
  neste økt, så man vanligvis bare trykker «Ferdig» uten å endre noe.
- **Sortering i kasteskjermen** er en tredje, egen sortering (`trainDiscSort` i
  session.js, «↕️»-knappen ved siden av disc-utvalget) — Type/Speed/Navn, atskilt
  fra både Discer-fanens (`discsSort`) og Statistikk-fanens (`discSort`)
  sortering, siden alle tre har ulikt formål (rask kaste-tilgang vs. bla i
  biblioteket vs. sammenligne prestasjon).
- **«Kast alle»** (`logThrowAll()`, kun i Kaster-modus, vises når 2+ discer er
  valgt) logger ett `pend`-kast for HVER disc i gjeldende utvalg/sortering med
  ett trykk — for når man kaster hele bagen i sekvens før man går og henter.
  Samme undo-snapshot som enkelttrykk.

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
  nå fritt siden touch-action ikke lenger blokkerer det). `renderTrain()` lagrer
  og gjenoppretter `.discgrid`s `scrollTop` rundt hvert `innerHTML`-bytte —
  ellers hopper visningen til toppen på hvert eneste disc-trykk, siden et helt
  nytt grid-element (med scrollTop 0) lages hver gang.
- Trykk-feedback: gullring + `vibrate(18)` på alle `data-act`-trykk.
- Kart-tooltip (trykk et punkt for lengde/dato) bruker samme `click`-mønster
  (egen delegert lytter i stats.js, uavhengig av `data-act`-systemet).
- **Trykk utenfor arket lukker modalen** — kun på `#m-session` (økt-/disc-
  detalj): en delegert `click`-lytter i stats.js sjekker `e.target.id ===
  "m-session"` (altså selve bakgrunnen, ikke `.sheet`-barnet) og lukker.
  Bevisst IKKE på andre modaler (skjema/GPS-måling/kartvalg/vind) — der skal
  et feiltrykk aldri kunne slette en påbegynt handling ved et uhell.
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
    referanseramme, så presisjon prioriteres over hastighet her. Modalen viser
    i tillegg et lite, PASSIVT (ingen pan/zoom — `dragging:false` osv.)
    satellittkart (`#ms-map`, `updateMeasMap()`) som oppdateres for hver fiks —
    en rask visuell bekreftelse på at GPS-en faktisk plasserer deg der du står,
    ikke bare et nøyaktighetstall. Vises først når første fiks kommer inn
    (`#ms-map:empty{display:none}`), lukkes/ryddes via `closeMeasMap()`.
  - **Kast/landing** (høyfrekvent, opptil ~40 trykk per runde): kontinuerlig
    `watchPosition` fra øktstart (`startGpsWatch()` i session.js) holder `gpsFix`
    oppdatert i bakgrunnen. Et trykk på en disc i hentemodus bruker `gpsFix` direkte,
    uten å vente — hastighet prioriteres over ceremoni her.
- GPS-chippen (`gpsChipHTML()`) oppdateres målrettet via `outerHTML`-bytte på hver
  `watchPosition`-tikk, IKKE full `rerender()` — unngår DOM-churn og bevarer
  `#flash`-elementet (som ligger utenfor `#v-train` nettopp for å overleve rerender).
- Wake Lock holder skjermen våken under økt (re-request ved `visibilitychange`).

## Vind

- Logges **per runde** (`r.wind = {d, s}`), IKKE per økt — retningen er relativ
  til kasteretningen (motvind/medvind/side), og den snur når man kaster tilbake
  andre veien i en ny runde. `d`: `"mot"|"med"|"hoyre"|"venstre"|"stille"`
  (hoyre/venstre = sidevind FRA den siden), `s`: 1–4 (svak/middels/sterk/ORKAN,
  utelates for stille). Ordbøker + `fmtWind()` i util.js er eneste kilde til
  etiketter/piler.
- **Aldri prompting**: settes kun via 🚩-chippen (`windChipHTML()` i session.js,
  til venstre for GPS-chippen) → modal `m-wind` med retningsknapper + styrke-seg.
  Retningsvalg gir standard styrke «middels» til noe annet velges. Ny runde
  (både «samme sted» og «nytt sted») **arver forrige rundes vind** — brukeren
  endrer bare når forholdene faktisk endrer seg.
- `allThrows()` kobler rundens `wind` på hvert kast (som med `sm`/`sessId`).
  Statistikk: eget vindfilter-seg (Alle/Mot/Med/Side/Stille — «Side» matcher
  begge sidene; kast uten logget vind vises kun under «Alle»), vises bare når
  minst ett kast har vind. «Vind-effekt»-kort (`windEffectHTML`) viser snitt/maks
  (L) og snitt bom (P) per retning — kun i «All vind»-visning og først når 2+
  retninger har data. Øktlisten og øktdetaljen viser øktas vind
  (`sessionWindText`: «varierende vind» hvis rundene spriker).

## Vær

- **`js/weather.js`** — live værdata (temperatur, nedbør, vindstyrke/-retning)
  fra **Open-Meteo** (gratis, ingen API-nøkkel/konto), vist som en chip til
  VENSTRE for vind-chippen (`weatherChipHTML()` i chip-raden i `liveHTML()`).
  Hentes én gang ved øktstart (`startWeather()`, basert på kastestedets
  koordinater) og friskes hvert 15. minutt mens økten pågår
  (`startWeather`/`stopWeather` følger samme livssyklus som `gpsWatch`/
  `wakeLock` — startes i `startSession()`/`resumeSession()`, stoppes i
  `finishSession()`).
- **Rent visningsformål — lagres ALDRI i statistikken** og påvirker aldri
  🚩-vindflagget. Flagget forblir en fullstendig separat, subjektiv vurdering
  brukeren selv setter (se «Vind») — værdataen er bare konteksten man ser mens
  man vurderer, appen kobler dem aldri sammen automatisk.

## Kartvalg (siktepunkt, startpunkt, og live under økten)

- **`js/mapaim.js`** — delt Leaflet-modal (`#m-mapaim`) med **tre modi**, styrt
  av modul-variabelen `mode`:
  - `pickAimOnMap(origin)` — sett siktepunkt/mål ved å trykke/dra en markør,
    kastested vises fast som referanse (▲). Kun **lengdeøkt** — presisjonsøktens
    mål går fortsatt alltid via fysisk måling (`measurePoint`), siden nøyaktighet
    der bør prioriteres over hastighet.
  - `pickStartOnMap(title, center)` — sett kastested/startpunkt på kartet i
    stedet for å GPS-måle det (tilbys som «🗺️ Velg på kart» fra selve
    målemodalen, `measure-map`-handlingen i geo.js).
  - `reviewOnMap(start, aim, liveFixGetter)` — **kart underveis i økten**
    («🗺️ Kart»-knappen i live-visningen, `openLiveMap()` i session.js): viser
    BÅDE kastested og siktepunkt/mål som dragbare markører (for å justere om
    noe ble feil, uten å måle på nytt fra bunnen) PLUSS et levende «du er
    her»-punkt (blå prikk, `.mapmark-live`) som polles hvert 3. sekund fra den
    kontinuerlige GPS-en som allerede kjører (`gpsFix` — starter INGEN ny
    posisjonsforespørsel). Alle tre modi deler samme `finish()`/action-par
    (`mapaim-use`/`mapaim-cancel`), som grener på `mode` for å bygge riktig
    resultat-objekt.
  Alle tre returnerer `Promise<...|null>`, samme async-mønster som
  `measurePoint()`.
- **Leaflet** (vendoret i `vendor/leaflet/`) + **Esri World Imagery**-fliser
  (gratis, ingen API-nøkkel, hentes fra `server.arcgisonline.com` ved kjøretid).
  Valgt fremfor Google Maps (krever API-nøkkel + betalingskort-bundet
  Cloud-konto — bryter med at appen ikke krever konto) og fremfor å åpne
  telefonens native kartapp (kan ikke bygges inn med trykk-for-å-plassere).
- **Eneste unntak fra full offline-støtte**: selve kartbibliotek-filene er
  cachet av service workeren som alt annet, men de FAKTISKE flisbildene
  (satellittbildene) må hentes fra nett der og da — kan ikke forhåndslagres
  for ukjente steder. Uten nett viser kartmodalen seg, men uten bilder.
- Markørene er `L.divIcon` med emoji (▲ for kastested; 📍 tegnestift for
  siktepunkt/startpunkt/valgbare punkter i review-modus — IKKE en dartskive:
  en pin har et entydig «punkt», spissen nederst, som skal treffe koordinaten,
  det har ikke en symmetrisk sirkel. `iconAnchor` er derfor satt til spissen
  (`[14,27]` av `[28,28]`), ikke senter — en tidligere versjon brukte 🎯 med
  senter-anchor, som visuelt så ut til å treffe et annet sted enn trykket).
  Ikke Leaflets standard-markørbilder, så ingen ekstra ikon-filer å vendorere.
  `#mapaim-map` må ha eksplisitt størrelse FØR `L.map()` initialiseres (ellers
  blir fliskartet feilberegnet) — derfor venter alle tre pick-funksjonene to
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
